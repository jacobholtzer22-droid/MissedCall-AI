// ===========================================
// TWILIO VOICE GATHER CALLBACK (WITH DIAL)
// ===========================================
// Path: app/api/webhooks/voice-gather/route.ts
//
// Flow:
// 1. Caller presses 1 → dial the business owner's real phone
// 2. Owner picks up → normal phone call, done
// 3. Owner doesn't pick up → status callback triggers MissedCall AI SMS
// 4. Wrong digit / no digit → blocked as spam

import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import { db } from '@/lib/db'

const xmlHeaders = { 'Content-Type': 'text/xml' as const }

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const { searchParams } = new URL(request.url)

    const businessId = searchParams.get('businessId')
    const digits = formData.get('Digits') as string | null
    const callSid = formData.get('CallSid') as string
    const callerPhone = (formData.get('From') as string) ?? ''

    console.log('🔢 Gather callback:', { businessId, digits, callSid, callerPhone })

    if (!businessId) {
      const vr = new twilio.twiml.VoiceResponse()
      vr.say('Thanks for calling. Goodbye.')
      vr.hangup()
      return new NextResponse(vr.toString(), { headers: xmlHeaders })
    }

    const business = await db.business.findUnique({
      where: { id: businessId },
    })

    if (!business) {
      const vr = new twilio.twiml.VoiceResponse()
      vr.say('Thanks for calling. Goodbye.')
      vr.hangup()
      return new NextResponse(vr.toString(), { headers: xmlHeaders })
    }

    // =============================================
    // CALLER PRESSED 1 → DIAL BUSINESS OWNER
    // =============================================
    if (digits === '1') {
      console.log('✅ Caller passed IVR screening:', callerPhone)

      await db.screenedCall.create({
        data: {
          businessId: business.id,
          callerPhone,
          callSid,
          result: 'passed',
        },
      })

      if (business.forwardingNumber && business.twilioPhoneNumber) {
        const dialStatusUrl = `${request.nextUrl.origin}/api/webhooks/voice-dial-status?businessId=${business.id}&callerPhone=${encodeURIComponent(callerPhone)}`
        const vr = new twilio.twiml.VoiceResponse()
        const dial = vr.dial({
          callerId: business.twilioPhoneNumber,
          timeout: 25,
        })
        dial.number(
          {
            statusCallback: dialStatusUrl,
            statusCallbackMethod: 'POST',
            statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
          },
          business.forwardingNumber
        )
        return new NextResponse(vr.toString(), { headers: xmlHeaders })
      }

      if (business.forwardingNumber && !business.twilioPhoneNumber) {
        const vr = new twilio.twiml.VoiceResponse()
        vr.say({ voice: 'Polly.Joanna' }, 'Call forwarding is not configured. Goodbye.')
        vr.hangup()
        return new NextResponse(vr.toString(), { headers: xmlHeaders })
      }

      console.log('⚠️ No forwarding number, going straight to SMS')
      await triggerMissedCallSMS(business, callerPhone)

      const vr = new twilio.twiml.VoiceResponse()
      vr.say(
        { voice: 'Polly.Joanna' },
        'Thank you. We are unable to take your call right now, but we will text you shortly to help with your request. Goodbye.'
      )
      return new NextResponse(vr.toString(), { headers: xmlHeaders })
    }

    // =============================================
    // DIGITS !== "1" (null / empty / other) → BLOCKED
    // =============================================
    await db.screenedCall.create({
      data: {
        businessId: business.id,
        callerPhone,
        callSid,
        result: 'blocked',
      },
    })

    const vr = new twilio.twiml.VoiceResponse()
    vr.say('Thanks for calling. Goodbye.')
    vr.hangup()
    return new NextResponse(vr.toString(), { headers: xmlHeaders })
  } catch (error) {
    console.error('❌ Error in gather callback:', error)
    const vr = new twilio.twiml.VoiceResponse()
    vr.say('An error occurred. Goodbye.')
    return new NextResponse(vr.toString(), { headers: xmlHeaders })
  }
}

async function triggerMissedCallSMS(
  business: { id: string; name: string; aiGreeting: string | null; twilioPhoneNumber: string | null },
  callerPhone: string
) {
  const twilioClient = twilio(
    process.env.TWILIO_ACCOUNT_SID!,
    process.env.TWILIO_AUTH_TOKEN!
  )

  // Check for existing conversation
  const existingConversation = await db.conversation.findFirst({
    where: {
      businessId: business.id,
      callerPhone: callerPhone,
      createdAt: {
        gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    },
  })

  if (existingConversation) {
    console.log('📱 Existing conversation found, skipping SMS')
    return
  }

  const conversation = await db.conversation.create({
    data: {
      businessId: business.id,
      callerPhone: callerPhone,
      status: 'active',
    },
  })

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

    console.log('📤 Sent MissedCall AI SMS:', message.sid)
  } catch (error) {
    console.error('❌ Error sending SMS:', error)
  }
}
