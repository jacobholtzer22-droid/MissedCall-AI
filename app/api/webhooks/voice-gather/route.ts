// ===========================================
// TWILIO VOICE GATHER CALLBACK
// ===========================================
// Path: app/api/webhooks/voice-gather/route.ts
//
// This is called by Twilio AFTER the caller presses
// a digit (or doesn't) during the IVR prompt.
// If they pressed 1 → real caller → proceed with missed call flow
// Anything else → spam/robot → reject + log it

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import twilio from 'twilio'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const { searchParams } = new URL(request.url)

    const businessId = searchParams.get('businessId')
    const digits = formData.get('Digits') as string | null
    const callSid = formData.get('CallSid') as string
    const from = formData.get('From') as string
    const to = formData.get('To') as string

    console.log('🔢 Gather callback:', { businessId, digits, callSid, from })

    if (!businessId) {
      console.error('❌ No businessId in gather callback')
      return twimlResponse(`<Say>An error occurred. Goodbye.</Say>`)
    }

    const business = await db.business.findUnique({
      where: { id: businessId },
    })

    if (!business) {
      console.error('❌ Business not found:', businessId)
      return twimlResponse(`<Say>An error occurred. Goodbye.</Say>`)
    }

    // =============================================
    // CALLER PRESSED 1 → REAL PERSON → Let them through
    // =============================================
    if (digits === '1') {
      console.log('✅ Caller passed IVR screening:', from)

      // Log as passed
      await db.screenedCall.create({
        data: {
          businessId: business.id,
          callerPhone: from,
          callSid,
          result: 'passed',
        },
      })

      // Now do the normal missed call flow:
      // Check for existing conversation
      const existingConversation = await db.conversation.findFirst({
        where: {
          businessId: business.id,
          callerPhone: from,
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
          },
        },
      })

      if (!existingConversation) {
        const conversation = await db.conversation.create({
          data: {
            businessId: business.id,
            callerPhone: from,
            status: 'active',
          },
        })

        console.log('📝 Created conversation after IVR pass:', conversation.id)
        await sendInitialSMS(business, conversation, from)
      } else {
        console.log('📱 Existing conversation found, skipping SMS')
      }

      // Tell the caller we'll text them
      return twimlResponse(`
        <Say voice="Polly.Joanna">Thank you. We are unable to take your call right now, but we will text you shortly to help with your request. Goodbye.</Say>
      `)
    }

    // =============================================
    // WRONG DIGIT OR NO DIGIT → BLOCKED
    // =============================================
    console.log('🚫 Call screened out (pressed:', digits || 'nothing', ') from:', from)

    // Log as blocked
    await db.screenedCall.create({
      data: {
        businessId: business.id,
        callerPhone: from,
        callSid,
        result: 'blocked',
      },
    })

    return twimlResponse(`
      <Say voice="Polly.Joanna">Goodbye.</Say>
    `)
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

async function sendInitialSMS(
  business: { id: string; name: string; aiGreeting: string | null; twilioPhoneNumber: string | null },
  conversation: { id: string },
  callerPhone: string
) {
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

    console.log('📤 Sent initial SMS after IVR pass:', message.sid)
  } catch (error) {
    console.error('❌ Error sending SMS:', error)
  }
}
