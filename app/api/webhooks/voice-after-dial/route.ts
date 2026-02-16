// ===========================================
// TWILIO VOICE AFTER-DIAL
// ===========================================
// Path: app/api/webhooks/voice-after-dial/route.ts
//
// Called after a dial attempt (e.g. no answer). Returns TwiML to play
// a short message and hang up. No DB writes.
//
// If the dial was completed and answered by a human/person,
// we just hang up without playing the "sorry" message.
// Empty AnsweredBy is not treated as human; all other cases play the sorry message then hang up.

import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'

const xmlHeaders = { 'Content-Type': 'text/xml' as const }

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const dialCallStatus = (formData.get('DialCallStatus') as string) ?? ''
  const answeredBy = String(formData.get('AnsweredBy') ?? '').toLowerCase()

  const completed = dialCallStatus === 'completed'
  const answeredByHuman =
    completed && (answeredBy.includes('human') || answeredBy.includes('person'))

  const vr = new twilio.twiml.VoiceResponse()

  if (answeredByHuman) {
    vr.hangup()
  } else {
    vr.say("We're sorry we can't get to the phone right now. You should receive a text message shortly.")
    vr.hangup()
  }

  return new NextResponse(vr.toString(), { status: 200, headers: xmlHeaders })
}
