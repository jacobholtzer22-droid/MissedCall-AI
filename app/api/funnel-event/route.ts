// ===========================================
// FUNNEL EVENT — first-party per-screen analytics
// ===========================================
// The site's only analytics is the Meta pixel, and pixel custom events cannot
// be queried from here. Drop-off per gate screen is the whole point of the step
// wizard, so it is recorded first-party as well as fired to Meta.
//
// Deliberately thin and PII-free: which screen was completed, by which opaque
// visitor, in which arms. Join to WebsiteLead on visitorId for the person.

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { rateLimit, getClientIp } from '@/lib/rate-limit'
import { VARIANT_COOKIE, VISITOR_COOKIE } from '@/lib/variant'
import { FUNNEL_VARIANT_COOKIE } from '@/lib/funnel-variant'
import { logArmView } from '@/lib/arm-log'

export const dynamic = 'force-dynamic'

// Landing views are counted here as well as in the pixel: /api/admin/funnel-ab
// needs a denominator it can query, and pixel data cannot be read back.
// otp_* are written from the server too (lib/funnel-log.ts) because a capped
// send or a failed verify must be recorded whether or not the browser reports.
const ALLOWED_NAMES = [
  'landing_view',
  'gate_step_completed', 'gate_opened', 'gate_abandoned', 'video_unlocked', 'honeypot_blocked',
  'otp_sent', 'otp_verified', 'otp_failed',
  'form_submitted', 'thanks_view',
  'gate_exit_not_a_fit',
]
const ALLOWED_STEPS = [
  'landing',
  'trade', 'phone', 'firstName', 'lastName', 'company', 'email', 'complete', 'honeypot_blocked',
  'otp_sent', 'otp_verified', 'otp_failed',
  'name', 'businessName', 'mobile', 'form', 'thanks',
]

export async function POST(request: NextRequest) {
  // Generous: this fires several times per genuine visitor.
  const limit = rateLimit(`funnel-event:${getClientIp(request)}`, 60, 60_000)
  if (!limit.allowed) return NextResponse.json({ ok: false }, { status: 429 })

  try {
    const body = (await request.json()) as { name?: string; step?: string; metadata?: unknown }
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!ALLOWED_NAMES.includes(name)) {
      // Reject unknown names rather than letting anyone write arbitrary rows.
      return NextResponse.json({ ok: false, error: 'unknown event' }, { status: 400 })
    }
    const step = typeof body.step === 'string' && ALLOWED_STEPS.includes(body.step.trim())
      ? body.step.trim()
      : null

    if (name === 'landing_view') {
      // The arm ledger is what /admin/arms divides by. Written here rather than
      // in the page so it counts real browser loads, not prefetches or bots
      // that never execute JS.
      void logArmView({
        arm: request.cookies.get(FUNNEL_VARIANT_COOKIE)?.value ?? null,
        visitorId: request.cookies.get(VISITOR_COOKIE)?.value ?? null,
      })
    }

    await db.funnelEvent.create({
      data: {
        name,
        step,
        visitorId: request.cookies.get(VISITOR_COOKIE)?.value ?? null,
        variant: request.cookies.get(VARIANT_COOKIE)?.value ?? null,
        funnelVariant: request.cookies.get(FUNNEL_VARIANT_COOKIE)?.value ?? null,
        metadata:
          body.metadata && typeof body.metadata === 'object'
            ? (body.metadata as object)
            : undefined,
      },
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    // Analytics must never break the funnel. Swallow and move on.
    console.error('[funnel-event] failed:', err)
    return NextResponse.json({ ok: false }, { status: 200 })
  }
}
