// ===========================================
// TELNYX VOICE AFTER-DIAL
// ===========================================
// Path: app/api/webhooks/voice-after-dial/route.ts
//
// Called after a dial attempt (e.g. no answer). Returns XML to play
// a short message and hang up. No DB writes.
//
// If the dial was completed and had duration > 0 (call was answered),
// we just hang up without playing the "sorry" message.
// Otherwise we play the business's missedCallVoiceMessage (or default) then hang up.

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

const xmlHeaders = { 'Content-Type': 'text/xml' as const }

const DEFAULT_VOICE_MESSAGE =
  "We're sorry we can't get to the phone right now. You should receive a text message shortly."

export async function POST(request: NextRequest) {
  console.log('voice-after-dial URL:', request.nextUrl.toString())
  const body = await request.json()
  const businessId = request.nextUrl.searchParams.get('businessId')
  const dialCallStatus = (body.data?.payload?.state as string) ?? ''
  const rawDuration =
    String(body.data?.payload?.duration_secs ?? body.data?.payload?.duration ?? '')

  const durationSeconds = (() => {
    const n = parseInt(rawDuration, 10)
    return Number.isNaN(n) ? 0 : n
  })()

  const silentHangup = dialCallStatus === 'completed' && durationSeconds > 0

  let sayMessage = DEFAULT_VOICE_MESSAGE
  if (!silentHangup && businessId) {
    const business = await db.business.findUnique({
      where: { id: businessId },
      select: { missedCallVoiceMessage: true },
    })
    console.log('Business lookup:', { businessId, found: !!business, message: business?.missedCallVoiceMessage })
    const custom = business?.missedCallVoiceMessage?.trim()
    if (custom) sayMessage = custom
  }

  const xml = silentHangup
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Hangup /></Response>`
    : `<?xml version="1.0" encoding="UTF-8"?><Response><Say>${escapeXml(sayMessage)}</Say><Hangup /></Response>`

  return new NextResponse(xml, { status: 200, headers: xmlHeaders })
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
