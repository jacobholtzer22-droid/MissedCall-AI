// ===========================================
// TELNYX VOICE WEBHOOK (CALL CONTROL API)
// ===========================================
// Single endpoint that handles ALL Telnyx Call Control events.
// Telnyx sends JSON; we respond 200 and make separate API calls
// to control the call (answer, speak, gather, transfer, hangup).
//
// Event flow — with forwarding number (no screener):
//   call.initiated  → answer → transfer to forwardingNumber (AMD enabled, 25s timeout)
//   call.answered (B-leg)     → mark callConnected=true
//   AMD=human                 → calls bridged, no SMS
//   AMD=machine / call.hangup (B-leg, not connected) → speak "we'll text you" + SMS
//
// Event flow — no forwarding number (no screener):
//   call.initiated  → answer → speak "we'll text you" → sendMissedCallSMS
//   call.speak.ended → hangup
//
// Event flow — IVR screener:
//   call.initiated  → answer → gatherUsingSpeak "press 1"
//   call.gather.ended (digit=1) + forwardingNumber → transfer to owner
//   call.gather.ended (digit=1) + no fwd           → SMS immediately
//   call.gather.ended (other)                      → speak "goodbye"
//   call.speak.ended                               → hangup

import { NextRequest, NextResponse } from 'next/server'
import type { Business } from '@prisma/client'
import { db } from '@/lib/db'
import Telnyx from 'telnyx'

const VOICE = 'AWS.Polly.Joanna'
const DEFAULT_VOICE_MESSAGE =
  "We're sorry we can't get to the phone right now. You should receive a text message shortly."

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

    console.log('📨 Event received:', eventType, 'callControlId:', payload?.call_control_id, 'legId:', payload?.leg_id)
    console.log('📞 Voice webhook:', { eventType, callControlId, from, to, direction })

    const telnyx = new Telnyx({ apiKey: process.env.TELNYX_API_KEY! })

    let state: {
      businessId?: string
      callerPhone?: string
      forwarding?: boolean
      aLegCallControlId?: string
    } = {}
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

      if (business.spamFilterEnabled && isSpamCall(from)) {
        console.log('🚫 Spam call blocked:', from)
        await db.screenedCall.create({
          data: { businessId: business.id, callerPhone: from, callSid: callControlId, result: 'blocked' },
        })
        await telnyx.calls.actions.reject(callControlId, { cause: 'CALL_REJECTED' })
        return NextResponse.json({}, { status: 200 })
      }

      const clientState = toB64({ businessId: business.id, callerPhone: from })
      await telnyx.calls.actions.answer(callControlId, { client_state: clientState } as any)

      if (business.callScreenerEnabled) {
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
      } else if (business.forwardingNumber) {
        // Transfer to the owner's phone (B-leg). AMD will distinguish human vs voicemail.
        await db.conversation.upsert({
          where: { callSid: callControlId },
          create: {
            businessId: business.id,
            callerPhone: from,
            status: 'forwarding',
            callSid: callControlId,
            aLegCallControlId: callControlId,
          },
          update: { callerPhone: from, status: 'forwarding', aLegCallControlId: callControlId },
        })

        const fwdState = toB64({
          businessId: business.id,
          callerPhone: from,
          forwarding: true,
          aLegCallControlId: callControlId,
        })
        console.log('📞 Transferring to owner:', business.forwardingNumber, 'caller:', from)
        await telnyx.calls.actions.transfer(callControlId, {
          to: business.forwardingNumber,
          from: from,
          answering_machine_detection: 'detect',
          client_state: fwdState,
          timeout_secs: 25,
        } as any)
      } else {
        // No forwarding number — play missed-call message and send SMS immediately
        await sendMissedCallSMS(telnyx, business, callControlId, from)
        const normalMsg = business.missedCallVoiceMessage || DEFAULT_VOICE_MESSAGE
        console.log('🔊 About to speak missed call message on A-leg:', { callControlId, message: normalMsg })
        await telnyx.calls.actions.speak(callControlId, {
          payload: normalMsg,
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
          // Transfer to owner after passing screener
          await db.conversation.updateMany({
            where: { callSid: callControlId },
            data: { status: 'forwarding', aLegCallControlId: callControlId },
          })

          const fwdState = toB64({
            businessId,
            callerPhone,
            forwarding: true,
            aLegCallControlId: callControlId,
          })
          await telnyx.calls.actions.transfer(callControlId, {
            to: business.forwardingNumber,
            from: callerPhone,
            answering_machine_detection: 'detect',
            client_state: fwdState,
            timeout_secs: 18,
          } as any)
        } else {
          await sendMissedCallSMS(telnyx, business, callControlId, callerPhone)
          const missedMsg = business.missedCallVoiceMessage || DEFAULT_VOICE_MESSAGE
          console.log('🔊 About to speak missed call message on A-leg:', { callControlId, message: missedMsg })
          await telnyx.calls.actions.speak(callControlId, {
            payload: missedMsg,
            voice: VOICE,
          })
        }
      } else {
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
    // B-LEG ANSWERED — owner's phone picked up
    // =============================================
    // Fires for BOTH human and machine answers, before AMD completes.
    // We mark callConnected=true as an early signal. If AMD later
    // determines it was a machine, the AMD handler resets it and
    // sends SMS itself. This closes the race window where call.hangup
    // could arrive before call.machine.detection.ended.
    if (eventType === 'call.answered' && state.forwarding) {
      const { businessId: ansBizId, callerPhone: ansCaller } = state
      if (ansBizId && ansCaller) {
        console.log('📞 B-leg answered for', ansCaller, '— marking callConnected=true')
        await db.conversation.updateMany({
          where: { businessId: ansBizId, callerPhone: ansCaller, status: 'forwarding' },
          data: { callConnected: true },
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
        const result = payload?.result as string
        console.log('🤖 AMD result:', result, 'for', amdCaller)
        console.log('🤖 AMD full payload:', JSON.stringify(payload))

        if (result === 'human') {
          // Owner answered — keep callConnected=true, update status so hangup won't trigger SMS
          await db.conversation.updateMany({
            where: { businessId: amdBizId, callerPhone: amdCaller, status: 'forwarding' },
            data: { callConnected: true, status: 'active' },
          })
          console.log('✅ Human answered forwarded call, call proceeding')
        } else {
          // Machine/voicemail — reset callConnected, hangup B-leg, notify caller
          console.log('📵 Machine/voicemail detected — hanging up B-leg, notifying caller on A-leg')

          await db.conversation.updateMany({
            where: { businessId: amdBizId, callerPhone: amdCaller, status: 'forwarding' },
            data: { callConnected: false, status: 'active' },
          })

          try { await telnyx.calls.actions.hangup(callControlId, {}) } catch {}

          const bizForAmd = await db.business.findUnique({ where: { id: amdBizId } })
          if (bizForAmd) {
            const targetLeg = aLegCallControlId || callControlId

            if (aLegCallControlId) {
              try {
                const amdMsg = bizForAmd.missedCallVoiceMessage || DEFAULT_VOICE_MESSAGE
                console.log('🔊 About to speak missed call message on A-leg:', { callControlId: aLegCallControlId, message: amdMsg })
                await telnyx.calls.actions.speak(aLegCallControlId, {
                  payload: amdMsg,
                  voice: VOICE,
                })
              } catch {}
            }

            await sendMissedCallSMS(telnyx, bizForAmd, targetLeg, amdCaller)
          }
        }
      }

      return NextResponse.json({}, { status: 200 })
    }

    // =============================================
    // HANGUP on a forwarded B-leg (no-answer / timeout)
    // =============================================
    if (eventType === 'call.hangup') {
      const hangupCause = payload?.hangup_cause as string | undefined
      console.log('📴 Hangup:', {
        callControlId: payload?.call_control_id,
        from,
        to,
        direction: payload?.direction,
        hangupCause,
        hasClientState: !!rawClientState,
        state: JSON.stringify(state),
      })

      const { businessId: hupBizId, callerPhone: hupCaller, forwarding: hupFwd, aLegCallControlId: hupALeg } = state

      let conv: Awaited<ReturnType<typeof db.conversation.findFirst>> = null

      // Primary: client_state says this was a forwarded B-leg
      if (hupFwd && hupBizId && hupCaller) {
        conv = await db.conversation.findFirst({
          where: { businessId: hupBizId, callerPhone: hupCaller, status: 'forwarding' },
        })
      }

      // Fallback: client_state missing — look for any in-progress forwarding conversation
      if (!conv) {
        conv = await db.conversation.findFirst({
          where: { status: 'forwarding', aLegCallControlId: { not: null } },
          orderBy: { updatedAt: 'desc' },
        })
        if (conv) {
          console.log('📴 Hangup: DB fallback found conversation:', conv.id)
        }
      }

      if (conv) {
        // B-leg was answered (callConnected=true) → owner handled the call, no SMS needed
        if (conv.callConnected) {
          console.log('✅ B-leg was connected (callConnected=true) — skipping missed-call SMS')
          await db.conversation.update({ where: { id: conv.id }, data: { status: 'completed' } })
          return NextResponse.json({}, { status: 200 })
        }

        // B-leg was NOT answered → missed call, send SMS
        const aLeg = conv.aLegCallControlId || hupALeg || callControlId
        const callerPhone = hupCaller || conv.callerPhone

        console.log('📵 Forwarded call ended without connect (cause: %s), notifying caller (aLeg: %s)', hangupCause, aLeg)

        await db.conversation.update({ where: { id: conv.id }, data: { status: 'active' } })
        const bizForHup = await db.business.findUnique({ where: { id: conv.businessId } })
        if (bizForHup) {
          await sendMissedCallSMS(telnyx, bizForHup, aLeg, callerPhone)
          try {
            const hupMsg = bizForHup.missedCallVoiceMessage || DEFAULT_VOICE_MESSAGE
            console.log('🔊 About to speak missed call message on A-leg:', { callControlId: aLeg, message: hupMsg })
            await telnyx.calls.actions.speak(aLeg, {
              payload: hupMsg,
              voice: VOICE,
            })
          } catch (speakErr) {
            console.error('❌ Failed to speak on A-leg:', speakErr)
          }
        }
      } else {
        console.log('📴 Normal hangup — no forwarding conversation found, skipping.')
      }

      return NextResponse.json({}, { status: 200 })
    }

    // =============================================
    // BRIDGING FAILED — forwarding number unreachable
    // =============================================
    if (eventType === 'call.bridging.failed') {
      console.log('🚫 Bridge failed:', JSON.stringify(payload))
      const { businessId: bfBizId, callerPhone: bfCaller } = state
      if (bfBizId && bfCaller) {
        const conv = await db.conversation.findFirst({
          where: { businessId: bfBizId, callerPhone: bfCaller, status: 'forwarding' },
        })
        if (conv) {
          await db.conversation.update({ where: { id: conv.id }, data: { status: 'active' } })
          const biz = await db.business.findUnique({ where: { id: bfBizId } })
          if (biz) {
            await sendMissedCallSMS(telnyx, biz, callControlId, bfCaller)
            const bfMsg = biz.missedCallVoiceMessage || DEFAULT_VOICE_MESSAGE
            console.log('🔊 About to speak missed call message on A-leg:', { callControlId, message: bfMsg })
            await telnyx.calls.actions.speak(callControlId, {
              payload: bfMsg,
              voice: VOICE,
            })
          }
        }
      }
      return NextResponse.json({}, { status: 200 })
    }

    // Acknowledge all other events
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
