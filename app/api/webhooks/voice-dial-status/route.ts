// ===========================================
// TWILIO DIAL STATUS CALLBACK
// ===========================================
// Path: app/api/webhooks/voice-dial-status/route.ts
//
// Twilio hits this AFTER the <Dial> attempt ends.
// If the owner answered → do nothing, call was handled
// If no answer / busy / failed AND ring duration >= 8s → trigger MissedCall AI SMS

const MIN_DURATION_SECONDS = 8
const TRIGGER_STATUSES = ['no-answer', 'busy', 'failed'] as const

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import twilio from 'twilio'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const { searchParams } = new URL(request.url)

    const businessId = searchParams.get('businessId')
    const callerPhone = searchParams.get('callerPhone')
    const dialCallStatus = formData.get('DialCallStatus') as string
    const callSid = formData.get('CallSid') as string

    console.log('📞 Dial status callback:', { businessId, callerPhone, dialCallStatus, callSid })

    if (!businessId || !callerPhone) {
      console.error('❌ Missing businessId or callerPhone in dial callback')
      return twimlResponse(`<Say>Goodbye.</Say>`)
    }

    const business = await db.business.findUnique({
      where: { id: businessId },
    })

    if (!business) {
      console.error('❌ Business not found:', businessId)
      return twimlResponse(`<Say>Goodbye.</Say>`)
    }

    // =============================================
    // OWNER ANSWERED → Call was handled, done
    // =============================================
    if (dialCallStatus === 'completed') {
      console.log('✅ Owner answered the call, no SMS needed')
      return twimlResponse(`<Hangup />`)
    }

    // =============================================
    // Only trigger SMS for no-answer/busy/failed (not canceled, etc.)
    // =============================================
    if (!TRIGGER_STATUSES.includes(dialCallStatus as (typeof TRIGGER_STATUSES)[number])) {
      console.log('📵 Dial status not in trigger set (status:', dialCallStatus, '), skipping SMS')
      return twimlResponse(`<Hangup />`)
    }

    // =============================================
    // Resolve call duration: formData first, then Twilio API fallback
    // =============================================
    let durationSeconds: number | null = null
    const durationFromForm =
      formData.get('DialCallDuration') ?? formData.get('Duration')
    if (durationFromForm != null && durationFromForm !== '') {
      const parsed = parseInt(String(durationFromForm), 10)
      if (!Number.isNaN(parsed) && parsed >= 0) durationSeconds = parsed
    }

    if (durationSeconds === null && callSid && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      try {
        const twilioClient = twilio(
          process.env.TWILIO_ACCOUNT_SID,
          process.env.TWILIO_AUTH_TOKEN
        )
        const call = await twilioClient.calls(callSid).fetch()
        const d = call.duration != null ? parseInt(String(call.duration), 10) : NaN
        if (!Number.isNaN(d) && d >= 0) durationSeconds = d
      } catch (err) {
        console.error('❌ Failed to fetch call duration from Twilio API:', err)
      }
    }

    if (durationSeconds === null) {
      console.log('📵 Could not determine call duration, skipping SMS (treat as below threshold)')
      return twimlResponse(`<Hangup />`)
    }

    if (durationSeconds < MIN_DURATION_SECONDS) {
      console.log(
        '📵 Call duration below minimum (',
        durationSeconds,
        's <',
        MIN_DURATION_SECONDS,
        's), skipping SMS'
      )
      return twimlResponse(`<Hangup />`)
    }

    // =============================================
    // OWNER DIDN'T ANSWER (eligible status + duration) → Trigger MissedCall AI
    // =============================================
    console.log('📵 Owner did not answer (status:', dialCallStatus, ', duration:', durationSeconds, 's), triggering SMS')

    // Check for existing conversation in last 24h
    const existingConversation = await db.conversation.findFirst({
      where: {
        businessId: business.id,
        callerPhone: callerPhone,
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      },
    })

    if (!existingConversation) {
      const conversation = await db.conversation.create({
        data: {
          businessId: business.id,
          callerPhone: callerPhone,
          status: 'active',
        },
      })

      console.log('📝 Created conversation:', conversation.id)

      // Send the MissedCall AI greeting
      const twilioClient = twilio(
        process.env.TWILIO_ACCOUNT_SID!,
        process.env.TWILIO_AUTH_TOKEN!
      )

      const greeting =
        business.aiGreeting ||
        `Hi! Sorry we missed your call at ${business.name}. I'm an automated assistant - how can I help you today?`

      try {
        const message = await twilioClient.messages.create({
          body: greeting,
          from: business.twilioPhoneNumber!,
          to: callerPhone,
        })

        await db.message.create({
          data: {
            conversationId: conversation.id,
            direction: 'outbound',
            content: greeting,
            twilioSid: message.sid,
            twilioStatus: message.status,
          },
        })

        console.log('📤 Sent MissedCall AI SMS after missed dial:', message.sid)
      } catch (error) {
        console.error('❌ Error sending SMS:', error)
      }
    } else {
      console.log('📱 Existing conversation found, skipping SMS')
    }

    // Tell the caller we'll text them
    return twimlResponse(`
      <Say voice="Polly.Joanna">Sorry, no one is available right now. We will text you shortly to help with your request. Goodbye.</Say>
    `)
  } catch (error) {
    console.error('❌ Error in dial status callback:', error)
    return twimlResponse(`<Say>An error occurred. Goodbye.</Say>`)
  }
}

function twimlResponse(body: string) {
  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`,
    { headers: { 'Content-Type': 'text/xml' } }
  )
}
