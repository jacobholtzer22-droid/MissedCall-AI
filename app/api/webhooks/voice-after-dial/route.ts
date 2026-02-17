// ===========================================
// TWILIO VOICE AFTER-DIAL
// ===========================================
// Path: app/api/webhooks/voice-after-dial/route.ts
//
// Called after a dial attempt (e.g. no answer). Returns TwiML to play
// a short message and hang up. No DB writes.
//
// If the dial was completed and had duration > 0 (call was answered),
// we just hang up without playing the "sorry" message.
// Otherwise we play the sorry message then hang up.

import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'

const xmlHeaders = { 'Content-Type': 'text/xml' as const }

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const dialCallStatus = (formData.get('DialCallStatus') as string) ?? ''
  const rawDuration =
    (formData.get('DialCallDuration') as string) ??
    (formData.get('Duration') as string) ??
    ''

  const durationSeconds = (() => {
    const n = parseInt(rawDuration, 10)
    return Number.isNaN(n) ? 0 : n
  })()

  const vr = new twilio.twiml.VoiceResponse()

  const silentHangup = dialCallStatus === 'completed' && durationSeconds > 0

  if (silentHangup) {
    vr.hangup()
  } else {
    vr.say("We missed your call but we'll text you shortly to help with your request. Goodbye.")
    vr.hangup()
  }

  return new NextResponse(vr.toString(), { status: 200, headers: xmlHeaders })
}
