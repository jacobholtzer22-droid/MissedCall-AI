// ===========================================
// /book — GATED DEMO FUNNEL, A/B: gate vs nogate
// ===========================================
// Server component. Three jobs before render:
//   1. Resolve (or assign) the A/B arm and pin it in an httpOnly cookie so a
//      visitor never flips mid-funnel. `?v=gate` / `?v=nogate` forces an arm.
//   2. Issue an opaque visitor id, which ties the coupon claim and the lead
//      record to one browser.
//   3. Resolve the gate cookie so the booking wizard can skip questions the
//      visitor already answered.
//
// Cookies are written here rather than in middleware because the assignment has
// to happen on the same request that renders, or the first pageview would be
// unassigned.

import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import BookFunnelClient, { type InitialGate } from './BookFunnelClient'
import FormFirstClient from './FormFirstClient'
import { GATE_COOKIE } from './constants'
import { VARIANT_COOKIE, VISITOR_COOKIE, assignVariant, isVariant, isLiveVariant, variantFromQuery, type Variant } from '@/lib/variant'
import { claimCoupon, toState, type CouponState } from '@/lib/coupon'
import {
  FUNNEL_VARIANT_COOKIE,
  assignFunnelVariant,
  isFunnelVariant,
  funnelVariantFromQuery,
} from '@/lib/funnel-variant'

export const dynamic = 'force-dynamic'

async function resolveGate(leadId: string | undefined): Promise<InitialGate> {
  if (!leadId) return null
  try {
    const lead = await db.websiteLead.findUnique({
      where: { id: leadId },
      select: { id: true, name: true, phone: true, email: true, message: true },
    })
    if (!lead?.phone) return null
    const trade = lead.message?.match(/^Trade: (.+)$/m)?.[1]?.trim() ?? ''
    // Company is parsed back out of the lead body so the booking wizard can
    // skip a question the gate already asked. The body is the only place it is
    // stored: WebsiteLead has no company column.
    const company = lead.message?.match(/^Company: (.+)$/m)?.[1]?.trim() ?? ''
    return {
      leadId: lead.id,
      name: lead.name,
      phone: lead.phone,
      trade,
      company,
      email: lead.email ?? '',
    }
  } catch (err) {
    // A cookie or database hiccup must never take the funnel down. Fall back to
    // the ungated path, which asks for everything.
    console.error('[book] gate resolve failed:', err)
    return null
  }
}

export default async function BookPage({
  searchParams,
}: {
  searchParams: { v?: string; variant?: string; debug?: string; resumed?: string }
}) {
  const cookieStore = await cookies()

  // Cookies are assigned in middleware, not here: Next.js forbids
  // cookies().set() during a server component render. Middleware forwards the
  // freshly assigned values on the same request, so this read sees them.
  //
  // The fallbacks exist so the page still renders if middleware ever did not
  // run for this request. An unpersisted arm is far better than a crash.
  const forced = variantFromQuery(searchParams?.v)
  const fromCookie = cookieStore.get(VARIANT_COOKIE)?.value
  const keepExisting = isVariant(fromCookie) && isLiveVariant(fromCookie)
  const variant: Variant = forced ?? (keepExisting ? fromCookie : assignVariant())

  // Middleware assigns and persists this. The fallback keeps the page rendering
  // if middleware ever did not run for the request.
  const cookieFunnel = cookieStore.get(FUNNEL_VARIANT_COOKIE)?.value
  const funnelVariant =
    funnelVariantFromQuery(searchParams?.variant) ??
    (isFunnelVariant(cookieFunnel) ? cookieFunnel : assignFunnelVariant())

  const initialGate = await resolveGate(cookieStore.get(GATE_COOKIE)?.value)

  // The 24h window starts on first pageview, no button and no user action.
  // claimCoupon is idempotent: it returns the existing claim rather than
  // issuing a new one, so re-rendering can never extend the deadline.
  //
  // Resolved server-side on purpose. Fetching it client-side would mean the
  // countdown pops in after paint, and it has to be readable the moment they
  // land.
  let coupon: CouponState = { status: 'none' }
  const visitorId = cookieStore.get(VISITOR_COOKIE)?.value
  if (visitorId) {
    try {
      coupon = toState(await claimCoupon(visitorId, variant))
    } catch (err) {
      // A coupon failure must never take the funnel down. Full price, no banner.
      console.error('[book] auto-claim failed:', err)
    }
  }

  // Arm B is a different page at the same URL, not a variation of arm A.
  if (funnelVariant === 'B') {
    return <FormFirstClient initialGate={initialGate} variant={variant} funnelVariant={funnelVariant} />
  }

  return (
    <BookFunnelClient
      initialGate={initialGate}
      variant={variant}
      funnelVariant={funnelVariant}
      coupon={coupon}
      resumed={searchParams?.resumed === '1'}
    />
  )
}
