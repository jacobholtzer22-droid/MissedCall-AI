// ===========================================
// TWILIO VOICE AFTER-DIAL
// ===========================================
// Path: app/api/webhooks/voice-after-dial/route.ts
//
// Called after a dial attempt (e.g. no answer). Returns TwiML to play
// a short message and hang up. No DB writes.

import { NextResponse } from 'next/server'
import twilio from 'twilio'

const xmlHeaders = { 'Content-Type': 'text/xml' as const }

export async function POST() {
  const vr = new twilio.twiml.VoiceResponse()
  vr.say('Sorry we missed your call. We will send you a text message shortly.')
  vr.hangup()
  return new NextResponse(vr.toString(), { headers: xmlHeaders })
}
