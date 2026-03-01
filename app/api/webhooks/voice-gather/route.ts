// ===========================================
// TELNYX VOICE GATHER CALLBACK
// ===========================================
// Path: app/api/webhooks/voice-gather/route.ts
//
// Flow:
// 1. Caller presses 1 → send missed-call SMS, play goodbye message
// 2. Wrong digit / no digit → blocked as spam

import { NextRequest, NextResponse } from 'next/server'
import Telnyx from 'telnyx'
import { db } from '@/lib/db'
import { checkCooldown, recordMessageSent, logCooldownSkip, isCooldownBypassNumber } from '@/lib/sms-cooldown'
import { isExistingContact, logContactSkip } from '@/lib/contacts-check'

const xmlHeaders = { 'Content-Type': 'text/xml' as const }

function xmlResponse(xml: string): NextResponse {
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?>${xml}`, { headers: xmlHeaders })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { searchParams } = new URL(request.url)

    const businessId = searchParams.get('businessId')
    const callSid = (searchParams.get('callSid') ?? body.data?.payload?.call_control_id) as string
    const digits = body.data?.payload?.digits as string | null
    const rawCallerPhone = (body.data?.payload?.from as string) ?? ""
    const callerPhone = rawCallerPhone.trim()

    console.log('🔢 Gather callback:', { businessId, digits, callSid, callerPhone })

    if (!businessId) {
      return xmlResponse('<Response><Say>Thanks for calling. Goodbye.</Say><Hangup /></Response>')
    }

    const business = await db.business.findUnique({
      where: { id: businessId },
    })

    if (!business) {
      return xmlResponse('<Response><Say>Thanks for calling. Goodbye.</Say><Hangup /></Response>')
    }

    // =============================================
    // CALLER PRESSED 1 → SEND MISSED-CALL SMS
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

      await triggerMissedCallSMS(business, callerPhone)

      return xmlResponse(
        '<Response><Say voice="Polly.Joanna">Thank you. We are unable to take your call right now, but we will text you shortly to help with your request. Goodbye.</Say></Response>'
      )
    }

    // =============================================
    // DIGITS missing or !== "1" → BLOCKED (no input / wrong key / timeout)
    // =============================================
    if (callSid) {
      await db.conversation.updateMany({
        where: { callSid },
        data: { status: 'screening_blocked' },
      })
    }
    await db.screenedCall.create({
      data: {
        businessId: business.id,
        callerPhone,
        callSid,
        result: 'blocked',
      },
    })

    return xmlResponse('<Response><Say>Thanks for calling. Goodbye.</Say><Hangup /></Response>')
  } catch (error) {
    console.error('❌ Error in gather callback:', error)
    return xmlResponse('<Response><Say>An error occurred. Goodbye.</Say></Response>')
  }
}

async function triggerMissedCallSMS(
  business: { id: string; name: string; aiGreeting: string | null; telnyxPhoneNumber: string | null; smsCooldownDays?: number | null; cooldownBypassNumbers?: unknown },
  callerPhone: string
) {
  // 0. Check blocked list first
  const blocked = await db.blockedNumber.findFirst({
    where: { businessId: business.id, phoneNumber: callerPhone },
  })
  if (blocked) {
    await db.cooldownSkipLog.create({
      data: {
        businessId: business.id,
        phoneNumber: callerPhone,
        reason: 'blocked',
        lastMessageSent: new Date(0),
        messageType: 'missed_call',
      },
    })
    return
  }

  // 1. Check contacts first — skip if caller is in client's address book
  const isContact = await isExistingContact(business.id, callerPhone)
  if (isContact) {
    await logContactSkip(business.id, callerPhone, 'missed_call')
    return
  }

  // 2. Cooldown bypass (admin/testing) — skip cooldown check for configured numbers
  if (isCooldownBypassNumber(callerPhone, business.cooldownBypassNumbers ?? [])) {
    console.log('COOLDOWN_BYPASS: Admin number, skipping cooldown', { businessId: business.id, callerPhone })
  } else {
    // 3. Check cooldown — skip if we recently sent to this number
    const cooldown = await checkCooldown(business.id, callerPhone, business)
    if (!cooldown.allowed && cooldown.lastMessageSent) {
      await logCooldownSkip(business.id, callerPhone, cooldown.lastMessageSent, 'missed_call')
      return
    }
  }

  const telnyxClient = new Telnyx({ apiKey: process.env.TELNYX_API_KEY! })

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
    const message = await telnyxClient.messages.send({
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
      },
    })

    await recordMessageSent(business.id, callerPhone)
    console.log('📤 Sent MissedCall AI SMS:', (message as any).data?.id)
  } catch (error) {
    console.error('❌ Error sending SMS:', error)
  }
}
