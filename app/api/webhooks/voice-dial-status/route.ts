// ===========================================
// TELNYX DIAL STATUS CALLBACK
// ===========================================
// Path: app/api/webhooks/voice-dial-status/route.ts
//
// Telnyx hits this AFTER the <Dial> attempt ends.
// 1) Update or create call record (Conversation) by parent callSid with dial outcome.
// 2) If owner answered (completed, not machine) → do nothing, call was handled.
// 3) no-answer/busy/failed always trigger MissedCall AI SMS (no duration check).
// 4) completed + AnsweredBy contains "machine" (or "unknown") triggers SMS only if duration >= 2s.
// SMS is associated with the same parent callSid record.

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import Telnyx from 'telnyx'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { searchParams } = new URL(request.url)

    // 1) Parent call SID from query (set by voice-gather when building status callback URL)
    const parentCallSid = searchParams.get('callSid')
    const businessId = searchParams.get('businessId')
    const callerPhone = searchParams.get('callerPhone')
    const dialCallStatus = (body.data?.payload?.state ?? body.data?.payload?.hangup_cause) as string
    const childCallSid = body.data?.payload?.call_control_id as string
    const answeredBy = String(body.data?.payload?.answered_by ?? '').toLowerCase()

    console.log('📞 Dial status callback:', {
      parentCallSid,
      businessId,
      callerPhone,
      dialCallStatus,
      childCallSid,
      answeredBy,
    })

    if (!businessId || !callerPhone) {
      console.error('❌ Missing businessId or callerPhone in dial callback')
      return new NextResponse('', { status: 200 })
    }

    const business = await db.business.findUnique({
      where: { id: businessId },
    })

    if (!business) {
      console.error('❌ Business not found:', businessId)
      return new NextResponse('', { status: 200 })
    }

    if (business.missedCallAiEnabled === false) {
      console.log('📵 MissedCall AI is disabled for this business, skipping SMS')
      return new NextResponse('', { status: 200 })
    }

    const blocked = await db.blockedNumber.findFirst({
      where: { businessId: business.id, phoneNumber: callerPhone },
    })
    if (blocked) {
      console.log('📵 Caller is on blocked list for this business, skipping SMS', {
        businessId: business.id,
        callerPhone,
        label: blocked.label ?? '(no label)',
      })
      return new NextResponse('', { status: 200 })
    }

    // Resolve duration from JSON payload
    let durationSeconds: number | null = null
    const durationFromPayload = body.data?.payload?.duration_secs ?? body.data?.payload?.duration
    if (durationFromPayload != null && durationFromPayload !== '') {
      const parsed = parseInt(String(durationFromPayload), 10)
      if (!Number.isNaN(parsed) && parsed >= 0) durationSeconds = parsed
    }

    const endedAt = new Date()

    // 2) Update or create call record by parent callSid (so dashboard shows it)
    let callRecord: { id: string; callSid: string | null } | null = null
    if (parentCallSid) {
      callRecord = await db.conversation.findUnique({
        where: { callSid: parentCallSid },
        select: { id: true, callSid: true },
      })
      if (callRecord) {
        await db.conversation.update({
          where: { id: callRecord.id },
          data: {
            dialCallStatus: dialCallStatus ?? null,
            answeredBy: answeredBy || null,
            durationSeconds: durationSeconds ?? undefined,
            callEndedAt: endedAt,
          },
        })
        console.log('📞 Updated call record:', callRecord.id)
      } else {
        const created = await db.conversation.create({
          data: {
            businessId: business.id,
            callerPhone,
            callSid: parentCallSid,
            dialCallStatus: dialCallStatus ?? null,
            answeredBy: answeredBy || null,
            durationSeconds: durationSeconds ?? undefined,
            callEndedAt: endedAt,
            status: 'active',
          },
        })
        callRecord = { id: created.id, callSid: created.callSid }
        console.log('📞 Created fallback call record:', callRecord.id)
      }
    }

    // =============================================
    // Trigger SMS when: no-answer/busy/failed OR completed + machine
    // =============================================
    const status = String(dialCallStatus ?? '').toLowerCase()
    const isTriggerStatus = (['no-answer', 'busy', 'failed'] as const).includes(
      status as 'no-answer' | 'busy' | 'failed'
    )
    const isCompletedMachine =
      status === 'completed' &&
      (answeredBy.includes('machine') || answeredBy.includes('unknown'))
    const shouldTriggerSms = isTriggerStatus || isCompletedMachine

    if (!shouldTriggerSms) {
      const isCompletedNotMachine =
        dialCallStatus === 'completed' && !answeredBy.includes('machine')
      if (callRecord && isCompletedNotMachine) {
        await db.conversation.update({
          where: { id: callRecord.id },
          data: { status: 'completed' },
        })
      }
      console.log(
        '📵 Not triggering SMS (status:',
        dialCallStatus,
        ', answeredBy:',
        answeredBy,
        '), skipping'
      )
      return new NextResponse('', { status: 200 })
    }

    // Only apply minimum duration for completed + machine; no-answer/busy/failed always get SMS.
    if (isCompletedMachine) {
      if (durationSeconds === null) {
        console.log(
          '📵 Could not determine call duration, skipping SMS (treat as below threshold)'
        )
        return new NextResponse('', { status: 200 })
      }
      const minDuration = 2
      if (durationSeconds < minDuration) {
        console.log(
          '📵 Call duration below minimum (',
          durationSeconds,
          's <',
          minDuration,
          's), skipping SMS'
        )
        return new NextResponse('', { status: 200 })
      }
    }

    // =============================================
    // OWNER DIDN'T ANSWER (eligible status + duration) → Trigger MissedCall AI
    // Keep same logic; ensure conversation is associated with parent callSid.
    // =============================================
    console.log(
      '📵 Owner did not answer (status:',
      dialCallStatus,
      ', duration:',
      durationSeconds,
      's), triggering SMS'
    )

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const existingConversation = await db.conversation.findFirst({
      where: {
        businessId: business.id,
        callerPhone,
        createdAt: { gte: twentyFourHoursAgo },
        ...(callRecord
          ? { id: { not: callRecord.id } }
          : {}),
      },
    })

    if (existingConversation) {
      console.log('📱 Existing conversation found, skipping SMS')
      return new NextResponse('', { status: 200 })
    }

    // Use the call record we already have (with parent callSid), or create one with callSid
    let conversationForSms: { id: string }
    if (callRecord) {
      conversationForSms = { id: callRecord.id }
    } else {
      const created = await db.conversation.create({
        data: {
          businessId: business.id,
          callerPhone,
          callSid: parentCallSid ?? undefined,
          status: 'active',
        },
      })
      conversationForSms = { id: created.id }
      console.log('📝 Created conversation for SMS:', conversationForSms.id)
    }

    await db.conversation.update({
      where: { id: conversationForSms.id },
      data: { status: 'no_response' },
    })

    const telnyxClient = new Telnyx({ apiKey: process.env.TELNYX_API_KEY! })
    const greeting =
      business.aiGreeting ||
      `Hi! Sorry we missed your call at ${business.name}. I'm an automated assistant - how can I help you today?`

    try {
      const message = await telnyxClient.messages.create({
        from: business.telnyxPhoneNumber!,
        to: callerPhone,
        text: greeting,
      })

      await db.message.create({
        data: {
          conversationId: conversationForSms.id,
          direction: 'outbound',
          content: greeting,
          telnyxSid: (message as any).data?.id ?? null,
          telnyxStatus: (message as any).data?.to?.[0]?.status ?? 'sent',
        },
      })

      console.log('📤 Sent MissedCall AI SMS after missed dial:', (message as any).data?.id)
    } catch (error) {
      console.error('❌ Error sending SMS:', error)
    }

    return new NextResponse('', { status: 200 })
  } catch (error) {
    console.error('❌ Error in dial status callback:', error)
    return new NextResponse('', { status: 200 })
  }
}
