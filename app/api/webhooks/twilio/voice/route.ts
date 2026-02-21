// ===========================================
// TELNYX VOICE WEBHOOK
// ===========================================
// This endpoint is called by Telnyx when a call comes in
// We detect missed calls and trigger the SMS follow-up

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import Telnyx from 'telnyx'

// Telnyx sends POST requests with JSON to this endpoint
export async function POST(request: NextRequest) {
  try {
    // Parse the JSON body from Telnyx
    const body = await request.json()

    // Extract call information
    const callSid = body.data?.payload?.call_control_id as string
    const callStatus = body.data?.payload?.state as string
    const from = body.data?.payload?.from as string           // Caller's phone number
    const to = body.data?.payload?.to as string               // Your Telnyx number
    const direction = body.data?.payload?.direction as string

    console.log('📞 Incoming call webhook:', { callSid, callStatus, from, to, direction })

    // Find which business owns this phone number
    const business = await db.business.findFirst({
      where: { telnyxPhoneNumber: to }
    })

    if (!business) {
      console.log('⚠️ No business found for phone number:', to)
      return new NextResponse(
        `<?xml version="1.0" encoding="UTF-8"?>
        <Response>
          <Say>Sorry, this number is not configured. Please try again later.</Say>
        </Response>`,
        { headers: { 'Content-Type': 'text/xml' } }
      )
    }

    // Spam filtering (only when business has it enabled)
    if (business.spamFilterEnabled) {
      const isSpam = await isSpamCall(from)
      if (isSpam) {
        console.log('🚫 Spam call detected:', from)
        await db.conversation.create({
          data: {
            businessId: business.id,
            callerPhone: from,
            status: 'spam',
            summary: 'Spam call - automatically filtered',
          }
        })
        console.log('📝 Logged spam call to dashboard')
        return new NextResponse(
          `<?xml version="1.0" encoding="UTF-8"?>
        <Response>
          <Reject />
        </Response>`,
          { headers: { 'Content-Type': 'text/xml' } }
        )
      }
    }

    // Handle the call - send SMS on ringing, no-answer, or busy
    if (callStatus === 'ringing' || callStatus === 'no-answer' || callStatus === 'busy') {
      // Check if we already have a conversation with this caller recently
      const existingConversation = await db.conversation.findFirst({
        where: {
          businessId: business.id,
          callerPhone: from,
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
          }
        }
      })

      if (!existingConversation) {
        // Create a new conversation
        const conversation = await db.conversation.create({
          data: {
            businessId: business.id,
            callerPhone: from,
            status: 'active',
          }
        })

        console.log('📝 Created conversation:', conversation.id)

        // Send the initial SMS
        await sendInitialSMS(business, conversation, from)
      } else {
        console.log('📱 Existing conversation found, skipping SMS')
      }
    }

    // Return XML response
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?>
      <Response>
        <Say>Sorry, we are unable to take your call right now. We will text you shortly to help with your request.</Say>
      </Response>`,
      { headers: { 'Content-Type': 'text/xml' } }
    )

  } catch (error) {
    console.error('❌ Error handling voice webhook:', error)
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?>
      <Response>
        <Say>An error occurred. Please try again later.</Say>
      </Response>`,
      { headers: { 'Content-Type': 'text/xml' } }
    )
  }
}

// Send the initial SMS when a call is missed
async function sendInitialSMS(
  business: { id: string; name: string; aiGreeting: string | null; telnyxPhoneNumber: string | null },
  conversation: { id: string },
  callerPhone: string
) {
  const telnyxClient = new Telnyx(process.env.TELNYX_API_KEY!)

  const greeting = business.aiGreeting ||
    `Hi! Sorry we missed your call at ${business.name}. I'm an automated assistant - how can I help you today?`

  try {
    const message = await telnyxClient.messages.create({
      from: business.telnyxPhoneNumber!,
      to: callerPhone,
      text: greeting,
    })

    await db.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'outbound',
        content: greeting,
        telnyxSid: (message as any).data?.id ?? null,
        telnyxStatus: (message as any).data?.to?.[0]?.status ?? 'sent',
      }
    })

    console.log('📤 Sent initial SMS:', (message as any).data?.id)
  } catch (error) {
    console.error('❌ Error sending SMS:', error)
  }
}

async function isSpamCall(phone: string): Promise<boolean> {
  // 1. Block toll-free numbers calling IN (real customers don't call from toll-free)
  const tollFreePatterns = ['+1833', '+1844', '+1855', '+1866', '+1877', '+1888', '+1800']
  if (tollFreePatterns.some(prefix => phone.startsWith(prefix))) {
    console.log('🚫 Blocked toll-free caller:', phone)
    return true
  }

  // 2. Block very short numbers (automated systems, short codes)
  const digitsOnly = phone.replace(/\D/g, '')
  if (digitsOnly.length < 10) {
    console.log('🚫 Blocked short number:', phone)
    return true
  }

  // 3. Block numbers with invalid US area codes starting with 0 or 1
  if (phone.startsWith('+1')) {
    const areaCode = digitsOnly.substring(1, 4)
    if (areaCode.startsWith('0') || areaCode.startsWith('1')) {
      console.log('🚫 Blocked invalid area code:', phone)
      return true
    }
  }

  return false
}
