// ===========================================
// /calendar — standalone booking page
// ===========================================
// No gate, no OTP, no video. Two modes, decided entirely by the ?l= token:
//
//   direct    nobody knows who this is. Slots first, then four fields. No pixel,
//             no Meta events — this traffic is cold and unattributed, and
//             counting it as an ad conversion would poison the optimisation.
//   prefilled a lead we texted. Name, business and cell come from the row; we
//             ask only for the email. Schedule fires with their event_id.
//
// EVERY token failure lands in direct mode. A stale link must never show an
// error to someone trying to give us money.

import { cookies } from 'next/headers'
import type { Metadata } from 'next'
import { db } from '@/lib/db'
import CalendarClient, { type CalendarPrefill } from './CalendarClient'
import { verifyLeadToken } from '@/lib/lead-token'
import { getMarketingBusiness } from '@/lib/marketing-funnel'
import { VISITOR_COOKIE } from '@/lib/variant'
import { getClaimForVisitor, toState, type CouponState } from '@/lib/coupon'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Book a Time',
  description: 'Pick a 15 minute slot with Jacob from Align and Acquire.',
  robots: { index: false, follow: false },
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: { l?: string; slot?: string }
}) {
  let prefill: CalendarPrefill = { mode: 'direct', firstName: '', businessName: '', phone: '', email: '' }
  let coupon: CouponState = { status: 'none' }

  const verdict = verifyLeadToken(searchParams?.l)
  if (verdict.ok) {
    try {
      const business = await getMarketingBusiness()
      const lead = business
        ? await db.websiteLead.findFirst({
            where: { id: verdict.leadId, businessId: business.id },
            select: { id: true, name: true, phone: true, email: true, message: true },
          })
        : null
      if (lead) {
        prefill = {
          mode: 'prefilled',
          leadToken: searchParams?.l ?? '',
          firstName: (lead.message?.match(/^First name: (.+)$/m)?.[1] ?? lead.name ?? '').trim(),
          businessName: lead.message?.match(/^Company: (.+)$/m)?.[1]?.trim() ?? '',
          phone: lead.phone ?? '',
          email: lead.email ?? '',
        }
      }
      // An unknown id is not an error: the lead may have been deleted. Direct
      // mode still books them.
    } catch (err) {
      console.error('[calendar] lead lookup failed, falling back to direct:', err)
    }
  } else if (searchParams?.l) {
    console.warn(`[calendar] token rejected reason=${verdict.reason}, serving direct mode`)
  }

  // Coupon only in prefilled mode: a direct visitor has no 24h window running,
  // and inventing one here would make the countdown mean nothing.
  if (prefill.mode === 'prefilled') {
    const visitorId = (await cookies()).get(VISITOR_COOKIE)?.value
    if (visitorId) {
      try {
        coupon = toState(await getClaimForVisitor(visitorId))
      } catch (err) {
        console.error('[calendar] coupon read failed:', err)
      }
    }
  }

  return <CalendarClient prefill={prefill} coupon={coupon} preselectIso={searchParams?.slot ?? null} />
}
