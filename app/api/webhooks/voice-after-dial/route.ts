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
// Otherwise we play the sorry message then hang up.

import { NextRequest, NextResponse } from 'next/server'

const xmlHeaders = { 'Content-Type': 'text/xml' as const }

export async function POST(request: NextRequest) {
  const body = await request.json()
  const dialCallStatus = (body.data?.payload?.state as string) ?? ''
  const rawDuration =
    String(body.data?.payload?.duration_secs ?? body.data?.payload?.duration ?? '')

  const durationSeconds = (() => {
    const n = parseInt(rawDuration, 10)
    return Number.isNaN(n) ? 0 : n
  })()

  const silentHangup = dialCallStatus === 'completed' && durationSeconds > 0

  const xml = silentHangup
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Hangup /></Response>`
    : `<?xml version="1.0" encoding="UTF-8"?><Response><Say>We missed your call but we'll text you shortly to help with your request. Goodbye.</Say><Hangup /></Response>`

  return new NextResponse(xml, { status: 200, headers: xmlHeaders })
}
