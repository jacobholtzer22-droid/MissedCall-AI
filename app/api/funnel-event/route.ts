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

export const dynamic = 'force-dynamic'

const ALLOWED_NAMES = ['gate_step_completed', 'gate_opened', 'gate_abandoned', 'video_unlocked', 'honeypot_blocked']
const ALLOWED_STEPS = ['trade', 'phone', 'firstName', 'lastName', 'company', 'email', 'complete', 'honeypot_blocked']

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
