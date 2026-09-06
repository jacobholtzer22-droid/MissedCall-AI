// ===========================================
// POST /api/otp/call — read the code out over the phone
// ===========================================
// The recovery path for a number that cannot receive a text: landlines, and the
// handful of VoIP numbers that accept a message and never deliver it.
//
// A NEW code is minted rather than reusing the one that was texted. The stored
// value is a hash and cannot be reversed, and re-hashing is cheaper and safer
// than keeping plaintext around on the send path for a call that may never be
// requested.
//
// The plaintext lives on the row in voiceCode until the webhook has spoken it,
// then it is cleared. See the column comment in schema.prisma for why it is not
// carried in Telnyx client_state instead.

import { NextRequest, NextResponse } from 'next/server'
import Telnyx from 'telnyx'
import { db } from '@/lib/db'
import { rateLimit, getClientIp } from '@/lib/rate-limit'
import { generateCode, hashCode, OTP_TTL_MS } from '@/lib/otp'
import { logFunnelEvent } from '@/lib/funnel-log'
import { VARIANT_COOKIE, VISITOR_COOKIE } from '@/lib/variant'
import { FUNNEL_VARIANT_COOKIE } from '@/lib/funnel-variant'

export const dynamic = 'force-dynamic'

/** A second tap inside this window rings nobody twice. */
const REDIAL_COOLDOWN_MS = 60_000

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request)
    if (!rateLimit(`otp-call:${ip}`, 4, 10 * 60_000).allowed) {
      return NextResponse.json({ error: 'Too many call requests. Give it a minute.' }, { status: 429 })
    }

    const body = (await request.json()) as { verificationId?: string }
    const id = body.verificationId?.trim() ?? ''
    if (!id) return NextResponse.json({ error: 'Missing verification.' }, { status: 400 })

    const row = await db.phoneVerification.findUnique({ where: { id } })
    if (!row) return NextResponse.json({ error: 'That verification has expired. Start again.' }, { status: 404 })
    if (row.consumedAt) return NextResponse.json({ error: 'Already verified.' }, { status: 409 })

    if (row.voiceCalledAt && Date.now() - row.voiceCalledAt.getTime() < REDIAL_COOLDOWN_MS) {
      // Not an error to the visitor: the call is already on its way.
      return NextResponse.json({ ok: true, alreadyCalling: true })
    }

    const from = process.env.MARKETING_TELNYX_NUMBER
    const connectionId = process.env.TELNYX_CONNECTION_ID
    const apiKey = process.env.TELNYX_API_KEY
    if (!from || !connectionId || !apiKey) {
      console.error(
        `[otp-call] NOT CONFIGURED from=${from ? 'set' : 'MISSING'} ` +
          `connection=${connectionId ? 'set' : 'MISSING'} key=${apiKey ? 'set' : 'MISSING'}`
      )
      return NextResponse.json({ error: 'Could not place the call. We will reach out instead.' }, { status: 503 })
    }

    // New code, new clock. The visitor is starting this leg from scratch.
    const code = generateCode()
    await db.phoneVerification.update({
      where: { id: row.id },
      data: {
        codeHash: hashCode(code, row.phone),
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
        attempts: 0,
        voiceCode: code,
        voiceCalledAt: new Date(),
      },
    })

    try {
      const telnyx = new Telnyx({ apiKey })
      // `dial`, matching the forwarding leg in the voice webhook. The SDK's
      // types do not cover client_state here, same as there.
      await telnyx.calls.dial({
        connection_id: connectionId,
        to: row.phone,
        from,
        timeout_secs: 30,
        // Only the row id travels through Telnyx. The code does not.
        client_state: Buffer.from(JSON.stringify({ otpVerificationId: row.id })).toString('base64'),
      } as never)
      console.log(`[otp-call] DIALING phone=${row.phone} verificationId=${row.id}`)
    } catch (err) {
      console.error(`[otp-call] FAILED phone=${row.phone} verificationId=${row.id}:`, err)
      // Clear the plaintext: no call is coming, so nothing should hold it.
      await db.phoneVerification
        .update({ where: { id: row.id }, data: { voiceCode: null, voiceCalledAt: null } })
        .catch(() => {})
      return NextResponse.json({ error: 'Could not place the call. We will reach out instead.' }, { status: 502 })
    }

    void logFunnelEvent({
      name: 'otp_voice_call',
      step: 'otp_sent',
      visitorId: request.cookies.get(VISITOR_COOKIE)?.value ?? null,
      variant: request.cookies.get(VARIANT_COOKIE)?.value ?? null,
      funnelVariant: request.cookies.get(FUNNEL_VARIANT_COOKIE)?.value ?? null,
      metadata: { lineType: row.lineType ?? 'unknown' },
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[otp-call] unexpected:', err)
    return NextResponse.json({ error: 'Could not place the call.' }, { status: 500 })
  }
}
