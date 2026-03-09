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
//   call.gather.ended (wrong digit) → speak "goodbye" then hangup
//   call.gather.ended (timeout, no DTMF) → hangup immediately (no message, no SMS; e.g. robocall)
//   call.speak.ended            → hangup
//
// Event flow — IVR screener WITH forwarding number:
//   call.initiated  → answer → gatherUsingSpeak "press 1"
//   call.gather.ended (digit=1) → speak "please hold" (forwardingPending: true)
//   call.speak.ended (forwardingPending) → dial B-leg only (ringback_tone on A-leg; caller hears ringing)
//   B-leg call.answered         → speak on B-leg "Incoming call from [digits]" (announceCallerPending in client_state)
//   B-leg call.speak.ended (announceCallerPending) → bridge A+B legs
//   B-leg call.hangup (timeout/no-answer/not connected) → speak msg on A, SMS
//   call.bridging.failed                                → speak msg on A, SMS
//
// NOTE: We intentionally do NOT use answering machine detection (AMD).
// AMD produces false positives with Google Voice, carrier voicemail
// greetings, and other systems that answer before the human does.
// Ring timeout on the B-leg: if missedCallAiEnabled, we use a shorter
// timeout so unanswered calls return and trigger the missed-call SMS flow;
// if missedCallAiDisabled, we use 20s so the owner's voicemail can pick up (~4-5 rings).

import { NextRequest, NextResponse } from 'next/server'
import type { Business } from '@prisma/client'
import { Prisma } from '@prisma/client'
import { put } from '@vercel/blob'
import { Resend } from 'resend'
import { db } from '@/lib/db'
import Telnyx from 'telnyx'
import { format } from 'date-fns'
import { checkCooldown, recordMessageSent, logCooldownSkip, isCooldownBypassNumber } from '@/lib/sms-cooldown'
import { isExistingContact, logContactSkip } from '@/lib/contacts-check'

const VOICE = 'AWS.Polly.Joanna'
const DEFAULT_VOICE_MESSAGE =
  "We're sorry we can't get to the phone right now. You should receive a text message shortly."
const NO_SMS_VOICE_MESSAGE =
  "We're sorry, no one is available. Please try again later. Goodbye."
const FORWARDING_TIMEOUT_SECS = 25       // When missedCallAiEnabled: ring out quickly → missed call SMS flow
const FORWARDING_TIMEOUT_VOICEMAIL_SECS = 20  // When missedCallAiDisabled: longer ring so owner voicemail can pick up (~4-5 rings)

const HOLD_MESSAGE_PAYLOAD =
  'We are connecting you. . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . Please stay on the line. . . . . . . . . . . . . . . . . . . . . . . . . . . .'

interface ClientState {
  businessId?: string
  callerPhone?: string
  connectionId?: string
  forwardingPending?: boolean
  dialAlreadyStarted?: boolean
  isForwardingLeg?: boolean
  aLegCallControlId?: string
  voicemailPending?: boolean
  announceCallerPending?: boolean
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
          maximum_tries: 1,
        })
      } else {
        if (business.missedCallAiEnabled) {
          await sendMissedCallSMS(telnyx, business, callControlId, from, timing)
        } else {
          console.log('MissedCall AI disabled, skipping SMS')
        }
        const normalMsg = business.missedCallAiEnabled
          ? (business.missedCallVoiceMessage || DEFAULT_VOICE_MESSAGE)
          : (business.missedCallVoiceMessage || NO_SMS_VOICE_MESSAGE)
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
    // B-LEG ANSWERED → ANNOUNCE CALLER THEN BRIDGE (on speak.ended)
    // =============================================
    if (eventType === 'call.answered' && state.isForwardingLeg) {
      const callerPhone = state.callerPhone || ''
      const digitsOnly = callerPhone.replace(/\D/g, '')
      const digitsToRead = digitsOnly.startsWith('1') && digitsOnly.length === 11
        ? digitsOnly.slice(1)
        : digitsOnly
      const announcement =
        'Incoming call from ' + (digitsToRead ? digitsToRead.split('').join(' ') : 'unknown number')

      console.log('📞 Forwarding B-leg answered, announcing caller then will bridge on speak.ended:', {
        bLegCallControlId: callControlId,
        aLegCallControlId: state.aLegCallControlId,
        callerPhone,
      })

      try {
        await telnyx.calls.actions.speak(callControlId, {
          payload: announcement,
          voice: VOICE,
          client_state: toB64({
            ...state,
            announceCallerPending: true,
          }),
        })
      } catch (err) {
        console.error('❌ Failed to speak caller announcement on B-leg, bridging immediately:', err)
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
        } catch (bridgeErr) {
          console.error('❌ Failed to bridge calls:', bridgeErr)
          await handleForwardingFallback(telnyx, state, 'failed', undefined, timing)
        }
      }

      return NextResponse.json({}, { status: 200 })
    }

    // =============================================
    // SPEAK ENDED
    // =============================================
    if (eventType === 'call.speak.ended') {
      // B-leg: caller announcement finished → bridge A and B legs
      if (state.announceCallerPending && state.isForwardingLeg && state.aLegCallControlId) {
        console.log('📞 Caller announcement ended — bridging A and B legs:', {
          bLegCallControlId: callControlId,
          aLegCallControlId: state.aLegCallControlId,
        })
        try {
          await (telnyx.calls.actions as any).bridge(callControlId, {
            call_control_id: state.aLegCallControlId,
          })
          await db.conversation.updateMany({
            where: { callSid: state.aLegCallControlId, status: 'forwarding' },
            data: { callConnected: true, status: 'completed', answeredBy: 'human' },
          })
        } catch (err) {
          console.error('❌ Failed to bridge after announcement:', err)
          await handleForwardingFallback(telnyx, state, 'failed', undefined, timing)
        }
        return NextResponse.json({}, { status: 200 })
      }

      // Voicemail flow (spam-screening-only): greeting finished → start recording
      if (state.voicemailPending) {
        console.log('📞 Voicemail greeting ended — starting recording')
        try {
          await (telnyx.calls.actions as any).startRecording(callControlId, {
            format: 'mp3',
            channels: 'single',
            max_length: 120,
            timeout_secs: 5,
            play_beep: true,
          })
        } catch (err) {
          console.error('❌ Failed to start voicemail recording:', err)
          try {
            await telnyx.calls.actions.hangup(callControlId, {})
          } catch {}
        }
        return NextResponse.json({}, { status: 200 })
      }

      if (state.forwardingPending) {
        if (state.dialAlreadyStarted) {
          console.log('📞 Hold message finished — B-leg was already dialed in parallel, nothing to do')
          return NextResponse.json({}, { status: 200 })
        }
        console.log('📞 "Please hold" finished — dialing B-leg (caller hears ringback until answer)')

        const business = await db.business.findUnique({ where: { id: state.businessId! } })
        if (!business?.forwardingNumber) {
          console.error('❌ No forwarding number found, falling back to missed call flow')
          if (business) {
            if (business.missedCallAiEnabled) {
              await sendMissedCallSMS(telnyx, business, callControlId, state.callerPhone!, timing)
            } else {
              console.log('MissedCall AI disabled, skipping SMS')
            }
            const fallbackMsg = business.missedCallAiEnabled
              ? (business.missedCallVoiceMessage || DEFAULT_VOICE_MESSAGE)
              : (business.missedCallVoiceMessage || NO_SMS_VOICE_MESSAGE)
            await telnyx.calls.actions.speak(callControlId, {
              payload: fallbackMsg,
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
          if (business.missedCallAiEnabled) {
            await sendMissedCallSMS(telnyx, business, callControlId, state.callerPhone!, timing)
          } else {
            console.log('MissedCall AI disabled, skipping SMS')
          }
          const fallbackMsg = business.missedCallAiEnabled
            ? (business.missedCallVoiceMessage || DEFAULT_VOICE_MESSAGE)
            : (business.missedCallVoiceMessage || NO_SMS_VOICE_MESSAGE)
          await telnyx.calls.actions.speak(callControlId, {
            payload: fallbackMsg,
            voice: VOICE,
            client_state: toB64({ businessId: state.businessId, callerPhone: state.callerPhone }),
          })
          return NextResponse.json({}, { status: 200 })
        }

        const ringTimeoutSecs = business.missedCallAiEnabled
          ? FORWARDING_TIMEOUT_SECS
          : FORWARDING_TIMEOUT_VOICEMAIL_SECS
        const bLegState = toB64({
          businessId: state.businessId,
          callerPhone: state.callerPhone,
          isForwardingLeg: true,
          aLegCallControlId: callControlId,
          announceCallerPending: true,
        })

        console.log('📞 B-leg ring timeout:', ringTimeoutSecs, 's (missedCallAiEnabled:', business.missedCallAiEnabled, ')')

        try {
          const dialResult = await telnyx.calls.dial({
            connection_id: connectionId,
            to: business.forwardingNumber,
            from: business.telnyxPhoneNumber!,
            timeout_secs: ringTimeoutSecs,
            client_state: bLegState,
            ringback_tone: true,
          } as any)
          const dialValue = dialResult as { data?: { call_control_id?: string } }
          console.log('📞 Forwarding call created:', dialValue?.data?.call_control_id)
        } catch (dialErr) {
          console.error('❌ Failed to create forwarding call:', dialErr)
          if (business.missedCallAiEnabled) {
            await sendMissedCallSMS(telnyx, business, callControlId, state.callerPhone!, timing)
          } else {
            console.log('MissedCall AI disabled, skipping SMS')
          }
          const fallbackMsg = business.missedCallAiEnabled
            ? (business.missedCallVoiceMessage || DEFAULT_VOICE_MESSAGE)
            : (business.missedCallVoiceMessage || NO_SMS_VOICE_MESSAGE)
          await telnyx.calls.actions.speak(callControlId, {
            payload: fallbackMsg,
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

          const connectionId = state.connectionId || process.env.TELNYX_CONNECTION_ID
          const ringTimeoutSecs = business.missedCallAiEnabled
            ? FORWARDING_TIMEOUT_SECS
            : FORWARDING_TIMEOUT_VOICEMAIL_SECS
          const bLegState = toB64({
            businessId,
            callerPhone,
            isForwardingLeg: true,
            aLegCallControlId: callControlId,
            announceCallerPending: true,
          })
          const fwdState = toB64({
            businessId,
            callerPhone,
            connectionId: state.connectionId,
            forwardingPending: true,
            dialAlreadyStarted: !!connectionId,
          })

          if (connectionId) {
            // Start B-leg dial and hold message in parallel so silence plays while phone is ringing
            const speakPromise = telnyx.calls.actions.speak(callControlId, {
              payload: HOLD_MESSAGE_PAYLOAD,
              voice: VOICE,
              client_state: fwdState,
            } as any)
            const dialPromise = telnyx.calls.dial({
              connection_id: connectionId,
              to: business.forwardingNumber,
              from: business.telnyxPhoneNumber!,
              timeout_secs: ringTimeoutSecs,
              client_state: bLegState,
              ringback_tone: true,
            } as any)
            const [speakResult, dialResult] = await Promise.allSettled([speakPromise, dialPromise])
            if (dialResult.status === 'rejected') {
              console.error('❌ Failed to create forwarding call (parallel dial):', dialResult.reason)
              if (business.missedCallAiEnabled) {
                await sendMissedCallSMS(telnyx, business, callControlId, callerPhone, timing)
              } else {
                console.log('MissedCall AI disabled, skipping SMS')
              }
              const fallbackMsg = business.missedCallAiEnabled
                ? (business.missedCallVoiceMessage || DEFAULT_VOICE_MESSAGE)
                : (business.missedCallVoiceMessage || NO_SMS_VOICE_MESSAGE)
              await telnyx.calls.actions.speak(callControlId, {
                payload: fallbackMsg,
                voice: VOICE,
                client_state: toB64({ businessId, callerPhone }),
              })
            } else {
              const dialValue = (dialResult.value as { data?: { call_control_id?: string } })?.data
              console.log('📞 Forwarding call created (parallel):', dialValue?.call_control_id)
            }
          } else {
            await telnyx.calls.actions.speak(callControlId, {
              payload: HOLD_MESSAGE_PAYLOAD,
              voice: VOICE,
              client_state: fwdState,
            } as any)
          }
        } else {
          // ---- STANDARD SCREENING FLOW (no forwarding) ----
          if (business.missedCallAiEnabled) {
            await sendMissedCallSMS(telnyx, business, callControlId, callerPhone, timing)
          } else {
            console.log('MissedCall AI disabled, skipping SMS')
          }
          const missedMsg = business.missedCallAiEnabled
            ? (business.missedCallVoiceMessage || DEFAULT_VOICE_MESSAGE)
            : (business.missedCallVoiceMessage || NO_SMS_VOICE_MESSAGE)
          console.log('🔊 Speaking missed call message:', { callControlId, message: missedMsg })
          await telnyx.calls.actions.speak(callControlId, {
            payload: missedMsg,
            voice: VOICE,
          })
        }
      } else {
        const noInput = digits == null || digits === ''
        console.log(noInput ? '🚫 Gather timeout (no DTMF) — hanging up' : '🚫 Caller blocked (wrong digit):', callerPhone)
        await db.conversation.updateMany({
          where: { callSid: callControlId },
          data: { status: 'screening_blocked' },
        })
        await db.screenedCall.create({
          data: { businessId, callerPhone, callSid: callControlId, result: 'blocked' },
        })
        if (noInput) {
          // Timeout with no keypress (e.g. robocall): end call immediately, no message, no SMS
          await telnyx.calls.actions.hangup(callControlId, {})
        } else {
          await telnyx.calls.actions.speak(callControlId, {
            payload: 'Thanks for calling. Goodbye.',
            voice: VOICE,
          })
        }
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

    // =============================================
    // RECORDING SAVED (voicemail flow)
    // =============================================
    if (eventType === 'call.recording.saved') {
      const recordingUrls = payload?.recording_urls ?? payload?.public_recording_urls
      const telnyxRecordingUrl = recordingUrls?.mp3 as string | undefined
      if (telnyxRecordingUrl) {
        const conv = await db.conversation.findUnique({ where: { callSid: callControlId } })
        if (conv) {
          let urlToSave = telnyxRecordingUrl
          try {
            console.log('📦 BLOB_READ_WRITE_TOKEN set:', !!process.env.BLOB_READ_WRITE_TOKEN)
            console.log('📦 Fetching recording from Telnyx URL:', telnyxRecordingUrl)
            const response = await fetch(telnyxRecordingUrl)
            console.log('📦 Fetch response status:', response.status)
            if (!response.ok) throw new Error(`Fetch failed: ${response.status}`)
            const arrayBuffer = await response.arrayBuffer()
            const buffer = Buffer.from(arrayBuffer)
            console.log('📦 Uploading to Vercel Blob...')
            const { url: blobUrl } = await put(`voicemails/${callControlId}.mp3`, buffer, {
              access: 'public',
              contentType: 'audio/mpeg',
            })
            console.log('📦 Blob upload success:', blobUrl)
            urlToSave = blobUrl
          } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err))
            console.log('📦 Blob upload FAILED, using Telnyx URL:', error.message)
            console.error('❌ Failed to fetch or upload recording to Vercel Blob, using Telnyx URL:', err)
          }
          await db.conversation.update({
            where: { id: conv.id },
            data: { recordingUrl: urlToSave } as Prisma.ConversationUpdateInput,
          })
          console.log('📞 Voicemail recording saved to conversation:', { callControlId, recordingUrl: urlToSave })

          // Voicemail notifications to business owner (only when missedCallAiEnabled is false)
          const business = await db.business.findUnique({
            where: { id: conv.businessId },
            select: {
              missedCallAiEnabled: true,
              notifyBySms: true,
              ownerPhone: true,
              notifyByEmail: true,
              ownerEmail: true,
              name: true,
              telnyxPhoneNumber: true,
            },
          })
          if (business && !business.missedCallAiEnabled) {
            // Brief wait for transcription (call.transcription may have already saved it)
            await new Promise((r) => setTimeout(r, 8000))
            const convUpdated = await db.conversation.findUnique({ where: { id: conv.id } })
            const transcriptionText = (convUpdated as { voicemailTranscription?: string | null } | null)?.voicemailTranscription?.trim() || null
            const callerPhone = convUpdated?.callerPhone ?? conv.callerPhone ?? 'Unknown'

            if (business.notifyBySms && business.ownerPhone && business.telnyxPhoneNumber) {
              try {
                const smsBody = [
                  `New voicemail from ${callerPhone}`,
                  transcriptionText || 'Transcription not available',
                  'View: https://www.alignandacquire.com/dashboard/voicemails',
                ].join('\n')
                await telnyx.messages.send({
                  from: business.telnyxPhoneNumber,
                  to: business.ownerPhone,
                  text: smsBody,
                })
                console.log('📞 Voicemail SMS notification sent to owner:', business.ownerPhone)
              } catch (err) {
                console.error('❌ Failed to send voicemail SMS notification:', err)
              }
            }

            if (business.notifyByEmail && business.ownerEmail) {
              try {
                const resend = new Resend(process.env.RESEND_API_KEY)
                const dateTime = convUpdated?.createdAt
                  ? format(convUpdated.createdAt, 'PPpp')
                  : new Date().toISOString()
                const transcriptionHtml = transcriptionText
                  ? `<p><strong>Transcription:</strong></p><p style="white-space: pre-wrap; background: #f5f5f5; padding: 12px; border-radius: 6px;">${transcriptionText.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`
                  : '<p><em>Transcription not available.</em></p>'
                const htmlBody = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>New Voicemail</title></head>
<body style="font-family: system-ui, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111;">
  <h2 style="margin-top: 0;">New Voicemail</h2>
  <p><strong>From:</strong> ${callerPhone}</p>
  <p><strong>Date &amp; time:</strong> ${dateTime}</p>
  ${transcriptionHtml}
  <p><a href="https://www.alignandacquire.com/dashboard/voicemails" style="color: #2563eb;">View in Dashboard</a></p>
</body>
</html>`
                await resend.emails.send({
                  from: 'notifications@alignandacquire.com',
                  to: business.ownerEmail,
                  subject: `New Voicemail - ${business.name}`,
                  html: htmlBody,
                })
                console.log('📞 Voicemail email notification sent to owner:', business.ownerEmail)
              } catch (err) {
                console.error('❌ Failed to send voicemail email notification:', err)
              }
            }
          }
        }
      }
      try {
        await telnyx.calls.actions.hangup(callControlId, {})
      } catch (err) {
        console.error('❌ Failed to hangup after recording saved:', err)
      }
      return NextResponse.json({}, { status: 200 })
    }

    // =============================================
    // TRANSCRIPTION (voicemail flow — save to conversation)
    // =============================================
    // call.transcription = real-time; call.recording.transcription.saved = when recording transcription is ready
    if (eventType === 'call.transcription' || eventType === 'call.recording.transcription.saved') {
      const text =
        (payload?.transcription_text as string) ??
        (payload?.text as string) ??
        (payload?.content as string)
      if (text && typeof text === 'string') {
        const conv = await db.conversation.findUnique({ where: { callSid: callControlId } })
        if (conv) {
          await db.conversation.update({
            where: { id: conv.id },
            data: { voicemailTranscription: text } as Prisma.ConversationUpdateInput,
          })
          console.log('📞 Voicemail transcription saved to conversation:', { callControlId, length: text.length })
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

  if (business.missedCallAiEnabled) {
    await sendMissedCallSMS(telnyx, business, state.aLegCallControlId, state.callerPhone, timing)
  } else {
    console.log('MissedCall AI disabled, skipping SMS')
  }

  if (business.missedCallAiEnabled) {
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
  } else {
    // Spam-screening-only: play voicemail greeting then record
    const voicemailGreeting =
      'Sorry, no one is available to take your call right now. Please leave a message after the tone.'
    try {
      await telnyx.calls.actions.speak(state.aLegCallControlId, {
        payload: voicemailGreeting,
        voice: VOICE,
        client_state: toB64({
          businessId: state.businessId,
          callerPhone: state.callerPhone,
          voicemailPending: true,
        }),
      })
    } catch (err) {
      console.error('❌ Failed to speak voicemail greeting on A-leg:', err)
      try {
        await telnyx.calls.actions.hangup(state.aLegCallControlId, {})
      } catch {}
    }
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

  const greeting =
    business.aiGreeting || `Sorry we missed your call at ${business.name}. How can we help?`

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
