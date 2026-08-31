// ===========================================
// POST /api/otp/send — text a 6-digit code
// ===========================================
// Runs BEFORE any lead is written, in both /book arms. Nothing here creates a
// WebsiteLead, sends the instant lead SMS, or notifies the owner: those all
// move to after verification.

import { NextRequest, NextResponse } from 'next/server'
import Telnyx from 'telnyx'
import { db } from '@/lib/db'
import { validateUsMobile } from '@/lib/phone-utils'
import { rateLimit, getClientIp } from '@/lib/rate-limit'
import { notifyOwnerOfMarketingEvent } from '@/lib/marketing-funnel'
import { isTestPhone } from '@/lib/test-allowlist'
import { VARIANT_COOKIE, VISITOR_COOKIE } from '@/lib/variant'
import { FUNNEL_VARIANT_COOKIE } from '@/lib/funnel-variant'
import {
  generateCode, hashCode, checkSendCaps, globalSendCount,
  OTP_TTL_MS, OTP_GLOBAL_ALERT_AT,
} from '@/lib/otp'
import { logFunnelEvent } from '@/lib/funnel-log'

export const dynamic = 'force-dynamic'

/**
 * Below this, a submission did not come from someone reading the page. Chosen
 * low on purpose: a fast returning visitor with autofill can be quick, and a
 * false positive here costs a real lead.
 */
const MIN_FORM_FILL_MS = 2000

function codeMessage(code: string): string {
  return `${code} is your Align & Acquire verification code. It expires in 10 minutes.`
}

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request)
    // Cheap in-process burst guard. The REAL caps are counted from the database
    // in checkSendCaps, because this one is per-lambda and cannot be trusted.
    if (!rateLimit(`otp-send:${ip}`, 12, 60_000).allowed) {
      return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })
    }

    const body = (await request.json()) as {
      phone?: string
      hp_ref?: string
      website?: string
      formElapsedMs?: number
    }

    const variantForTrap = request.cookies.get(VARIANT_COOKIE)?.value ?? null
    const funnelForTrap = request.cookies.get(FUNNEL_VARIANT_COOKIE)?.value ?? null
    const visitorForTrap = request.cookies.get(VISITOR_COOKIE)?.value ?? null

    // Bot traps run BEFORE the send, not at the lead write: a script that gets
    // this far would otherwise burn real Telnyx credit and eat the global cap
    // before anything rejected it.
    //
    // Returns 200 with no verificationId, matching the gate's contract. The
    // client treats a missing id as a hard failure, so a human who somehow
    // trips this sees a retry rather than being walked through a funnel that
    // silently saves nothing.
    const trap = typeof body.hp_ref === 'string' ? body.hp_ref : body.website
    const tooFast =
      typeof body.formElapsedMs === 'number' &&
      Number.isFinite(body.formElapsedMs) &&
      body.formElapsedMs >= 0 &&
      body.formElapsedMs < MIN_FORM_FILL_MS
    if ((typeof trap === 'string' && trap.trim() !== '') || tooFast) {
      console.warn(
        `[otp] BOT blocked ip=${ip} ` +
          `reason=${trap && trap.trim() ? 'honeypot' : 'too_fast'} elapsed=${body.formElapsedMs ?? 'n/a'}`
      )
      void logFunnelEvent({
        name: 'honeypot_blocked',
        step: 'honeypot_blocked',
        visitorId: visitorForTrap,
        variant: variantForTrap,
        funnelVariant: funnelForTrap,
      })
      return NextResponse.json({ success: false, blocked: true }, { status: 200 })
    }

    // US mobile only. This is a fraud control, not just input polish: it is what
    // keeps the send list off international premium-rate ranges.
    const check = validateUsMobile(body.phone)
    if (!check.ok) {
      return NextResponse.json({ error: check.reason, field: 'phone' }, { status: 400 })
    }
    const phone = check.e164

    const gate = await checkSendCaps(phone, ip)
    if (!gate.allowed) {
      console.warn(`[otp] BLOCKED phone=${phone} ip=${ip} cap=${gate.code}`)
      return NextResponse.json(
        { error: gate.reason, cap: gate.code },
        { status: 429, headers: { 'Retry-After': String(gate.retryAfterSeconds) } }
      )
    }

    const variant = request.cookies.get(VARIANT_COOKIE)?.value ?? null
    const funnelVariant = request.cookies.get(FUNNEL_VARIANT_COOKIE)?.value ?? null
    const visitorId = request.cookies.get(VISITOR_COOKIE)?.value ?? null
    const isTest = isTestPhone(phone)
    const tag = isTest ? ' test=true' : ''

    const code = generateCode()
    const row = await db.phoneVerification.create({
      data: {
        phone,
        codeHash: hashCode(code, phone),
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
        visitorId, variant, funnelVariant, ip,
      },
    })

    const from = process.env.MARKETING_TELNYX_NUMBER || null
    if (!from || !process.env.TELNYX_API_KEY) {
      // Dev and misconfigured prod. The row still exists so the flow is
      // walkable end to end; the code is only logged when there is no sender,
      // never in normal operation.
      console.warn(
        `[otp] SEND SKIPPED (no sender) phone=${phone} verificationId=${row.id} ` +
          `MARKETING_TELNYX_NUMBER=${from ? 'set' : 'MISSING'} ` +
          `TELNYX_API_KEY=${process.env.TELNYX_API_KEY ? 'set' : 'MISSING'}${tag}` +
          (process.env.NODE_ENV === 'production' ? '' : ` devCode=${code}`)
      )
    } else {
      try {
        const telnyx = new Telnyx({ apiKey: process.env.TELNYX_API_KEY })
        const res = await telnyx.messages.send({ from, to: phone, text: codeMessage(code) })
        const providerId = (res as { data?: { id?: string } })?.data?.id ?? 'unknown'
        console.log(`[otp] SENT phone=${phone} verificationId=${row.id} providerId=${providerId}${tag}`)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error(`[otp] FAILED phone=${phone} verificationId=${row.id} error=${message}${tag}`)
        return NextResponse.json({ error: 'Could not send the code. Try again.' }, { status: 502 })
      }
    }

    void logFunnelEvent({ name: 'otp_sent', step: 'otp_sent', visitorId, variant, funnelVariant })

    // Volume alarm. Fires on the send that crosses the line; approximate under
    // concurrency, which is fine for an alert whose job is "look at this now".
    const total = await globalSendCount()
    if (total === OTP_GLOBAL_ALERT_AT) {
      void notifyOwnerOfMarketingEvent({
        subject: `OTP volume alert: ${total} codes sent in 24h`,
        html: `<h2>Verification volume is high</h2>
               <p>${total} codes sent in the last 24 hours. The hard cap is ${'200'}.</p>
               <p>If this is not real traffic, someone is burning Telnyx credit on the /book funnel.</p>`,
      }).catch(() => {})
    }

    return NextResponse.json({ success: true, verificationId: row.id })
  } catch (error) {
    console.error('[otp] send failed:', error)
    return NextResponse.json({ error: 'Could not send the code. Try again.' }, { status: 500 })
  }
}
