// ===========================================
// TWILIO VOICE WEBHOOK (UPDATED)
// ===========================================
// Path: app/api/webhooks/voice/route.ts
//
// Now includes IVR "Press 1" call screening.
// When callScreenerEnabled = true, callers hear a prompt
// and must press 1 to proceed. Robocallers can't press
// buttons, so they get filtered automatically.

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import twilio from 'twilio'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()

    const callSid = formData.get('CallSid') as string
    const callStatus = formData.get('CallStatus') as string
    const from = formData.get('From') as string
    const to = formData.get('To') as string
    const direction = formData.get('Direction') as string

    console.log('📞 Incoming call webhook:', { callSid, callStatus, from, to, direction })

    // Find which business owns this phone number
    const business = await db.business.findFirst({
      where: { twilioPhoneNumber: to },
    })

    if (!business) {
      console.log('⚠️ No business found for phone number:', to)
      return twimlResponse(`
        <Say>Sorry, this number is not configured. Please try again later.</Say>
      `)
    }

    // =============================================
    // LAYER 1: Twilio Lookup spam filter (existing)
    // =============================================
    if (business.spamFilterEnabled) {
      const isSpam = await isSpamCall(from)
      if (isSpam) {
        console.log('🚫 Spam call detected by lookup filter:', from)
        // Log it as a screened call too so it shows in stats
        await db.screenedCall.create({
          data: {
            businessId: business.id,
            callerPhone: from,
            callSid,
            result: 'blocked',
          },
        })
        return twimlResponse(`<Reject />`)
      }
    }

    // =============================================
    // LAYER 2: IVR Call Screener ("Press 1")
    // =============================================
    if (business.callScreenerEnabled) {
      console.log('🛡️ Call screener active, sending IVR prompt')

      // Custom message or default
      const screenerMessage =
        business.callScreenerMessage ||
        `Thank you for calling ${business.name}. To be connected, please press 1.`

      // Build the callback URL for when they press a digit
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
      const protocol = baseUrl?.includes('localhost') ? 'http' : 'https'
      const gatherActionUrl = `${protocol}://${baseUrl}/api/webhooks/voice-gather?businessId=${business.id}`

      // Gather waits for 1 digit, times out after 8 seconds
      // If no input → falls through to the <Say> rejection message
      return twimlResponse(`
        <Gather numDigits="1" action="${gatherActionUrl}" method="POST" timeout="8">
          <Say voice="Polly.Joanna">${escapeXml(screenerMessage)}</Say>
        </Gather>
        <Say voice="Polly.Joanna">We did not receive a response. Goodbye.</Say>
      `)
    }

    // =============================================
    // NO SCREENER: Normal missed call flow
    // =============================================
    if (callStatus === 'ringing' || callStatus === 'no-answer' || callStatus === 'busy') {
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

        console.log('📝 Created conversation:', conversation.id)
        await sendInitialSMS(business, conversation, from)
      } else {
        console.log('📱 Existing conversation found, skipping SMS')
      }
    }

    return twimlResponse(`
      <Say>Sorry, we are unable to take your call right now. We will text you shortly to help with your request.</Say>
    `)
  } catch (error) {
    console.error('❌ Error handling voice webhook:', error)
    return twimlResponse(`
      <Say>An error occurred. Please try again later.</Say>
    `)
  }
}

// ===========================================
// HELPER: Build TwiML response
// ===========================================
function twimlResponse(body: string) {
  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`,
    { headers: { 'Content-Type': 'text/xml' } }
  )
}

// ===========================================
// HELPER: Escape XML special characters
// ===========================================
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// ===========================================
// Send the initial SMS when a call is missed
// ===========================================
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

    console.log('📤 Sent initial SMS:', message.sid)
  } catch (error) {
    console.error('❌ Error sending SMS:', error)
  }
}

// ===========================================
// Twilio Lookup spam check (existing logic)
// ===========================================
async function isSpamCall(phone: string): Promise<boolean> {
  const tollFreePatterns = ['+1833', '+1844', '+1855', '+1866', '+1877', '+1888', '+1800']
  if (tollFreePatterns.some((prefix) => phone.startsWith(prefix))) {
    console.log('🚫 Blocked toll-free caller:', phone)
    return true
  }

  const digitsOnly = phone.replace(/\D/g, '')
  if (digitsOnly.length < 10) {
    console.log('🚫 Blocked short number:', phone)
    return true
  }

  if (phone.startsWith('+1')) {
    const areaCode = digitsOnly.substring(1, 4)
    if (areaCode.startsWith('0') || areaCode.startsWith('1')) {
      console.log('🚫 Blocked invalid area code:', phone)
      return true
    }
  }

  try {
    const twilioClient = twilio(
      process.env.TWILIO_ACCOUNT_SID!,
      process.env.TWILIO_AUTH_TOKEN!
    )

    const lookup = await twilioClient.lookups.v2
      .phoneNumbers(phone)
      .fetch({ fields: 'line_type_intelligence' })

    const lineType = lookup.lineTypeIntelligence?.type

    if (lineType === 'voip' || lineType === 'tollFree' || lineType === 'premium' || lineType === 'personal') {
      console.log(`🚫 Blocked ${lineType} number:`, phone)
      return true
    }

    console.log(`✅ Passed spam filter (${lineType}):`, phone)
  } catch (error) {
    console.log('⚠️ Lookup failed, allowing call:', phone)
  }

  return false
}
