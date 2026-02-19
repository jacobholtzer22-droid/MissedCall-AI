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
import type { Business } from '@prisma/client'
import { db } from '@/lib/db'
import twilio from 'twilio'

const VoiceResponse = twilio.twiml.VoiceResponse

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()

    const callSid = formData.get('CallSid') as string
    const callStatus = formData.get('CallStatus') as string
    const from = formData.get('From') as string
    const to = formData.get('To') as string
    const direction = formData.get('Direction') as string

    console.log('📞 Incoming call webhook:', { callSid, callStatus, from, to, direction })

    // Find which business owns this phone number (normalize for formatting differences)
    let business: Business | null = await db.business.findFirst({
      where: { twilioPhoneNumber: to },
    })
    if (!business) {
      const toDigits = normalizePhone(to)
      if (toDigits) {
        const candidates = await db.business.findMany({
          where: { twilioPhoneNumber: { not: null } },
        })
        const byDigits = candidates.filter(
          (b) => b.twilioPhoneNumber && normalizePhone(b.twilioPhoneNumber) === toDigits
        )
        if (byDigits.length === 1) business = byDigits[0]
        else if (byDigits.length > 1) {
          const e164First = byDigits.find((b) => b.twilioPhoneNumber?.startsWith('+'))
          business = e164First ?? byDigits[0]
        }
      }
    }

    console.log("✅ Matched business", {
      found: !!business,
      businessId: business?.id,
      businessName: business?.name,
      twilioPhoneNumber: business?.twilioPhoneNumber,
      callScreenerEnabled: business?.callScreenerEnabled,
      spamFilterEnabled: business?.spamFilterEnabled
    });

    if (!business) {
      console.log('⚠️ No business found for phone number:', to)
      const vr = new VoiceResponse()
      vr.say('Sorry, this number is not configured. Please try again later.')
      return xmlResponse(vr)
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
        const vr = new VoiceResponse()
        vr.reject()
        return xmlResponse(vr)
      }
    }

    // =============================================
    // LAYER 2: IVR Call Screener ("Press 1")
    // =============================================
    if (business.callScreenerEnabled) {
      const parentCallSid = (formData.get('CallSid') as string) ?? callSid
      const callerPhone = (formData.get('From') as string) ?? from
      console.log('🛡️ Call screener active, sending IVR prompt', {
        callSid: parentCallSid,
        callerPhone,
        businessId: business.id,
      })

      // Call logging: create/upsert conversation for dashboard (parent CallSid = unique key)
      const conversation = await db.conversation.upsert({
        where: { callSid: parentCallSid },
        create: {
          businessId: business.id,
          callerPhone,
          status: 'screening',
          callSid: parentCallSid,
        },
        update: {
          callerPhone,
          status: 'screening',
        },
      })
      console.log('📋 Conversation upserted for dashboard (screening)', {
        conversationId: conversation.id,
        callSid: parentCallSid,
        status: conversation.status,
      })

      // Custom message or default
      const screenerMessage =
        business.callScreenerMessage ||
        `Thank you for calling ${business.name}. To be connected, please press 1.`

      // Build the callback URL for when they press a digit (absolute URL from request origin)
      const gatherActionUrl = `${request.nextUrl.origin}/api/webhooks/voice-gather?businessId=${business.id}&callSid=${encodeURIComponent(parentCallSid)}`

      // Gather waits for 1 digit, times out after 8 seconds.
      // actionOnEmptyResult: true → Twilio POSTs to action URL even when no digits (timeout).
      const vr = new VoiceResponse()
      const gather = vr.gather({
        numDigits: 1,
        timeout: 8,
        action: gatherActionUrl,
        method: 'POST',
        actionOnEmptyResult: true,
      })
      gather.say(screenerMessage)
      vr.say('We did not receive a response. Goodbye.')
      vr.hangup()
      return xmlResponse(vr)
    }

    // =============================================
    // NO SCREENER: Normal missed call flow (only when call screener is off)
    // =============================================
    if (!business.callScreenerEnabled) {
      if (callStatus === 'ringing' || callStatus === 'no-answer' || callStatus === 'busy') {
        const existingConversation = await db.conversation.findFirst({
          where: {
            businessId: business.id,
            callerPhone: from,
            createdAt: {
              gte: new Date(Date.now() - 72 * 60 * 60 * 1000),
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
    }

    const vr = new VoiceResponse()
    vr.say('Sorry, we are unable to take your call right now. We will text you shortly to help with your request.')
    return xmlResponse(vr)
  } catch (error) {
    console.error('❌ Error handling voice webhook:', error)
    const vr = new VoiceResponse()
    vr.say('An error occurred. Please try again later.')
    return xmlResponse(vr)
  }
}

// ===========================================
// HELPER: Return TwiML from VoiceResponse with Content-Type text/xml
// ===========================================
function xmlResponse(vr: InstanceType<typeof VoiceResponse>) {
  return new NextResponse(vr.toString(), {
    headers: { 'Content-Type': 'text/xml' },
  })
}

// ===========================================
// HELPER: Normalize phone to digits only (E.164 comparison)
// ===========================================
function normalizePhone(phone: string): string {
  return (phone ?? '').replace(/\D/g, '')
}

// ===========================================
// HELPER: Sanitize greeting to plain ASCII for first SMS
// Removes emojis, curly quotes, and special punctuation.
// ===========================================
function sanitizeGreetingToAscii(text: string): string {
  return (
    text
      .replace(/[\u201c\u201d]/g, '"')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/[\u2026]/g, '...')
      // Remove emoji and other non-ASCII
      .replace(/[^\x00-\x7F]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  )
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

  const defaultGreeting = `Sorry we missed your call at ${business.name}. How can we help?`.slice(0, 140)

  let body: string
  if (business.aiGreeting) {
    const sanitized = sanitizeGreetingToAscii(business.aiGreeting)
    body = sanitized.length > 0 ? sanitized.slice(0, 140) : defaultGreeting
  } else {
    body = defaultGreeting
  }

  try {
    const message = await twilioClient.messages.create({
      body,
      from: business.twilioPhoneNumber!,
      to: callerPhone,
    })

    await db.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'outbound',
        content: body,
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
