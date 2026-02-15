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
import { db } from '@/lib/db'

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
      return twimlResponse(`<Say>An error occurred. Goodbye.</Say>`)
    }

    const business = await db.business.findUnique({
      where: { id: businessId },
    })

    if (!business) {
      return twimlResponse(`<Say>An error occurred. Goodbye.</Say>`)
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

      if (business.forwardingNumber) {
        const dialStatusUrl = `${request.nextUrl.origin}/api/webhooks/voice-dial-status?businessId=${business.id}&callerPhone=${encodeURIComponent(callerPhone)}`

        const hasValidCallerPhone = callerPhone && String(callerPhone).trim().length > 0
        const dialCallerId = hasValidCallerPhone ? callerPhone : (business.twilioPhoneNumber ?? callerPhone)
        return twimlResponse(`
          <Dial statusCallback="${dialStatusUrl}" statusCallbackMethod="POST" statusCallbackEvent="completed" timeout="25" callerId="${dialCallerId}">
            <Number>${business.forwardingNumber}</Number>
          </Dial>
        `)
      }

      console.log('⚠️ No forwarding number, going straight to SMS')
      await triggerMissedCallSMS(business, callerPhone)

      return twimlResponse(`
        <Say voice="Polly.Joanna">Thank you. We are unable to take your call right now, but we will text you shortly to help with your request. Goodbye.</Say>
      `)
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

    return twimlResponse(
      '<Say voice="Polly.Joanna">Thanks for calling. Goodbye.</Say><Hangup />'
    )
  } catch (error) {
    console.error('❌ Error in gather callback:', error)
    return twimlResponse(`<Say>An error occurred. Goodbye.</Say>`)
  }
}

// ===========================================
// HELPERS
// ===========================================

function twimlResponse(body: string) {
  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`,
    { headers: { 'Content-Type': 'text/xml' } }
  )
}

async function triggerMissedCallSMS(
  business: { id: string; name: string; aiGreeting: string | null; twilioPhoneNumber: string | null },
  callerPhone: string
) {
  const twilio = require('twilio')
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
