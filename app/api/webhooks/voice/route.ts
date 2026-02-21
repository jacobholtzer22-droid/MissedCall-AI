// ===========================================
// TELNYX VOICE WEBHOOK (CALL CONTROL API)
// ===========================================
// Single endpoint that handles ALL Telnyx Call Control events.
// Telnyx sends JSON; we respond 200 and make separate API calls
// to control the call (answer, speak, gather, transfer, hangup).
//
// Event flow — normal missed call (no screener):
//   call.initiated  → answer → speak "we'll text you" → sendMissedCallSMS
//   call.speak.ended → hangup
//
// Event flow — IVR screener:
//   call.initiated  → answer → gatherUsingSpeak "press 1"
//   call.gather.ended (digit=1)  → transfer to forwardingNumber (or SMS if none)
//   call.gather.ended (other)    → speak "goodbye"
//   call.speak.ended             → hangup

import { NextRequest, NextResponse } from 'next/server'
import type { Business } from '@prisma/client'
import { db } from '@/lib/db'
import Telnyx from 'telnyx'

const VOICE = 'AWS.Polly.Joanna'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const eventType = body.data?.event_type as string
    const payload = body.data?.payload
    const callControlId = payload?.call_control_id as string
    const from = payload?.from as string
    const to = payload?.to as string
    const direction = payload?.direction as string
    const digits = payload?.digits as string | undefined
    const rawClientState = payload?.client_state as string | undefined

    console.log('📞 Voice webhook:', { eventType, callControlId, from, to, direction })

    const telnyx = new Telnyx({ apiKey: process.env.TELNYX_API_KEY! })

    // Decode client_state (base64 JSON used to carry data across events)
    let state: { businessId?: string; callerPhone?: string; forwarding?: boolean; aLegCallControlId?: string } = {}
    if (rawClientState) {
      try {
        state = JSON.parse(Buffer.from(rawClientState, 'base64').toString())
      } catch {}
    }

    // =============================================
    // INCOMING CALL
    // =============================================
    if (eventType === 'call.initiated' && (direction === 'inbound' || direction === 'incoming')) {
      const business = await findBusiness(to)

      if (!business) {
        console.log('⚠️ No business found for:', to)
        await telnyx.calls.actions.reject(callControlId, { cause: 'CALL_REJECTED' })
        return NextResponse.json({}, { status: 200 })
      }

      console.log('✅ Matched business:', business.name)

      // Spam filter
      if (business.spamFilterEnabled && isSpamCall(from)) {
        console.log('🚫 Spam call blocked:', from)
        await db.screenedCall.create({
          data: { businessId: business.id, callerPhone: from, callSid: callControlId, result: 'blocked' },
        })
        await telnyx.calls.actions.reject(callControlId, { cause: 'CALL_REJECTED' })
        return NextResponse.json({}, { status: 200 })
      }

      // Encode businessId and callerPhone into client_state for subsequent events
      const clientState = toB64({ businessId: business.id, callerPhone: from })

      await telnyx.calls.actions.answer(callControlId, { client_state: clientState } as any)

      if (business.callScreenerEnabled) {
        // IVR screener: gather a digit
        await db.conversation.upsert({
          where: { callSid: callControlId },
          create: { businessId: business.id, callerPhone: from, status: 'screening', callSid: callControlId },
          update: { callerPhone: from, status: 'screening' },
        })
        const screenerMsg =
          business.callScreenerMessage ||
          `Thank you for calling ${business.name}. To be connected, please press 1.`
        await telnyx.calls.actions.gatherUsingSpeak(callControlId, {
          payload: screenerMsg,
          voice: VOICE,
          minimum_digits: 1,
          maximum_digits: 1,
          timeout_millis: 8000,
          valid_digits: '0123456789',
        })
      } else {
        // Normal missed call: speak message and send SMS
        await sendMissedCallSMS(telnyx, business, callControlId, from)
        await telnyx.calls.actions.speak(callControlId, {
          payload:
            'Sorry we missed your call. We have sent you a text message to help with your request. Goodbye.',
          voice: VOICE,
        })
      }

      return NextResponse.json({}, { status: 200 })
    }

    // =============================================
    // SPEAK ENDED → HANGUP
    // =============================================
    if (eventType === 'call.speak.ended') {
      await telnyx.calls.actions.hangup(callControlId, {})
      return NextResponse.json({}, { status: 200 })
    }

    // =============================================
    // GATHER ENDED → HANDLE DIGIT
    // =============================================
    if (eventType === 'call.gather.ended') {
      const { businessId, callerPhone: stateCallerPhone } = state
      const callerPhone = stateCallerPhone || from

      if (!businessId) {
        await telnyx.calls.actions.hangup(callControlId, {})
        return NextResponse.json({}, { status: 200 })
      }

      const business = await db.business.findUnique({ where: { id: businessId } })
      if (!business) {
        await telnyx.calls.actions.hangup(callControlId, {})
        return NextResponse.json({}, { status: 200 })
      }

      if (digits === '1') {
        console.log('✅ Caller passed IVR screening:', callerPhone)
        await db.screenedCall.create({
          data: { businessId, callerPhone, callSid: callControlId, result: 'passed' },
        })

        if (business.forwardingNumber) {
          // Mark conversation as waiting for the forwarded call so we can detect
          // later whether a human answered or voicemail picked up.
          await db.conversation.updateMany({
            where: { callSid: callControlId },
            data: { status: 'forwarding' },
          })

          // Transfer with AMD so Telnyx fires call.machine.detection.ended.
          // aLegCallControlId is stored in the B-leg state so that when the forwarded
          // call fails (voicemail or timeout) we can speak back to the waiting caller.
          const fwdState = toB64({ businessId, callerPhone, forwarding: true, aLegCallControlId: callControlId })
          await telnyx.calls.actions.transfer(callControlId, {
            to: business.forwardingNumber,
            from: callerPhone,
            answering_machine_detection: 'detect',
            client_state: fwdState,
            timeout_secs: 18, // Hang up before most carrier voicemails answer (~20-25 s)
          } as any)
        } else {
          // No forwarding number — send SMS and say goodbye
          await sendMissedCallSMS(telnyx, business, callControlId, callerPhone)
          await telnyx.calls.actions.speak(callControlId, {
            payload:
              'Thank you. We are unable to take your call right now but we will text you shortly to help. Goodbye.',
            voice: VOICE,
          })
        }
      } else {
        // Wrong digit or timeout — blocked
        console.log('🚫 Caller blocked (wrong digit/timeout):', callerPhone)
        await db.conversation.updateMany({
          where: { callSid: callControlId },
          data: { status: 'screening_blocked' },
        })
        await db.screenedCall.create({
          data: { businessId, callerPhone, callSid: callControlId, result: 'blocked' },
        })
        await telnyx.calls.actions.speak(callControlId, {
          payload: 'Thanks for calling. Goodbye.',
          voice: VOICE,
        })
      }

      return NextResponse.json({}, { status: 200 })
    }

    // =============================================
    // AMD RESULT — voicemail detected on forwarded B-leg
    // =============================================
    if (eventType === 'call.machine.detection.ended') {
      const { businessId: amdBizId, callerPhone: amdCaller, forwarding, aLegCallControlId } = state

      if (forwarding && amdBizId && amdCaller) {
        const result = payload?.result as string // 'human' | 'machine' | 'not_sure'
        console.log('🤖 AMD result:', result, 'for', amdCaller)

        if (result === 'human') {
          // Real person answered — mark handled so hangup handler skips it
          await db.conversation.updateMany({
            where: { businessId: amdBizId, callerPhone: amdCaller, status: 'forwarding' },
            data: { status: 'active' },
          })
          console.log('✅ Human answered forwarded call, call proceeding')
        } else {
          // Voicemail — hang up B-leg before caller hears it, then notify caller via A-leg
          console.log('📵 Voicemail detected — hanging up B-leg, notifying caller on A-leg')
          // Mark handled so call.hangup won't double-send
          await db.conversation.updateMany({
            where: { businessId: amdBizId, callerPhone: amdCaller, status: 'forwarding' },
            data: { status: 'active' },
          })
          const bizForAmd = await db.business.findUnique({ where: { id: amdBizId } })
          if (bizForAmd) {
            const targetLeg = aLegCallControlId || callControlId
            await sendMissedCallSMS(telnyx, bizForAmd, targetLeg, amdCaller)
            // Hang up the B-leg (voicemail)
            try { await telnyx.calls.actions.hangup(callControlId, {}) } catch {}
            // Speak to the caller still on the A-leg
            if (aLegCallControlId) {
              try {
                await telnyx.calls.actions.speak(aLegCallControlId, {
                  payload:
                    'Sorry we missed your call. We have sent you a text message to assist you. Goodbye.',
                  voice: VOICE,
                })
              } catch {}
            }
          }
        }
      }

      return NextResponse.json({}, { status: 200 })
    }

    // =============================================
    // HANGUP on a forwarded B-leg (no-answer / timeout)
    // =============================================
    if (eventType === 'call.hangup') {
      const { businessId: hupBizId, callerPhone: hupCaller, forwarding: hupFwd, aLegCallControlId: hupALeg } = state

      if (hupFwd && hupBizId && hupCaller) {
        // If status is still 'forwarding', no human answered — send SMS and speak to caller
        const conv = await db.conversation.findFirst({
          where: { businessId: hupBizId, callerPhone: hupCaller, status: 'forwarding' },
        })

        if (conv) {
          console.log('📵 Forwarded call timed out, notifying caller on A-leg:', hupCaller)
          const bizForHup = await db.business.findUnique({ where: { id: hupBizId } })
          if (bizForHup) {
            const targetLeg = hupALeg || callControlId
            await sendMissedCallSMS(telnyx, bizForHup, targetLeg, hupCaller)
            if (hupALeg) {
              try {
                await telnyx.calls.actions.speak(hupALeg, {
                  payload:
                    'Sorry we missed your call. We have sent you a text message to assist you. Goodbye.',
                  voice: VOICE,
                })
              } catch {}
            }
          }
        }
      }

      return NextResponse.json({}, { status: 200 })
    }

    // =============================================
    // BRIDGING FAILED — forwarding number didn't answer (A-leg fallback)
    // =============================================
    if (eventType === 'call.bridging.failed') {
      const { businessId: bfBizId, callerPhone: bfCaller } = state
      if (bfBizId && bfCaller) {
        const conv = await db.conversation.findFirst({
          where: { businessId: bfBizId, callerPhone: bfCaller, status: 'forwarding' },
        })
        if (conv) {
          const biz = await db.business.findUnique({ where: { id: bfBizId } })
          if (biz) {
            await sendMissedCallSMS(telnyx, biz, callControlId, bfCaller)
            await telnyx.calls.actions.speak(callControlId, {
              payload:
                'Sorry we missed your call. We have sent you a text message to assist you. Goodbye.',
              voice: VOICE,
            })
          }
        }
      }
      return NextResponse.json({}, { status: 200 })
    }

    // Acknowledge all other events (call.answered, etc.)
    return NextResponse.json({}, { status: 200 })
  } catch (error) {
    console.error('❌ Error handling voice webhook:', error)
    return NextResponse.json({}, { status: 200 })
  }
}

// =============================================
// HELPERS
// =============================================

function toB64(obj: object): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64')
}

async function findBusiness(to: string): Promise<Business | null> {
  const exact = await db.business.findFirst({ where: { telnyxPhoneNumber: to } })
  if (exact) return exact

  const toDigits = (to ?? '').replace(/\D/g, '')
  if (!toDigits) return null

  const candidates = await db.business.findMany({ where: { telnyxPhoneNumber: { not: null } } })
  return (
    candidates.find(
      b => b.telnyxPhoneNumber && b.telnyxPhoneNumber.replace(/\D/g, '') === toDigits
    ) ?? null
  )
}

async function sendMissedCallSMS(
  telnyx: InstanceType<typeof Telnyx>,
  business: { id: string; name: string; aiGreeting: string | null; telnyxPhoneNumber: string | null },
  callControlId: string,
  callerPhone: string
) {
  // Reuse existing conversation (e.g. from screening) or create new
  let conversation = await db.conversation.findFirst({
    where: {
      OR: [
        { callSid: callControlId },
        {
          businessId: business.id,
          callerPhone,
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      ],
    },
  })

  if (conversation) {
    // Check if SMS already sent
    const alreadySent = await db.message.findFirst({
      where: { conversationId: conversation.id, direction: 'outbound' },
    })
    if (alreadySent) {
      console.log('📱 SMS already sent, skipping')
      return
    }
    if (conversation.status === 'screening' || conversation.status === 'screening_blocked') {
      await db.conversation.update({ where: { id: conversation.id }, data: { status: 'active' } })
    }
  } else {
    try {
      conversation = await db.conversation.create({
        data: { businessId: business.id, callerPhone, callSid: callControlId, status: 'active' },
      })
    } catch {
      // Unique constraint on callSid — find the existing one
      conversation = await db.conversation.findFirst({ where: { callSid: callControlId } })
      if (!conversation) return
    }
  }

  const greeting = (
    business.aiGreeting || `Sorry we missed your call at ${business.name}. How can we help?`
  ).slice(0, 140)

  try {
    const message = await telnyx.messages.send({
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

    console.log('📤 Sent initial SMS:', (message as any).data?.id)
  } catch (err) {
    console.error('❌ Failed to send SMS:', err)
  }
}

function isSpamCall(phone: string): boolean {
  const tollFreePatterns = ['+1833', '+1844', '+1855', '+1866', '+1877', '+1888', '+1800']
  if (tollFreePatterns.some(p => phone.startsWith(p))) return true
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 10) return true
  if (phone.startsWith('+1')) {
    const area = digits.substring(1, 4)
    if (area.startsWith('0') || area.startsWith('1')) return true
  }
  return false
}
