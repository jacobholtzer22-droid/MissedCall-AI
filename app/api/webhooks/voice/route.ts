// ===========================================
// TELNYX VOICE WEBHOOK (UPDATED)
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
import Telnyx from 'telnyx'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const callSid = body.data?.payload?.call_control_id as string
    const callStatus = body.data?.payload?.state as string
    const from = body.data?.payload?.from as string
    const to = body.data?.payload?.to as string
    const direction = body.data?.payload?.direction as string

    console.log('📞 Incoming call webhook:', { callSid, callStatus, from, to, direction })

    // Find which business owns this phone number (normalize for formatting differences)
    let business: Business | null = await db.business.findFirst({
      where: { telnyxPhoneNumber: to },
    })
    if (!business) {
      const toDigits = normalizePhone(to)
      if (toDigits) {
        const candidates = await db.business.findMany({
          where: { telnyxPhoneNumber: { not: null } },
        })
        const byDigits = candidates.filter(
          (b) => b.telnyxPhoneNumber && normalizePhone(b.telnyxPhoneNumber) === toDigits
        )
        if (byDigits.length === 1) business = byDigits[0]
        else if (byDigits.length > 1) {
          const e164First = byDigits.find((b) => b.telnyxPhoneNumber?.startsWith('+'))
          business = e164First ?? byDigits[0]
        }
      }
    }

    console.log("✅ Matched business", {
      found: !!business,
      businessId: business?.id,
      businessName: business?.name,
      telnyxPhoneNumber: business?.telnyxPhoneNumber,
      callScreenerEnabled: business?.callScreenerEnabled,
      spamFilterEnabled: business?.spamFilterEnabled
    });

    if (!business) {
      console.log('⚠️ No business found for phone number:', to)
      return xmlResponse('<Response><Say>Sorry, this number is not configured. Please try again later.</Say></Response>')
    }

    // =============================================
    // LAYER 1: Spam filter (heuristics-based)
    // =============================================
    if (business.spamFilterEnabled) {
      const isSpam = await isSpamCall(from)
      if (isSpam) {
        console.log('🚫 Spam call detected by filter:', from)
        // Log it as a screened call too so it shows in stats
        await db.screenedCall.create({
          data: {
            businessId: business.id,
            callerPhone: from,
            callSid,
            result: 'blocked',
          },
        })
        return xmlResponse('<Response><Reject /></Response>')
      }
    }

    // =============================================
    // LAYER 2: IVR Call Screener ("Press 1")
    // =============================================
    if (business.callScreenerEnabled) {
      const parentCallSid = callSid
      const callerPhone = from
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
      return xmlResponse(
        `<Response>
          <Gather numDigits="1" timeout="8" action="${gatherActionUrl}" method="POST" actionOnEmptyResult="true">
            <Say>${escapeXml(screenerMessage)}</Say>
          </Gather>
          <Say>We did not receive a response. Goodbye.</Say>
          <Hangup />
        </Response>`
      )
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
    }

    return xmlResponse('<Response><Say>Sorry, we are unable to take your call right now. We will text you shortly to help with your request.</Say></Response>')
  } catch (error) {
    console.error('❌ Error handling voice webhook:', error)
    return xmlResponse('<Response><Say>An error occurred. Please try again later.</Say></Response>')
  }
}

// ===========================================
// HELPER: Return XML response with Content-Type text/xml
// ===========================================
function xmlResponse(xml: string) {
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?>${xml}`, {
    headers: { 'Content-Type': 'text/xml' },
  })
}

// ===========================================
// HELPER: Escape XML special characters
// ===========================================
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
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
  business: { id: string; name: string; aiGreeting: string | null; telnyxPhoneNumber: string | null },
  conversation: { id: string },
  callerPhone: string
) {
  const telnyxClient = new Telnyx(process.env.TELNYX_API_KEY!)

  const defaultGreeting = `Sorry we missed your call at ${business.name}. How can we help?`.slice(0, 140)

  let text: string
  if (business.aiGreeting) {
    const sanitized = sanitizeGreetingToAscii(business.aiGreeting)
    text = sanitized.length > 0 ? sanitized.slice(0, 140) : defaultGreeting
  } else {
    text = defaultGreeting
  }

  try {
    const message = await telnyxClient.messages.create({
      from: business.telnyxPhoneNumber!,
      to: callerPhone,
      text,
    })

    await db.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'outbound',
        content: text,
        telnyxSid: (message as any).data?.id ?? null,
        telnyxStatus: (message as any).data?.to?.[0]?.status ?? 'sent',
      },
    })

    console.log('📤 Sent initial SMS:', (message as any).data?.id)
  } catch (error) {
    console.error('❌ Error sending SMS:', error)
  }
}

// ===========================================
// Spam check (heuristics only)
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

  return false
}
