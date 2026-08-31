// ===========================================
// POST /api/otp/verify — check the 6-digit code
// ===========================================
// Success returns a verificationId. That id is a SINGLE-USE ticket the
// lead-write routes redeem via consumeVerification(); it is not proof on its
// own, which is why the routes re-check it server-side rather than trusting a
// client flag.

import { NextRequest, NextResponse } from 'next/server'
import { validateUsMobile } from '@/lib/phone-utils'
import { rateLimit, getClientIp } from '@/lib/rate-limit'
import { verifyCode } from '@/lib/otp'
import { VARIANT_COOKIE, VISITOR_COOKIE } from '@/lib/variant'
import { FUNNEL_VARIANT_COOKIE } from '@/lib/funnel-variant'
import { logFunnelEvent } from '@/lib/funnel-log'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request)
    if (!rateLimit(`otp-verify:${ip}`, 30, 60_000).allowed) {
      return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })
    }

    const body = (await request.json()) as { phone?: string; code?: string }
    const check = validateUsMobile(body.phone)
    if (!check.ok) return NextResponse.json({ error: check.reason, field: 'phone' }, { status: 400 })

    const code = typeof body.code === 'string' ? body.code.replace(/\D/g, '') : ''
    if (code.length !== 6) {
      return NextResponse.json({ error: 'Enter the 6-digit code.', field: 'code' }, { status: 400 })
    }

    const variant = request.cookies.get(VARIANT_COOKIE)?.value ?? null
    const funnelVariant = request.cookies.get(FUNNEL_VARIANT_COOKIE)?.value ?? null
    const visitorId = request.cookies.get(VISITOR_COOKIE)?.value ?? null

    const outcome = await verifyCode(check.e164, code)
    if (!outcome.ok) {
      console.warn(`[otp] VERIFY FAILED phone=${check.e164} reason=${outcome.code}`)
      void logFunnelEvent({ name: 'otp_failed', step: 'otp_failed', visitorId, variant, funnelVariant })
      return NextResponse.json({ error: outcome.reason, code: outcome.code }, { status: 400 })
    }

    console.log(`[otp] VERIFIED phone=${check.e164} verificationId=${outcome.verificationId}`)
    void logFunnelEvent({ name: 'otp_verified', step: 'otp_verified', visitorId, variant, funnelVariant })
    return NextResponse.json({ success: true, verificationId: outcome.verificationId })
  } catch (error) {
    console.error('[otp] verify failed:', error)
    return NextResponse.json({ error: 'Could not check that code. Try again.' }, { status: 500 })
  }
}
