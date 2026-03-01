// ===========================================
// TELNYX VOICE WEBHOOK (CALL CONTROL API)
// ===========================================
// Single endpoint that handles ALL Telnyx Call Control events.
// Telnyx sends JSON; we respond 200 and make separate API calls
// to control the call (answer, speak, gather, hangup, bridge).
//
// Event flow — no screener:
//   call.initiated  → answer → speak missed-call message → sendMissedCallSMS
//   call.speak.ended → hangup
//
// Event flow — IVR screener (no forwarding number):
//   call.initiated  → answer → gatherUsingSpeak "press 1"
//   call.gather.ended (digit=1) → speak missed-call message + SMS
//   call.gather.ended (other)   → speak "goodbye"
//   call.speak.ended            → hangup
//
// Event flow — IVR screener WITH forwarding number:
//   call.initiated  → answer → gatherUsingSpeak "press 1"
//   call.gather.ended (digit=1) → speak "please hold" → create B-leg to forwarding number
//   B-leg call.answered         → bridge A+B legs immediately (no AMD)
//   B-leg call.hangup (timeout/no-answer/not connected) → speak msg on A, SMS
//   call.bridging.failed                                → speak msg on A, SMS
//
// NOTE: We intentionally do NOT use answering machine detection (AMD).
// AMD produces false positives with Google Voice, carrier voicemail
// greetings, and other systems that answer before the human does.
// Instead we rely on a simple 25-second timeout: if nobody picks up
// the B-leg rings out and the caller gets the missed-call message.

import { NextRequest, NextResponse } from 'next/server'
import type { Business } from '@prisma/client'
import { db } from '@/lib/db'
import Telnyx from 'telnyx'
import { checkCooldown, recordMessageSent, logCooldownSkip, isCooldownBypassNumber } from '@/lib/sms-cooldown'
import { isExistingContact, logContactSkip } from '@/lib/contacts-check'

const VOICE = 'AWS.Polly.Joanna'
const DEFAULT_VOICE_MESSAGE =
  "We're sorry we can't get to the phone right now. You should receive a text message shortly."
const FORWARDING_TIMEOUT_SECS = 25

interface ClientState {
  businessId?: string
  callerPhone?: string
  connectionId?: string
  forwardingPending?: boolean
  isForwardingLeg?: boolean
  aLegCallControlId?: string
}

export async function POST(request: NextRequest) {
  const webhookReceivedAt = new Date().toISOString()
  const timing: Record<string, string | number | undefined> = { webhookReceivedAt }
  try {
    console.log('⏱️ [VOICE] Webhook received at:', webhookReceivedAt)
    const body = await request.json()
    const eventType = body.data?.event_type as string
    const payload = body.data?.payload
    const callControlId = payload?.call_control_id as string
    const from = payload?.from as string
    const to = payload?.to as string
    const direction = payload?.direction as string
    const rawClientState = payload?.client_state as string | undefined

    console.log('📨 Event received:', eventType, 'callControlId:', payload?.call_control_id, 'legId:', payload?.leg_id)
    console.log('📞 Voice webhook:', { eventType, callControlId, from, to, direction })

    const telnyx = new Telnyx({ apiKey: process.env.TELNYX_API_KEY! })

    let state: ClientState = {}
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

      const connectionId = payload?.connection_id as string | undefined
      const clientState = toB64({ businessId: business.id, callerPhone: from, connectionId })
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
      } else {
        await sendMissedCallSMS(telnyx, business, callControlId, from, timing)
        const normalMsg = business.missedCallVoiceMessage || DEFAULT_VOICE_MESSAGE
        console.log('🔊 Speaking missed call message:', { callControlId, message: normalMsg })
        await telnyx.calls.actions.speak(callControlId, {
          payload: normalMsg,
          voice: VOICE,
        })
      }

      timing.totalMs = Date.now() - new Date(webhookReceivedAt).getTime()
      console.log('⏱️ [VOICE] Total time (call.initiated):', timing.totalMs, 'ms')
      return NextResponse.json({ ok: true, timing }, { status: 200 })
    }

    // =============================================
    // B-LEG ANSWERED → BRIDGE IMMEDIATELY
    // =============================================
    if (eventType === 'call.answered' && state.isForwardingLeg) {
      console.log('📞 Forwarding B-leg answered, bridging immediately:', {
        bLegCallControlId: callControlId,
        aLegCallControlId: state.aLegCallControlId,
      })

      try {
        await (telnyx.calls.actions as any).bridge(callControlId, {
          call_control_id: state.aLegCallControlId,
        })

        if (state.aLegCallControlId) {
          await db.conversation.updateMany({
            where: { callSid: state.aLegCallControlId, status: 'forwarding' },
            data: { callConnected: true, status: 'completed', answeredBy: 'human' },
          })
        }
      } catch (err) {
        console.error('❌ Failed to bridge calls:', err)
        await handleForwardingFallback(telnyx, state, 'failed', undefined, timing)
      }

      return NextResponse.json({}, { status: 200 })
    }

    // =============================================
    // SPEAK ENDED
    // =============================================
    if (eventType === 'call.speak.ended') {
      if (state.forwardingPending) {
        console.log('📞 "Please hold" finished — creating forwarding call to owner')

        const business = await db.business.findUnique({ where: { id: state.businessId! } })
        if (!business?.forwardingNumber) {
          console.error('❌ No forwarding number found, falling back to missed call flow')
          if (business) {
            await sendMissedCallSMS(telnyx, business, callControlId, state.callerPhone!, timing)
            await telnyx.calls.actions.speak(callControlId, {
              payload: business.missedCallVoiceMessage || DEFAULT_VOICE_MESSAGE,
              voice: VOICE,
              client_state: toB64({ businessId: state.businessId, callerPhone: state.callerPhone }),
            })
          } else {
            await telnyx.calls.actions.hangup(callControlId, {})
          }
          return NextResponse.json({}, { status: 200 })
        }

        const connectionId = state.connectionId || process.env.TELNYX_CONNECTION_ID
        if (!connectionId) {
          console.error('❌ No connection_id available for outbound call, falling back')
          await sendMissedCallSMS(telnyx, business, callControlId, state.callerPhone!, timing)
          await telnyx.calls.actions.speak(callControlId, {
            payload: business.missedCallVoiceMessage || DEFAULT_VOICE_MESSAGE,
            voice: VOICE,
            client_state: toB64({ businessId: state.businessId, callerPhone: state.callerPhone }),
          })
          return NextResponse.json({}, { status: 200 })
        }

        try {
          const bLegState = toB64({
            businessId: state.businessId,
            callerPhone: state.callerPhone,
            isForwardingLeg: true,
            aLegCallControlId: callControlId,
          })

          const outboundCall = await telnyx.calls.dial({
            connection_id: connectionId,
            to: business.forwardingNumber,
            from: state.callerPhone!,
            timeout_secs: FORWARDING_TIMEOUT_SECS,
            client_state: bLegState,
          })

          console.log('📞 Forwarding call created:', (outboundCall as any)?.data?.call_control_id)
        } catch (err) {
          console.error('❌ Failed to create forwarding call:', err)
          await sendMissedCallSMS(telnyx, business, callControlId, state.callerPhone!, timing)
          await telnyx.calls.actions.speak(callControlId, {
            payload: business.missedCallVoiceMessage || DEFAULT_VOICE_MESSAGE,
            voice: VOICE,
            client_state: toB64({ businessId: state.businessId, callerPhone: state.callerPhone }),
          })
        }
      } else {
        await telnyx.calls.actions.hangup(callControlId, {})
      }

      return NextResponse.json({}, { status: 200 })
    }

    // =============================================
    // GATHER ENDED → HANDLE DIGIT
    // =============================================
    if (eventType === 'call.gather.ended') {
      const { businessId, callerPhone: stateCallerPhone } = state
      const callerPhone = stateCallerPhone || from
      const digits = payload?.digits as string | undefined

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

        if (business.callScreenerEnabled && business.forwardingNumber) {
          // ---- FORWARDING FLOW ----
          console.log('📞 Initiating call forwarding to:', business.forwardingNumber)

          await db.conversation.upsert({
            where: { callSid: callControlId },
            create: {
              businessId,
              callerPhone,
              callSid: callControlId,
              aLegCallControlId: callControlId,
              status: 'forwarding',
            },
            update: { aLegCallControlId: callControlId, status: 'forwarding' },
          })

          const fwdState = toB64({
            businessId,
            callerPhone,
            connectionId: state.connectionId,
            forwardingPending: true,
          })
          await telnyx.calls.actions.speak(callControlId, {
            payload: 'Please hold while we connect your call.',
            voice: VOICE,
            client_state: fwdState,
          } as any)
        } else {
          // ---- STANDARD SCREENING FLOW (no forwarding) ----
          await sendMissedCallSMS(telnyx, business, callControlId, callerPhone, timing)
          const missedMsg = business.missedCallVoiceMessage || DEFAULT_VOICE_MESSAGE
          console.log('🔊 Speaking missed call message:', { callControlId, message: missedMsg })
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

      timing.totalMs = Date.now() - new Date(webhookReceivedAt).getTime()
      console.log('⏱️ [VOICE] Total time (call.gather.ended):', timing.totalMs, 'ms')
      return NextResponse.json({ ok: true, timing }, { status: 200 })
    }

    // =============================================
    // B-LEG HANGUP (forwarding calls only)
    // =============================================
    if (eventType === 'call.hangup' && state.isForwardingLeg) {
      console.log('📞 Forwarding B-leg hung up:', {
        bLegCallControlId: callControlId,
        aLegCallControlId: state.aLegCallControlId,
        cause: payload?.hangup_cause,
      })

      if (state.aLegCallControlId) {
        const conversation = await db.conversation.findUnique({
          where: { callSid: state.aLegCallControlId },
        })

        if (conversation?.callConnected) {
          console.log('✅ Forwarded call ended normally')
          await db.conversation.update({
            where: { id: conversation.id },
            data: {
              dialCallStatus: 'completed',
              callEndedAt: new Date(),
              durationSeconds: payload?.duration_secs ?? undefined,
            },
          })
          return NextResponse.json({}, { status: 200 })
        }

        if (conversation && conversation.status !== 'forwarding') {
          console.log('📞 Forwarding fallback already handled, skipping')
          return NextResponse.json({}, { status: 200 })
        }
      }

      await handleForwardingFallback(telnyx, state, 'no-answer', undefined, timing)
      timing.totalMs = Date.now() - new Date(webhookReceivedAt).getTime()
      console.log('⏱️ [VOICE] Total time (hangup fallback):', timing.totalMs, 'ms')
      return NextResponse.json({ ok: true, timing }, { status: 200 })
    }

    // =============================================
    // BRIDGE FAILED (forwarding calls only)
    // =============================================
    if (eventType === 'call.bridging.failed' && state.isForwardingLeg) {
      console.error('❌ Call bridging failed:', {
        bLegCallControlId: callControlId,
        aLegCallControlId: state.aLegCallControlId,
      })

      try {
        await telnyx.calls.actions.hangup(callControlId, {})
      } catch {}

      await handleForwardingFallback(telnyx, state, 'failed', undefined, timing)
      timing.totalMs = Date.now() - new Date(webhookReceivedAt).getTime()
      console.log('⏱️ [VOICE] Total time (bridge failed):', timing.totalMs, 'ms')
      return NextResponse.json({ ok: true, timing }, { status: 200 })
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

/**
 * Handles the fallback when call forwarding fails (machine detected, timeout, bridge error).
 * Plays the missed-call message on the A-leg and sends SMS.
 * Idempotent — checks conversation status and callConnected to prevent duplicate processing.
 */
async function handleForwardingFallback(
  telnyx: InstanceType<typeof Telnyx>,
  state: ClientState,
  dialCallStatus = 'no-answer',
  answeredBy?: string,
  timing?: Record<string, string | number | undefined>,
) {
  if (!state.businessId || !state.callerPhone || !state.aLegCallControlId) {
    console.error('❌ Missing state for forwarding fallback')
    return
  }

  const conversation = await db.conversation.findUnique({
    where: { callSid: state.aLegCallControlId },
  })

  if (!conversation) {
    console.error('❌ No conversation found for forwarding fallback')
    return
  }

  if (conversation.callConnected || conversation.status !== 'forwarding') {
    console.log('📞 Forwarding fallback skipped (already handled or call connected)')
    return
  }

  await db.conversation.update({
    where: { id: conversation.id },
    data: {
      status: 'active',
      dialCallStatus,
      answeredBy: answeredBy ?? conversation.answeredBy,
      callEndedAt: new Date(),
    },
  })

  const business = await db.business.findUnique({ where: { id: state.businessId } })
  if (!business) return

          await sendMissedCallSMS(telnyx, business, state.aLegCallControlId, state.callerPhone, timing)

  const missedMsg = business.missedCallVoiceMessage || DEFAULT_VOICE_MESSAGE
  try {
    await telnyx.calls.actions.speak(state.aLegCallControlId, {
      payload: missedMsg,
      voice: VOICE,
      client_state: toB64({ businessId: state.businessId, callerPhone: state.callerPhone }),
    })
  } catch (err) {
    console.error('❌ Failed to speak on A-leg (caller may have hung up):', err)
    try {
      await telnyx.calls.actions.hangup(state.aLegCallControlId, {})
    } catch {}
  }
}

async function sendMissedCallSMS(
  telnyx: InstanceType<typeof Telnyx>,
  business: { id: string; name: string; aiGreeting: string | null; telnyxPhoneNumber: string | null; smsCooldownDays?: number | null; cooldownBypassNumbers?: unknown },
  callControlId: string,
  callerPhone: string,
  timing?: Record<string, string | number | undefined>,
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
    if (conversation.callConnected) {
      console.log('📱 Call was connected, skipping SMS')
      return
    }

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
    if (timing) {
      timing.telnyxSendAt = new Date().toISOString()
      console.log('⏱️ [VOICE] Telnyx send API call started at:', timing.telnyxSendAt)
    }
    const message = await telnyx.messages.send({
      from: business.telnyxPhoneNumber!,
      to: callerPhone,
      text: greeting,
    })
    const data = (message as any)?.data
    const messageId = data?.id
    const status = data?.to?.[0]?.status ?? 'sent'

    if (timing) {
      timing.telnyxResponseAt = new Date().toISOString()
      timing.telnyxMessageId = messageId
      timing.telnyxStatus = status
      timing.totalMs = Date.now() - new Date(timing.webhookReceivedAt as string).getTime()
      console.log('⏱️ [VOICE] Telnyx API responded at:', timing.telnyxResponseAt, {
        success: true,
        telnyxMessageId: messageId,
        telnyxStatus: status,
        fullResponse: JSON.stringify(data),
        totalMs: timing.totalMs,
      })
    }
    console.log('📤 [VOICE] Sent initial SMS — Telnyx message ID:', messageId, '| Look up in Telnyx portal:', messageId)

    // Defer database writes — SMS is sent; logging can happen after
    const convId = conversation.id
    void db.message
      .create({
        data: {
          conversationId: convId,
          direction: 'outbound',
          content: greeting,
          telnyxSid: messageId ?? null,
          telnyxStatus: status,
        },
      })
      .then(() => recordMessageSent(business.id, callerPhone))
      .catch((err) => console.error('❌ [VOICE] Deferred DB log failed (SMS was sent):', err))
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    if (timing) {
      timing.telnyxResponseAt = new Date().toISOString()
      timing.telnyxError = errMsg
      console.log('⏱️ [VOICE] Telnyx API error at:', timing.telnyxResponseAt, { error: errMsg })
    }
    console.error('❌ [VOICE] Failed to send SMS:', err, '| Full:', JSON.stringify(err, Object.getOwnPropertyNames(err)))
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
