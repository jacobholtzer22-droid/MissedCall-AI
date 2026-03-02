// ===========================================
// TELNYX SMS WEBHOOK
// ===========================================
// Handles two event types from Telnyx:
//   message.received  → inbound SMS from a customer → AI reply
//   message.finalized → delivery status update → log to DB

import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import Telnyx from 'telnyx'
import Anthropic from '@anthropic-ai/sdk'
import { addDays, addMonths, addYears } from 'date-fns'
import { TZDate } from '@date-fns/tz'
import { getAvailableSlots, getTwoClosestSlotsOnDay, isSpecificSlotAvailable, parseBusinessHours } from '@/lib/google-calendar'
import { createBooking, cleanServiceForOwner } from '@/lib/create-booking'
import { notifyOwnerOnHumanNeeded, notifyOwnerOnLeadCaptured } from '@/lib/notify-owner'
import { recordMessageSent } from '@/lib/sms-cooldown'
import { formatPhoneNumber } from '@/lib/utils'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? '' })

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const

/** Get today's date string (YYYY-MM-DD) in business timezone. Never use UTC. */
function getTodayInTimezone(tz: string): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: tz })
}

/** Get tomorrow's date string (YYYY-MM-DD) in business timezone. */
function getTomorrowInTimezone(tz: string): string {
  const nowInTz = new TZDate(new Date(), tz)
  const tomorrow = addDays(nowInTz, 1)
  return tomorrow.toLocaleDateString('en-CA', { timeZone: tz })
}

const MONTH_NAMES: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5, july: 6,
  august: 7, september: 8, october: 9, november: 10, december: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
}

/** Parse "YYYY-MM-DD HH:mm" or "YYYY-MM-DD HH:mm:ss" as BUSINESS local time (not UTC). */
function parseDatetimeInBusinessTz(datetimeStr: string, tz: string): Date {
  const match = datetimeStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/)
  if (!match) return new Date(datetimeStr)
  const [, y, m, d, h, min, sec] = match
  const d2 = new TZDate(
    parseInt(y!, 10),
    parseInt(m!, 10) - 1,
    parseInt(d!, 10),
    parseInt(h!, 10),
    parseInt(min!, 10),
    parseInt(sec || '0', 10),
    0,
    tz
  )
  return new Date(d2.getTime())
}

/** Format date as "Friday, March 6th" for clear SMS confirmation. */
function formatDateFull(isoOrDateStr: string | Date, tz: string): string {
  const d = typeof isoOrDateStr === 'string' ? new Date(isoOrDateStr) : isoOrDateStr
  const day = parseInt(d.toLocaleDateString('en-CA', { day: 'numeric', timeZone: tz }), 10)
  const ordinal = (n: number) => {
    const s = ['th', 'st', 'nd', 'rd']
    const v = n % 100
    return n + (s[(v - 20) % 10] || s[v] || s[0])
  }
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long', timeZone: tz })
  const month = d.toLocaleDateString('en-US', { month: 'long', timeZone: tz })
  return `${weekday}, ${month} ${ordinal(day)}`
}

const DEFAULT_MAX_MESSAGES_PER_CONVERSATION = 25
const BOOKING_INTENT_WORDS = [
  'book', 'appointment', 'schedule', 'booking', 'reserve',
  'quote', 'estimate', 'come out', 'come by', 'stop by',
  'take a look', 'set up', 'set me up', 'sign me up',
  'available', 'availability', 'free quote', 'free estimate',
  'in-person', 'in person', 'get on the schedule',
  'when can you', 'what times', 'open slots',
]

/** Returns customer-facing "call us" phrase. Uses forwardingNumber (owner's real number), never Telnyx. */
function getCallUsPhrase(business: { forwardingNumber?: string | null }): string {
  if (business.forwardingNumber?.trim()) {
    const formatted = formatPhoneNumber(business.forwardingNumber.trim())
    return `give us a call at ${formatted}`
  }
  return 'call us directly'
}
const CONVERSATION_TIMEOUT_HOURS = 24
const SPAM_WINDOW_SECONDS = 30

// Timing data for debugging slow responses
type WebhookTiming = {
  webhookReceivedAt: string
  aiStartAt?: string
  aiEndAt?: string
  telnyxSendAt?: string
  telnyxResponseAt?: string
  telnyxMessageId?: string
  telnyxStatus?: string
  telnyxError?: string
  totalMs?: number
}

function createTiming(): WebhookTiming & { now: () => string } {
  const received = new Date().toISOString()
  return {
    webhookReceivedAt: received,
    now: () => new Date().toISOString(),
  }
}

export async function POST(request: NextRequest) {
  const timing = createTiming()
  try {
    const body = await request.json()
    const eventType = body.data?.event_type as string
    const payload = body.data?.payload

    console.log('⏱️ [SMS] Webhook received at:', timing.webhookReceivedAt, '| event:', eventType)

    // ── Delivery status update ──────────────────────────────────────
    if (eventType === 'message.finalized' || eventType === 'message.sent') {
      const messageId = payload?.id as string
      const status = payload?.to?.[0]?.status as string | undefined
      if (messageId && status) {
        await db.message.updateMany({
          where: { telnyxSid: messageId },
          data: { telnyxStatus: status },
        })
        console.log(`📬 SMS status update: ${messageId} → ${status}`)
      }
      return new NextResponse('OK', { status: 200 })
    }

    // ── Inbound SMS ─────────────────────────────────────────────────
    if (eventType === 'message.received') {
      const messageSid = payload?.id as string
      const from = (payload?.from?.phone_number ?? payload?.from) as string
      const to = (payload?.to?.[0]?.phone_number ?? payload?.to) as string
      const text = payload?.text as string

      console.log('💬 Incoming SMS:', { messageSid, from, to, text })

      const business = await db.business.findFirst({ where: { telnyxPhoneNumber: to } })
      if (!business) {
        console.log('⚠️ No business found for phone number:', to)
        return new NextResponse('OK', { status: 200 })
      }

      // STOP / unsubscribe — legally required immediate stop
      const stopWords = ['stop', 'unsubscribe', 'cancel', 'quit']
      if (stopWords.includes(text?.toLowerCase().trim())) {
        console.log('🛑 User requested STOP')
        await sendSMS(business, from, "You've been unsubscribed. Reply START to resubscribe.")
        return new NextResponse('OK', { status: 200 })
      }

      // "Never mind" / "not interested" — acknowledge, flag, notify owner as partial interest
      const neverMindPhrases = ['never mind', 'nevermind', 'not interested', 'no thanks', 'no thank you']
      if (neverMindPhrases.some(w => text?.toLowerCase().trim().includes(w))) {
        console.log('🚫 Customer not interested / never mind')
        let neverMindConv = await db.conversation.findFirst({
          where: { businessId: business.id, callerPhone: from },
          orderBy: { lastMessageAt: 'desc' },
          include: { messages: { orderBy: { createdAt: 'asc' } } },
        })
        if (!neverMindConv) {
          neverMindConv = await db.conversation.create({
            data: { businessId: business.id, callerPhone: from, status: 'active' },
            include: { messages: true },
          })
        }
        await db.message.create({
          data: { conversationId: neverMindConv.id, direction: 'inbound', content: text, telnyxSid: messageSid },
        })
        const goodbyeMsg = 'No worries! If you change your mind, feel free to reach out anytime.'
        await sendSMSAndLog(business, neverMindConv.id, from, goodbyeMsg)
        await db.conversation.update({
          where: { id: neverMindConv.id },
          data: { status: 'closed', summary: 'Customer said not interested' },
        })
        try {
          await notifyOwnerOnLeadCaptured(business, {
            customerName: neverMindConv.callerName || 'Customer',
            customerPhone: from,
            service: 'Partial interest - customer declined',
            conversationTranscript: neverMindConv.messages.map((m) => ({
              direction: m.direction, content: m.content, createdAt: m.createdAt as Date,
            })),
            conversationId: neverMindConv.id,
          })
        } catch (err) {
          console.error('❌ Failed to notify owner of partial interest lead:', err)
        }
        return new NextResponse('OK', { status: 200 })
      }

      // Find or create conversation (prefer existing, including closed ones — never create new after booking)
      const NO_AI_RESPONSE_STATUSES = ['appointment_booked', 'lead_captured', 'closed', 'human_needed', 'needs_review', 'completed'] as const
      const closedWindowDays = 90

      // First: look for any recent conversation (including closed) for this caller — do NOT create new if one exists
      let conversation = await db.conversation.findFirst({
        where: {
          businessId: business.id,
          callerPhone: from,
          createdAt: { gte: new Date(Date.now() - closedWindowDays * 24 * 60 * 60 * 1000) },
        },
        orderBy: { lastMessageAt: 'desc' },
        include: { messages: { orderBy: { createdAt: 'asc' }, take: 50 }, appointment: true },
      })

      // If we found a closed/completed conversation, use it — never create a new one
      if (conversation && NO_AI_RESPONSE_STATUSES.includes(conversation.status as any)) {
        // Save inbound message
        await db.message.create({
          data: { conversationId: conversation.id, direction: 'inbound', content: text, telnyxSid: messageSid },
        })
        await db.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: new Date() } })

        // appointment_booked or lead_captured: send ONE final message then close
        if (conversation.status === 'appointment_booked' || conversation.status === 'lead_captured') {
          const finalMsg = `You're welcome! If anything comes up, just ${getCallUsPhrase(business)}.`
          await sendSMSAndLog(business, conversation.id, from, finalMsg)
          await db.conversation.update({ where: { id: conversation.id }, data: { status: 'closed' } })
        }
        return new NextResponse('OK', { status: 200 })
      }

      // If we found a conversation that should get AI responses, use it
      if (!conversation) {
        conversation = await db.conversation.create({
          data: { businessId: business.id, callerPhone: from, status: 'active' },
          include: { messages: true, appointment: true },
        })
      }

      // Ensure we have full conversation data for downstream logic
      const refreshed = await db.conversation.findUnique({
        where: { id: conversation.id },
        include: { messages: { orderBy: { createdAt: 'asc' } }, appointment: true },
      })
      if (!refreshed) return new NextResponse('OK', { status: 200 })
      conversation = refreshed

      // Spam guard
      const recentDupe = conversation.messages.find(
        m =>
          m.direction === 'inbound' &&
          m.content === text &&
          new Date(m.createdAt).getTime() > Date.now() - SPAM_WINDOW_SECONDS * 1000
      )
      if (recentDupe) {
        console.log('🚫 Duplicate message, ignoring')
        return new NextResponse('OK', { status: 200 })
      }

      // Message limit guard (per-business config, default 23)
      // CRITICAL: Never cut off a booking in progress — only enforce for open/general chat
      const maxMessages = (business as { maxMessagesPerConversation?: number }).maxMessagesPerConversation ?? DEFAULT_MAX_MESSAGES_PER_CONVERSATION
      const inBookingFlow = Boolean((conversation.bookingFlowState as Record<string, unknown> | null)?.step)
      if (!inBookingFlow && conversation.messages.length >= maxMessages) {
        console.log('⚠️ Conversation hit message limit:', maxMessages)
        await db.conversation.update({
          where: { id: conversation.id },
          data: { status: 'completed', summary: 'Conversation ended - message limit reached' },
        })
        await sendSMS(
          business,
          from,
          `Thanks for chatting! For further help, please ${getCallUsPhrase(business)}.`
        )
        return new NextResponse('OK', { status: 200 })
      }

      // Save inbound message
      await db.message.create({
        data: { conversationId: conversation.id, direction: 'inbound', content: text, telnyxSid: messageSid },
      })
      await db.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: new Date() } })

      // Refresh with new message included, bookingFlowState, and appointment
      conversation = await db.conversation.findUnique({
        where: { id: conversation.id },
        include: { messages: { orderBy: { createdAt: 'asc' } }, appointment: true },
      })
      if (!conversation) return new NextResponse('OK', { status: 200 })

      // Webhook status check: do not generate AI response for closed/booked/human-needed
      if (NO_AI_RESPONSE_STATUSES.includes(conversation.status as any) || conversation.appointment) {
        return new NextResponse('OK', { status: 200 })
      }

      // ── SMS LEAD FLOW (calendar disabled) ─────────────────────────
      // Non-calendar: AI handles lead capture conversationally. No rigid state machine.
      // handleSmsLeadFlow only returns true when already lead_captured (skip processing).
      if (!business.calendarEnabled) {
        const leadHandled = await handleSmsLeadFlow(business, conversation, text, from)
        if (leadHandled) {
          const totalMs = Date.now() - new Date(timing.webhookReceivedAt).getTime()
          console.log('⏱️ [SMS] Total time (lead flow skip):', totalMs, 'ms', { timing: { ...timing, totalMs } })
          return NextResponse.json({ ok: true, timing: { ...timing, totalMs } }, { status: 200 })
        }
      }

      // ── SMS BOOKING FLOW ─────────────────────────────────────────
      const bookingHandled = await handleSmsBookingFlow(business, conversation, text, from)
      if (bookingHandled) {
        const totalMs = Date.now() - new Date(timing.webhookReceivedAt).getTime()
        console.log('⏱️ [SMS] Total time (booking flow):', totalMs, 'ms', { timing: { ...timing, totalMs } })
        return NextResponse.json({ ok: true, timing: { ...timing, totalMs } }, { status: 200 })
      }

      // AI response (pass bookingFlowState so AI can guide back when customer goes off-topic)
      timing.aiStartAt = timing.now()
      console.log('⏱️ [SMS] AI processing started at:', timing.aiStartAt)
      const aiResponse = await generateAIResponse(business, conversation, text, conversation.bookingFlowState, business.calendarEnabled)
      timing.aiEndAt = timing.now()
      console.log('⏱️ [SMS] AI processing finished at:', timing.aiEndAt)

      const cleanResponse = aiResponse
        .replace(/\[APPOINTMENT_BOOKED:.*?\]/g, '')
        .replace(/\[LEAD_CAPTURED:.*?\]/g, '')
        .replace(/\[READY_TO_CAPTURE\]/g, '')
        .replace(/\[HUMAN_NEEDED(?:: reason="[^"]*")?\]/g, '')
        .trim()

      // Lead capture via AI (non-calendar): extract structured data and create lead
      const readyToCapture = aiResponse.includes('[READY_TO_CAPTURE]')
      if (!business.calendarEnabled && readyToCapture && conversation.status !== 'lead_captured') {
        const extracted = await extractLeadFromConversation(anthropic, business, conversation)
        if (extracted && extracted.customerName?.trim()) {
          const thanksMsg = `Perfect! Someone from ${business.name} will follow up with you shortly to discuss next steps and set up a time that works. Talk soon!`
          const conversationTranscript = [
            ...conversation.messages.map((m: any) => ({ direction: m.direction, content: m.content, createdAt: m.createdAt })),
            { direction: 'outbound' as const, content: thanksMsg, createdAt: new Date() },
          ]
          try {
            await notifyOwnerOnLeadCaptured(business, {
              customerName: extracted.customerName.trim(),
              customerPhone: from,
              customerEmail: extracted.customerEmail?.trim() || undefined,
              customerAddress: extracted.customerAddress?.trim() || undefined,
              customerTimeframe: extracted.customerTimeframe?.trim() || undefined,
              service: cleanServiceForOwner(extracted.customerService?.trim() || 'service'),
              conversationTranscript: conversationTranscript.slice(0, -1),
              conversationId: conversation.id,
            })
          } catch (err) {
            console.error('❌ Failed to notify owner of lead:', err)
          }
          await db.conversation.update({
            where: { id: conversation.id },
            data: {
              status: 'lead_captured',
              callerName: extracted.customerName.trim(),
              intent: 'lead_capture',
              serviceRequested: cleanServiceForOwner(extracted.customerService?.trim() || 'service'),
              customerEmail: extracted.customerEmail?.trim() || null,
              customerAddress: extracted.customerAddress?.trim() || null,
              customerTimeframe: extracted.customerTimeframe?.trim() || null,
              bookingFlowState: Prisma.DbNull,
            },
          })
          await sendSMSAndLog(business, conversation.id, from, thanksMsg, timing)
          const totalMs = Date.now() - new Date(timing.webhookReceivedAt).getTime()
          return NextResponse.json({ ok: true, timing: { ...timing, totalMs } }, { status: 200 })
        }
      }

      // ── AI-triggered booking flow engagement (calendar-enabled safety net) ──
      // If the AI generated a response for a calendar-enabled business but the structured
      // booking flow never engaged, detect two critical scenarios:
      // 1. AI fake-confirmed a booking ("you're all set!") → intercept and redirect to real flow
      // 2. AI is guiding toward booking (asking for name/time) → set bookingFlowState for next message
      if (
        business.calendarEnabled &&
        business.googleCalendarConnected &&
        conversation.status !== 'appointment_booked' &&
        !conversation.appointment
      ) {
        const currentFlowStep = (conversation.bookingFlowState as Record<string, unknown> | null)?.step
        if (!currentFlowStep) {
          // SCENARIO 1: AI fake-confirmed a booking without createBooking — intercept immediately
          const isFakeConfirmation =
            /you[''\u2019]re all set|your (appointment|booking) is (set|confirmed|booked)|booked (you )?for|confirmed for|see you (on|at)|appointment is scheduled/i.test(cleanResponse) &&
            !/would you like|want to|shall we|should we|let me/i.test(cleanResponse)

          if (isFakeConfirmation) {
            console.log('[SMS BOOKING] ⚠️ AI fake-confirmed booking without createBooking — intercepting')
            console.log('[SMS BOOKING] Suppressed AI response:', cleanResponse.slice(0, 120))
            const hoursSummary = formatBusinessHoursSummary(business.businessHours)
            const callerName = conversation.callerName
            const redirectMsg = callerName
              ? `Almost there, ${callerName}! Let me check our calendar and lock in that time for you. What day and time works best? We're available ${hoursSummary}.`
              : `Almost there! Let me check our calendar and get you on the schedule. What's your name, and what day/time works best? We're available ${hoursSummary}.`
            await sendSMSAndLog(business, conversation.id, from, redirectMsg, timing)
            await db.conversation.update({
              where: { id: conversation.id },
              data: {
                status: 'booking_in_progress',
                bookingFlowState: JSON.parse(JSON.stringify({
                  step: 'awaiting_name_and_preference',
                  customerName: callerName || undefined,
                  serviceType: conversation.serviceRequested || extractServiceFromConversation(conversation.messages) || undefined,
                  sentAt: new Date().toISOString(),
                })),
              },
            })
            const totalMs = Date.now() - new Date(timing.webhookReceivedAt).getTime()
            console.log('[SMS BOOKING] Redirected to structured flow after fake confirmation. Total:', totalMs, 'ms')
            return NextResponse.json({ ok: true, timing: { ...timing, totalMs } }, { status: 200 })
          }

          // SCENARIO 2: AI is asking for name AND time/day together — set flow state
          // so the NEXT customer message enters the structured booking state machine.
          // Be conservative: only trigger when the AI asks for BOTH name and scheduling
          // info, not just yes/no offers like "Would you like a quote?"
          const asksForName = /what[''\u2019]?s your name|\byour name\b/i.test(cleanResponse)
          const asksForTime = /when works|what day|what time|day.?\/?.?time|when.* best/i.test(cleanResponse)
          const isGuidingToBooking = asksForName && asksForTime

          if (isGuidingToBooking) {
            console.log('[SMS BOOKING] AI is guiding toward booking — engaging structured flow for next message')
            const svcType = conversation.serviceRequested || extractServiceFromConversation(conversation.messages) || undefined
            await db.conversation.update({
              where: { id: conversation.id },
              data: {
                status: 'booking_in_progress',
                bookingFlowState: JSON.parse(JSON.stringify({
                  step: 'awaiting_name_and_preference',
                  customerName: conversation.callerName || undefined,
                  serviceType: svcType,
                  sentAt: new Date().toISOString(),
                })),
              },
            })
            // Send the AI's response — it already asked for name/time naturally
            await sendSMSAndLog(business, conversation.id, from, cleanResponse, timing)
            const totalMs = Date.now() - new Date(timing.webhookReceivedAt).getTime()
            console.log('[SMS BOOKING] Structured flow engaged via AI guidance. Total:', totalMs, 'ms')
            return NextResponse.json({ ok: true, timing: { ...timing, totalMs } }, { status: 200 })
          }
        }
      }

      const conversationTranscript = [
        ...conversation.messages.map((m) => ({
          direction: m.direction,
          content: m.content,
          createdAt: m.createdAt as Date,
        })),
        { direction: 'outbound' as const, content: cleanResponse, createdAt: new Date() },
      ]

      // Appointment booking tag — NEVER honor from AI when calendar is enabled. Structured flow is the ONLY path to book (requires explicit confirmation).
      const apptMatch = aiResponse.match(
        /\[APPOINTMENT_BOOKED: name="([^"]+)", service="([^"]+)", datetime="([^"]+)"(?:, notes="([^"]*)")?(?:, address="([^"]*)")?\]/
      )
      const canAiBook = !business.calendarEnabled || !business.googleCalendarConnected
      if (apptMatch && canAiBook && conversation.status !== 'appointment_booked' && !conversation.appointment) {
        const [, name, service, datetime, notes, address] = apptMatch
        const tz = business.timezone ?? 'America/New_York'
        const scheduledAt = parseDatetimeInBusinessTz(datetime, tz)
        const slotStart = scheduledAt.toISOString()

        // Create appointment BEFORE sending confirmation — use shared createBooking
        console.log('[SMS BOOKING] Creating appointment...')
        const result = await createBooking({
          business,
          customerName: name,
          customerPhone: from,
          serviceType: service,
          notes: notes || undefined,
          customerAddress: address || undefined,
          slotStart,
          conversationId: conversation.id,
          skipSlotVerification: true,
          allowWithoutCalendar: true,
          logPrefix: '[SMS BOOKING]',
        })

        if (result.ok) {
          await db.conversation.update({
            where: { id: conversation.id },
            data: { status: 'appointment_booked', callerName: name, intent: 'book_appointment', serviceRequested: service },
          })
          console.log('[SMS BOOKING] Appointment created:', result.appointment.id)
          if (result.calendarSyncFailed) {
            console.log('[SMS BOOKING] Calendar FAILED:', result.calendarSyncFailed, '(appointment saved with calendarSyncFailed)')
          } else {
            console.log('[SMS BOOKING] Google Calendar event created (or calendar off)')
          }
          console.log('[SMS BOOKING] Owner notified')
          // createBooking already sent confirmation SMS — send cleanResponse as fallback only if we want to override (we don't; createBooking message is good)
          // So we just send cleanResponse for consistency with AI's friendly wording (createBooking sent a different message — actually we have a problem)
          // createBooking sends: "You're all set ${name}! ${business.name} will meet you on ${dateStr} at ${timeStr}..."
          // The AI's cleanResponse also has a similar message. We should NOT send cleanResponse again — we'd double-send.
          // createBooking already sent the confirmation. So we should NOT call sendSMSAndLog(cleanResponse) here.
          // Skip to the end — we're done. Return.
          const totalMs = Date.now() - new Date(timing.webhookReceivedAt).getTime()
          console.log('⏱️ [SMS] Total time (SMS BOOKING via AI tag):', totalMs, 'ms', { timing: { ...timing, totalMs } })
          return NextResponse.json({ ok: true, timing: { ...timing, totalMs } }, { status: 200 })
        }

        // createBooking failed — send error to customer
        console.error('[SMS BOOKING] createBooking failed:', result.error)
        const fallbackMsg = `Sorry, we had trouble saving that (${result.error}). Please text back to try again or ${getCallUsPhrase(business)}.`
        await sendSMSAndLog(business, conversation.id, from, fallbackMsg, timing)
        const totalMs = Date.now() - new Date(timing.webhookReceivedAt).getTime()
        return NextResponse.json({ ok: false, error: result.error, timing: { ...timing, totalMs } }, { status: 200 })
      }

      // Lead capture is handled by structured handleSmsLeadFlow when calendar disabled — no AI [LEAD_CAPTURED] path

      const humanNeededMatch = aiResponse.match(/\[HUMAN_NEEDED(?:: reason="([^"]*)")?\]/)
      if (humanNeededMatch) {
        const [, reason] = humanNeededMatch
        await db.conversation.update({
          where: { id: conversation.id },
          data: { status: 'human_needed', intent: 'human_needed' },
        })
        console.log('🚨 Flagged for human review')

        try {
          await notifyOwnerOnHumanNeeded(business, {
            customerName: conversation.callerName || 'Customer',
            customerPhone: from,
            reason: reason || null,
            conversationTranscript,
            conversationId: conversation.id,
          })
        } catch (err) {
          console.error('❌ Failed to notify owner of human needed:', err)
        }
      }

      await sendSMSAndLog(business, conversation.id, from, cleanResponse, timing)
      const totalMs = Date.now() - new Date(timing.webhookReceivedAt).getTime()
      timing.totalMs = totalMs
      console.log('⏱️ [SMS] Total time (webhook→SMS sent):', totalMs, 'ms', {
        timing,
        telnyxMessageId: timing.telnyxMessageId,
        telnyxStatus: timing.telnyxStatus,
      })
      return NextResponse.json({ ok: true, timing }, { status: 200 })
    }

    // Acknowledge any other event
    return new NextResponse('OK', { status: 200 })
  } catch (error) {
    console.error('❌ Error handling SMS webhook:', error)
    return new NextResponse('Error', { status: 500 })
  }
}

// ── SMS Booking Flow ────────────────────────────────────────────────
// Fully conversational — NO booking links. AI handles everything via text.

type BookingFlowState = {
  step: 'greeting' | 'awaiting_name' | 'awaiting_name_and_preference' | 'awaiting_service' | 'awaiting_notes' | 'awaiting_address' | 'awaiting_time' | 'awaiting_confirmation' | 'awaiting_name_and_address' | 'awaiting_name_after_slot' | 'awaiting_address_after_slot' | 'confirmed'
  customerName?: string
  serviceType?: string
  notes?: string
  customerAddress?: string
  selectedSlot?: { start: string; end: string; display: string }  // Stored when slot is confirmed
  timePreference?: string  // Raw text: "Friday at 2pm", etc.
  suggestedSlots?: { start: string; end: string; display: string }[]  // When we suggest "2:30pm or 3pm" — stored for matching
  lastDiscussedDate?: string  // YYYY-MM-DD when we suggested alternatives on a specific day
  services?: { value: string; label: string }[]
  sentAt?: string
}

/** Check if the business is closed on a given date (YYYY-MM-DD) in the given timezone. */
function isBusinessClosedOnDate(dateStr: string, tz: string, businessHoursRaw: unknown): boolean {
  const hours = parseBusinessHours(businessHoursRaw)
  const [y, m, d] = dateStr.split('-').map(Number)
  const dayIndex = new TZDate(y, m - 1, d, 12, 0, 0, 0, tz).getDay()
  const dayName = DAY_NAMES[dayIndex] as keyof typeof hours
  return !hours[dayName]
}

/** Format business hours as "Mon-Fri 9am-5pm" for SMS. */
function formatBusinessHoursSummary(businessHoursRaw: unknown): string {
  const hours = parseBusinessHours(businessHoursRaw)
  const dayAbbrev: Record<string, string> = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun' }
  const openDayNames: string[] = []
  let firstSlot: { open: string; close: string } | null = null
  for (const [day, slot] of Object.entries(hours)) {
    if (slot) {
      openDayNames.push(dayAbbrev[day] || day)
      if (!firstSlot) firstSlot = slot
    }
  }
  if (openDayNames.length === 0) return 'by appointment'
  const fmt = (s: string) => {
    const [h, m] = s.split(':').map(Number)
    if (h === 0 && m === 0) return '12am'
    if (h === 12 && m === 0) return '12pm'
    return `${h > 12 ? h - 12 : h}${m ? ':' + String(m).padStart(2, '0') : ''}${h >= 12 ? 'pm' : 'am'}`
  }
  const range = firstSlot ? `${fmt(firstSlot.open)}-${fmt(firstSlot.close)}` : ''
  const days = openDayNames.length >= 5 && openDayNames.includes('Mon') && openDayNames.includes('Fri') ? 'Mon-Fri' : openDayNames.join(', ')
  return `${days} ${range}`.trim()
}

/** Day names and time-like words — never use these as service descriptions. */
const SERVICE_BLOCKLIST =
  /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today|noon|morning|afternoon|evening|next\s+week|next\s+month|january|february|march|april|may|june|july|august|september|october|november|december|\d{1,2}(?::\d{2})?\s*(?:am|pm)|\d{1,2}\/\d{1,2})\b/i

/** Extract and clean what the customer needs a quote for. Use FIRST inbound messages only. Never use day/time as service. */
function extractServiceFromConversation(messages: { direction: string; content: string }[]): string {
  const inbound = messages.filter((m) => m.direction === 'inbound')
  // Only consider first 2 inbound messages (initial request, before booking flow questions)
  const toCheck = inbound.slice(0, 2)
  for (const m of toCheck) {
    const content = m.content.trim()
    // If customer only said "book" or "I want to book" without a service, skip
    if (/^(?:i\s+)?(?:want\s+to\s+)?(?:book|schedule|appointment|reserve)(?:\s+(?:an?\s+)?(?:appointment|slot))?\.?$/i.test(content)) {
      continue
    }
    const patterns = [
      /(?:quote|estimate|need|want|looking for)\s+(?:a|for|on|about)?\s*(?:my|the)?\s*([^.?!]+)/i,
      /(?:need|want)\s+(?:someone|help)\s+(?:to|for)?\s*([^.?!]+)/i,
      /(?:for|on|about)\s+(?:my|the)?\s*([^.?!]{3,40})(?:\s+work|\s+quote)?/i,
    ]
    for (const p of patterns) {
      const match = content.match(p)
      if (match && match[1]) {
        let extracted = match[1].trim()
        if (
          extracted.length >= 2 &&
          extracted.length <= 80 &&
          !/^(book|schedule|appointment)/i.test(extracted) &&
          !SERVICE_BLOCKLIST.test(extracted)
        ) {
          return cleanServiceForDisplay(extracted)
        }
      }
    }
  }
  return 'a free in-person quote'
}

/** Clean garbled service text for display: "to book a quote for my lawn" → "your lawn" */
function cleanServiceForDisplay(s: string): string {
  let t = s.trim()
  if (!t || t.length > 100) return 'your property'
  t = t.replace(/\b(?:to\s+)?book\s+(?:a\s+)?(?:quote\s+)?(?:for\s+)?/gi, '')
  t = t.replace(/\b(?:a\s+)?quote\s+(?:for|on|about)\s+/gi, '')
  const myMatch = t.match(/(?:my|the)\s+([^.?!]{2,50}?)(?:\s+(?:work|quote|visit))?\.?$/i)
  if (myMatch) return 'your ' + myMatch[1].trim().replace(/^(my|the)\s+/i, '')
  if (t.length >= 2 && t.length <= 60) return /^your\s/i.test(t) ? t : 'your ' + t
  return 'your property'
}

function getServicesList(business: { servicesOffered?: unknown }): { value: string; label: string }[] {
  const raw = business.servicesOffered
  if (!Array.isArray(raw) || raw.length === 0) {
    return [{ value: 'Appointment', label: 'Appointment' }]
  }
  return raw.map((s: unknown) => {
    if (typeof s === 'object' && s !== null && 'name' in s && typeof (s as { name: string }).name === 'string') {
      const obj = s as { name: string; price?: number }
      const priceStr = typeof obj.price === 'number' ? ` - $${obj.price}` : ''
      return { value: obj.name, label: `${obj.name}${priceStr}` }
    }
    const name = typeof s === 'string' ? s : String(s)
    return { value: name, label: name }
  })
}

function looksLikeQuestion(text: string): boolean {
  const t = text.trim()
  if (t.includes('?')) return true
  return /^(what|when|where|who|how|why|can|could|would|is|are|do|does|will|are you)\b/i.test(t)
}

/** Patterns that indicate time/date — everything after "and" or comma should be stripped when these appear. */
const TIME_DATE_INDICATORS =
  /\b(?:\d{1,2}(?::\d{2})?\s*(?:am|pm)|tomorrow|today|next\s+week|next\s+month|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|jan\b|feb\b|mar\b|apr\b|jun\b|jul\b|aug\b|sep\b|oct\b|nov\b|dec\b|\d{1,2}\/\d{1,2}|noon|morning|afternoon|evening|works?)\b/i

function parseNameFromMessage(text: string): string {
  const raw = text.trim()
  if (!raw) return raw

  // Patterns that extract the name — order matters (more specific first)
  // "My name is jacob", "My names jacob", "My name's jacob", "I'm jacob", "It's jacob", "Names jacob"
  const patterns = [
    /(?:my\s+names?\s+is|my\s+name'?s?\s+is)\s+([a-zA-Z][a-zA-Z\s\-']{0,50}?)(?:\s*[.,!?]|\s+(?:and|,)|$)/i,
    /(?:my\s+names?|my\s+name'?s?|i'?m|i\s+am|this\s+is|name'?s?|it'?s)\s+([a-zA-Z][a-zA-Z\s\-']{0,50}?)(?:\s*[.,!?]|\s+(?:and|,)|$)/i,
    /(?:my\s+names?|my\s+name'?s?|i'?m|i\s+am|this\s+is|name'?s?|it'?s)\s+([a-zA-Z][a-zA-Z\s\-']*?)(?=\s+[a-zA-Z]{3,}\s|\s*\d|$)/i,
  ]
  for (const re of patterns) {
    const m = raw.match(re)
    if (m && m[1]) {
      let name = m[1].trim()
      const timeIdx = name.search(TIME_DATE_INDICATORS)
      if (timeIdx >= 0) name = name.slice(0, timeIdx).replace(/\s+(?:and|,)\s*$/, '').trim()
      if (name.length >= 1 && name.length <= 50) {
        return capitalizeName(name)
      }
    }
  }
  // "John, Monday 9am" or "John - tomorrow" → name before comma/dash (rest is often time/date)
  const commaMatch = raw.match(/^([^,\-]+?)\s*[,\-]\s*.+$/)
  if (commaMatch) return capitalizeName(commaMatch[1].trim())
  // "Jimmy and 5 pm on Friday" or "Sarah and tomorrow works" → strip everything after "and" when followed by time/date
  const andMatch = raw.match(/^(.+?)\s+and\s+(.+)$/i)
  if (andMatch) {
    const beforeAnd = andMatch[1].trim()
    const afterAnd = andMatch[2].trim()
    if (TIME_DATE_INDICATORS.test(afterAnd)) return capitalizeName(beforeAnd)
  }
  return capitalizeName(raw)
}

/** Capitalize first letter of each word. "jacob" → "Jacob", "john smith" → "John Smith" */
function capitalizeName(name: string): string {
  const t = name.trim()
  if (!t) return t
  return t.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
}

/** Parse service: number picks from list; otherwise use customer's words (don't categorize). */
function parseServiceSelection(text: string, services: { value: string; label: string }[]): string | null {
  const num = parseInt(text.replace(/\D/g, ''), 10)
  if (num >= 1 && num <= services.length) {
    return services[num - 1].label
  }
  const lower = text.toLowerCase().trim()
  const found = services.find(s => s.label.toLowerCase().includes(lower) || s.value.toLowerCase().includes(lower))
  if (found) return found.label
  // Use customer's exact words — don't categorize (e.g. "patio and walkway" not "gardening")
  const trimmed = text.trim()
  return trimmed.length >= 2 && trimmed.length <= 100 ? trimmed : null
}

function parseNotesFromMessage(text: string): string {
  const t = text.trim().toLowerCase()
  if (!t || ['no', 'nope', 'nothing', 'skip', 'n/a', 'na', 'none', "don't have any", "i don't"].some(w => t === w || t.startsWith(w + ' '))) {
    return ''
  }
  return text.trim()
}

// ── Lead Flow State (for calendar-disabled businesses) ───────────────
type LeadFlowState = {
  leadFlow: true
  step: 'awaiting_service' | 'awaiting_name' | 'awaiting_email' | 'awaiting_address' | 'awaiting_timeframe' | 'complete'
  customerName?: string
  customerEmail?: string
  customerAddress?: string
  customerTimeframe?: string
  serviceRequested?: string
}

/** Extract "what they need" from message - service interest, not time/date. */
function extractNeedFromMessage(text: string): string | null {
  const t = text.trim()
  if (!t || t.length < 2 || t.length > 150) return null
  // Block time/date only responses
  if (SERVICE_BLOCKLIST.test(t) && t.length < 30) return null
  if (/^(book|schedule|appointment|yes|no|ok|thanks?|thank you)\b$/i.test(t)) return null
  return t
}

/** Extract email from message. Accept any email with @ and a dot after it (e.g. richard@iu.edu, test@gmail.com). */
function parseEmailFromMessage(text: string): string | null {
  const match = text.trim().match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z0-9]+/)
  return match ? match[0].trim() : null
}

/** Check if text looks like an address (has numbers + street-like words). Falls back to accepting non-empty. */
function parseAddressFromMessage(text: string): string | null {
  const t = text.trim()
  if (!t || t.length < 5 || t.length > 500) return null
  // Reject if it looks like email-only
  if (/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(t)) return null
  // Reject if it looks like a name only (no numbers, short)
  if (t.length < 10 && !/\d/.test(t)) return null
  return t
}

/** Detect when customer is requesting a TIME CHANGE (e.g. "lets do 5pm", "how about 3", "5pm") — NOT name or address. */
function looksLikeTimeChange(text: string): boolean {
  const t = text.toLowerCase().trim()
  if (!t || t.length > 80) return false
  // Explicit time-change phrases + time
  if (/\b(lets?|let'?s|how\s+about|can\s+we\s+do|what\s+about|rather\s+do|actually|instead)\s+(.+)/i.test(t)) {
    const rest = t.replace(/^(lets?|let'?s|how\s+about|can\s+we\s+do|what\s+about|rather\s+do|actually|instead)\s+/i, '').trim()
    if (/\d{1,2}(?::\d{2})?\s*(am|pm)\b|\d{1,2}\s*(am|pm)\b|noon|morning|afternoon|evening/i.test(rest) || /^\d{1,2}$/.test(rest)) return true
  }
  // Standalone time: "5pm", "3pm", "9am", "2:30pm"
  if (/^\d{1,2}(?::\d{2})?\s*(am|pm)\s*$/i.test(t)) return true
  // "5" or "3" when short (often "how about 5" meaning 5pm)
  if (/^\d{1,2}\s*$/.test(t)) return true
  return false
}

/** Accept timeframe as free text: "this week", "next week", "no rush", etc. */
function parseTimeframeFromMessage(text: string): string | null {
  const t = text.trim()
  if (!t || t.length > 150) return null
  if (/^(yes|no|ok|thanks?|thank you)\b$/i.test(t)) return null
  return t
}

/** Extract structured lead data from conversation via AI. Returns null if extraction fails or name missing. */
async function extractLeadFromConversation(
  anthropic: Anthropic,
  business: { name: string },
  conversation: { messages: { direction: string; content: string }[] }
): Promise<{ customerName: string; customerEmail?: string; customerAddress?: string; customerService?: string; customerTimeframe?: string } | null> {
  const transcript = conversation.messages
    .map((m) => `${m.direction === 'inbound' ? 'Customer' : 'Assistant'}: ${m.content}`)
    .join('\n')
  const prompt = `Extract from this SMS conversation between Customer and Assistant for ${business.name}. Return a JSON object with these keys only: customerName (string, required), customerEmail (string or null), customerAddress (string or null), customerService (what they need, string or null), customerTimeframe (when they want it, string or null). Use null for any missing field. customerName is required — if you cannot determine a name, use "Customer". Use the FIRST/CANONICAL value for each field (e.g. if they said their name early, use that — never overwrite a valid name with later message text).`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [{ role: 'user', content: `Conversation:\n${transcript}\n\n${prompt}\n\nRespond with only valid JSON, no markdown.` }],
    })
    const textBlock = response.content.find((b: { type: string }) => b.type === 'text')
    const text = (textBlock as { text?: string })?.text?.trim() || ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>
    const customerName = typeof parsed.customerName === 'string' ? parsed.customerName.trim() : null
    if (!customerName) return null
    return {
      customerName,
      customerEmail: typeof parsed.customerEmail === 'string' ? parsed.customerEmail : undefined,
      customerAddress: typeof parsed.customerAddress === 'string' ? parsed.customerAddress : undefined,
      customerService: typeof parsed.customerService === 'string' ? parsed.customerService : undefined,
      customerTimeframe: typeof parsed.customerTimeframe === 'string' ? parsed.customerTimeframe : undefined,
    }
  } catch (err) {
    console.error('❌ [AI] Lead extraction failed:', err)
    return null
  }
}

/** Non-calendar: AI handles lead capture conversationally. This only skips when already lead_captured. */
async function handleSmsLeadFlow(
  business: any,
  conversation: any,
  _text: string,
  _from: string
): Promise<boolean> {
  if (business.calendarEnabled) return false
  if (conversation.status === 'lead_captured') return true // Skip — handled in NO_AI_RESPONSE block
  // All other messages go to AI for conversational lead capture
  return false
}

async function handleSmsBookingFlow(
  business: any,
  conversation: any,
  text: string,
  from: string
): Promise<boolean> {
  console.log('[SMS BOOKING] handleSmsBookingFlow called', {
    calendarEnabled: business.calendarEnabled,
    googleCalendarConnected: business.googleCalendarConnected,
    conversationStatus: conversation.status,
    hasAppointment: !!conversation.appointment,
    bookingFlowState: conversation.bookingFlowState,
    customerMessage: text?.slice(0, 80),
  })
  if (!business.calendarEnabled) {
    console.log('[SMS BOOKING] Calendar not enabled — skipping booking flow')
    return false
  }
  // Do not restart or continue flow if already confirmed or has booking
  if (conversation.appointment || conversation.status === 'appointment_booked') {
    console.log('[SMS BOOKING] Already booked — skipping')
    return true
  }
  const rawFlowState = (conversation.bookingFlowState as Record<string, unknown> | null) ?? {}
  if (rawFlowState.step === 'confirmed') {
    console.log('[SMS BOOKING] Already confirmed — skipping')
    return true
  }

  const rawText = text?.trim() || ''
  const trimmed = rawText.toLowerCase()
  // Support legacy step names
  const legacyStep = rawFlowState.step as string
  const mappedStep: BookingFlowState['step'] =
    legacyStep === 'awaiting_slot' || legacyStep === 'awaiting_time' || legacyStep === 'awaiting_selection' || legacyStep === 'awaiting_preference'
      ? 'awaiting_time'
      : legacyStep === 'awaiting_name_and_preference'
        ? 'awaiting_name_and_preference'
        : (legacyStep as BookingFlowState['step']) || 'greeting'

  const bookingRequiresAddress = business.bookingRequiresAddress ?? true
  console.log('[SMS BOOKING] Current step:', mappedStep, '| customerName:', rawFlowState.customerName, '| serviceType:', rawFlowState.serviceType)

  const flowState: BookingFlowState = {
    ...rawFlowState,
    step: mappedStep,
    customerName: rawFlowState.customerName ?? conversation.callerName,
    serviceType: rawFlowState.serviceType ?? conversation.serviceRequested,
  } as BookingFlowState
  const tz = business.timezone ?? 'America/New_York'
  const suggestedSlots = (flowState.suggestedSlots ?? []) as SlotLike[]
  const lastDiscussedDate = flowState.lastDiscussedDate as string | undefined

  // ── Step: awaiting_confirmation (have slot + name + address, asked "Just to confirm...?" — wait for yes) ──
  if (flowState.step === 'awaiting_confirmation' && flowState.selectedSlot) {
    const confirmed = /\b(yes|yeah|yep|yup|sure|ok|okay|confirm|confirmed|that works|sounds good)\b/i.test(trimmed)
    const rejected = /\b(no|nope|wrong|actually|different|change)\b/i.test(trimmed)
    if (confirmed) {
      const convCheck = await db.conversation.findUnique({
        where: { id: conversation.id },
        include: { appointment: true },
      })
      if (convCheck?.appointment) return true
      console.log('[SMS BOOKING] Creating appointment...')
      const result = await createBooking({
        business,
        customerName: flowState.customerName || 'Customer',
        customerPhone: from,
        serviceType: flowState.serviceType || 'Appointment',
        notes: flowState.notes ?? undefined,
        customerAddress: flowState.customerAddress ?? undefined,
        slotStart: flowState.selectedSlot.start,
        conversationId: conversation.id,
        skipSlotVerification: true,
        logPrefix: '[SMS BOOKING]',
      })
      if (result.ok) {
        await db.conversation.update({
          where: { id: conversation.id },
          data: {
            status: 'appointment_booked',
            callerName: flowState.customerName,
            intent: 'book_appointment',
            serviceRequested: flowState.serviceType,
            bookingFlowState: Prisma.DbNull,
          },
        })
        console.log('[SMS BOOKING] Appointment created:', result.appointment.id)
        return true
      }
      console.error('[SMS BOOKING] createBooking failed:', result.error)
      await sendSMSAndLog(business, conversation.id, from, `Sorry, we had trouble saving that. Please try again or ${getCallUsPhrase(business)}.`)
      return true
    }
    if (rejected) {
      const hoursSummary = formatBusinessHoursSummary(business.businessHours)
      const msg = `No problem! What day and time works better for you? We're available ${hoursSummary}.`
      await sendSMSAndLog(business, conversation.id, from, msg)
      await db.conversation.update({
        where: { id: conversation.id },
        data: {
          bookingFlowState: JSON.parse(JSON.stringify({
            step: 'awaiting_time',
            customerName: flowState.customerName,
            serviceType: flowState.serviceType,
            notes: flowState.notes,
            sentAt: new Date().toISOString(),
          })),
        },
      })
      return true
    }
    await sendSMSAndLog(business, conversation.id, from, `Reply yes to confirm, or tell me a different time that works.`)
    return true
  }

  /** Helper: when customer requests a time change (e.g. "lets do 5pm") while we have a selected slot. */
  async function handleTimeChangeFromSlotChoice(
    flowState: BookingFlowState,
    rawText: string
  ): Promise<boolean> {
    if (!flowState.selectedSlot || !looksLikeTimeChange(rawText)) return false
    const t = rawText.toLowerCase().trim()
    const timeMatch = t.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i)
    if (!timeMatch) {
      const bareNum = t.match(/(\d{1,2})\s*$/)
      if (!bareNum) return false
      let h = parseInt(bareNum[1], 10)
      if (h >= 1 && h <= 7) h += 12
      const minute = 0
      const startStr = new Date(flowState.selectedSlot.start).toLocaleDateString('en-CA', { timeZone: tz })
      const slot = await isSpecificSlotAvailable(business.id, startStr, h, minute, tz)
      if (slot) {
        const dateLabel = formatDateFull(slot.start, tz)
        const msg = `${dateLabel} at ${slot.display} is open! What's your name?`
        await sendSMSAndLog(business, conversation.id, from, msg)
        await db.conversation.update({
          where: { id: conversation.id },
          data: {
            bookingFlowState: JSON.parse(JSON.stringify({
              step: 'awaiting_name_after_slot',
              customerName: flowState.customerName,
              serviceType: flowState.serviceType,
              notes: flowState.notes,
              selectedSlot: slot,
              sentAt: new Date().toISOString(),
            })),
          },
        })
        return true
      }
      const closest = await getTwoClosestSlotsOnDay(business.id, startStr, h, minute, tz)
      if (closest.length > 0) {
        const timesStr = closest.map((s) => s.display).join(' or ')
        const dateLabel = formatDateFull(startStr + 'T12:00:00', tz)
        const msg = `Sorry, that time is taken. How about ${timesStr} that same day? Or tell me another day and time.`
        await sendSMSAndLog(business, conversation.id, from, msg)
        await db.conversation.update({
          where: { id: conversation.id },
          data: {
            bookingFlowState: JSON.parse(JSON.stringify({
              step: 'awaiting_time',
              customerName: flowState.customerName,
              serviceType: flowState.serviceType,
              notes: flowState.notes,
              suggestedSlots: closest,
              lastDiscussedDate: startStr,
              sentAt: new Date().toISOString(),
            })),
          },
        })
        return true
      }
      return false
    }
    let h = parseInt(timeMatch[1], 10)
    const minute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0
    const ampm = (timeMatch[3] || '').toLowerCase()
    if (ampm === 'pm' && h < 12) h += 12
    if (ampm === 'am' && h === 12) h = 0
    const startStr = new Date(flowState.selectedSlot.start).toLocaleDateString('en-CA', { timeZone: tz })
    const slot = await isSpecificSlotAvailable(business.id, startStr, h, minute, tz)
    if (slot) {
      const dateLabel = formatDateFull(slot.start, tz)
      const msg = `${dateLabel} at ${slot.display} is open! What's your name?`
      await sendSMSAndLog(business, conversation.id, from, msg)
      await db.conversation.update({
        where: { id: conversation.id },
        data: {
          bookingFlowState: JSON.parse(JSON.stringify({
            step: 'awaiting_name_after_slot',
            customerName: flowState.customerName,
            serviceType: flowState.serviceType,
            notes: flowState.notes,
            selectedSlot: slot,
            sentAt: new Date().toISOString(),
          })),
        },
      })
      return true
    }
    const closest = await getTwoClosestSlotsOnDay(business.id, startStr, h, minute, tz)
    if (closest.length > 0) {
      const timesStr = closest.map((s) => s.display).join(' or ')
      const dateLabel = formatDateFull(startStr + 'T12:00:00', tz)
      const msg = `Sorry, that time is taken. How about ${timesStr} that same day? Or tell me another day and time.`
      await sendSMSAndLog(business, conversation.id, from, msg)
      await db.conversation.update({
        where: { id: conversation.id },
        data: {
          bookingFlowState: JSON.parse(JSON.stringify({
            step: 'awaiting_time',
            customerName: flowState.customerName,
            serviceType: flowState.serviceType,
            notes: flowState.notes,
            suggestedSlots: closest,
            lastDiscussedDate: startStr,
            sentAt: new Date().toISOString(),
          })),
        },
      })
      return true
    }
    return false
  }

  // ── Step: awaiting_name_after_slot (time confirmed, ask for name FIRST — separate from address) ──
  if (flowState.step === 'awaiting_name_after_slot' && flowState.selectedSlot) {
    if (looksLikeQuestion(rawText)) return false
    const timeChangeHandled = await handleTimeChangeFromSlotChoice(flowState, rawText)
    if (timeChangeHandled) return true
    const name = parseNameFromMessage(rawText) || flowState.customerName
    const address = parseAddressFromMessage(rawText)
    if (!name || name.length > 100) return false
    const NOT_A_NAME = /^(yes|yeah|lets?|let'?s|how\s+about|can\s+we|what\s+about|5pm|3pm|9am|\d{1,2}(?::\d{2})?\s*(am|pm))\b/i
    if (NOT_A_NAME.test(name.trim()) && !flowState.customerName) return false

    const convCheck = await db.conversation.findUnique({
      where: { id: conversation.id },
      include: { appointment: true },
    })
    if (convCheck?.appointment) return true

    const dateLabel = formatDateFull(flowState.selectedSlot.start, tz)
    const timeStr = flowState.selectedSlot.display || new Date(flowState.selectedSlot.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz })

    if (address || !bookingRequiresAddress) {
      const confirmMsg = `Perfect! Just to confirm: ${dateLabel} at ${timeStr} for ${name}${address ? ` at ${address}` : ''}. Reply yes to confirm.`
      await sendSMSAndLog(business, conversation.id, from, confirmMsg)
      await db.conversation.update({
        where: { id: conversation.id },
        data: {
          bookingFlowState: JSON.parse(JSON.stringify({
            step: 'awaiting_confirmation',
            customerName: name,
            serviceType: flowState.serviceType,
            notes: flowState.notes,
            selectedSlot: flowState.selectedSlot,
            customerAddress: address ?? undefined,
            sentAt: new Date().toISOString(),
          })),
        },
      })
      return true
    }
    const msg = `Thanks ${name}! What's the property address where we should meet you?`
    await sendSMSAndLog(business, conversation.id, from, msg)
    await db.conversation.update({
      where: { id: conversation.id },
      data: {
        bookingFlowState: JSON.parse(JSON.stringify({
          step: 'awaiting_address_after_slot',
          customerName: name,
          serviceType: flowState.serviceType,
          notes: flowState.notes,
          selectedSlot: flowState.selectedSlot,
          sentAt: new Date().toISOString(),
        })),
      },
    })
    return true
  }

  // ── Step: awaiting_name_and_address (legacy — combined question; add time-change check first) ──
  if (flowState.step === 'awaiting_name_and_address' && flowState.selectedSlot) {
    if (looksLikeQuestion(rawText)) return false
    const timeChangeHandled = await handleTimeChangeFromSlotChoice(flowState, rawText)
    if (timeChangeHandled) return true
    const name = parseNameFromMessage(rawText) || flowState.customerName
    const address = parseAddressFromMessage(rawText)
    if (!name || name.length > 100) return false

    const convCheck = await db.conversation.findUnique({
      where: { id: conversation.id },
      include: { appointment: true },
    })
    if (convCheck?.appointment) return true

    const dateLabel = formatDateFull(flowState.selectedSlot.start, tz)
    const timeStr = flowState.selectedSlot.display || new Date(flowState.selectedSlot.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz })

    if (address || !bookingRequiresAddress) {
      const confirmMsg = `Perfect! Just to confirm: ${dateLabel} at ${timeStr} for ${name}${address ? ` at ${address}` : ''}. Reply yes to confirm.`
      await sendSMSAndLog(business, conversation.id, from, confirmMsg)
      await db.conversation.update({
        where: { id: conversation.id },
        data: {
          bookingFlowState: JSON.parse(JSON.stringify({
            step: 'awaiting_confirmation',
            customerName: name,
            serviceType: flowState.serviceType,
            notes: flowState.notes,
            selectedSlot: flowState.selectedSlot,
            customerAddress: address ?? undefined,
            sentAt: new Date().toISOString(),
          })),
        },
      })
      return true
    }
    const msg = `Thanks ${name}! What's the property address where we should meet you?`
    await sendSMSAndLog(business, conversation.id, from, msg)
    await db.conversation.update({
      where: { id: conversation.id },
      data: {
        bookingFlowState: JSON.parse(JSON.stringify({
          step: 'awaiting_address_after_slot',
          customerName: name,
          serviceType: flowState.serviceType,
          notes: flowState.notes,
          selectedSlot: flowState.selectedSlot,
          sentAt: new Date().toISOString(),
        })),
      },
    })
    return true
  }

  // ── Step: awaiting_address_after_slot (have name, need address) ──
  if (flowState.step === 'awaiting_address_after_slot' && flowState.selectedSlot) {
    if (looksLikeQuestion(rawText)) return false
    const timeChangeHandled = await handleTimeChangeFromSlotChoice(flowState, rawText)
    if (timeChangeHandled) return true
    const address = rawText.trim()
    if (!address || address.length > 500) return false
    const convCheck = await db.conversation.findUnique({
      where: { id: conversation.id },
      include: { appointment: true },
    })
    if (convCheck?.appointment) return true

    const dateLabel = formatDateFull(flowState.selectedSlot.start, tz)
    const timeStr = flowState.selectedSlot.display || new Date(flowState.selectedSlot.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz })
    const confirmMsg = `Perfect! Just to confirm: ${dateLabel} at ${timeStr} for ${flowState.customerName || 'you'} at ${address}. Reply yes to confirm.`
    await sendSMSAndLog(business, conversation.id, from, confirmMsg)
    await db.conversation.update({
      where: { id: conversation.id },
      data: {
        bookingFlowState: JSON.parse(JSON.stringify({
          step: 'awaiting_confirmation',
          customerName: flowState.customerName,
          serviceType: flowState.serviceType,
          notes: flowState.notes,
          selectedSlot: flowState.selectedSlot,
          customerAddress: address,
          sentAt: new Date().toISOString(),
        })),
      },
    })
    return true
  }


  // ── Step: awaiting_time (customer gives date/time, we check exact slot — no slot lists) ──
  if (flowState.step === 'awaiting_time') {
    if (looksLikeQuestion(rawText)) return false

    // If we suggested alternatives (e.g. "2:30pm or 3pm"), try to match their reply to one of those
    if (suggestedSlots.length > 0 && lastDiscussedDate) {
      const timeMatch = trimmed.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i)
      if (timeMatch) {
        let h = parseInt(timeMatch[1], 10)
        const min = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0
        const ampm = (timeMatch[3] || '').toLowerCase()
        if (ampm === 'pm' && h < 12) h += 12
        if (ampm === 'am' && h === 12) h = 0
        const matched = suggestedSlots.find((s) => {
          const d = new Date(s.start)
          const sh = parseInt(d.toLocaleTimeString('en-US', { hour: 'numeric', hour12: false, timeZone: tz }), 10)
          const sm = parseInt(d.toLocaleTimeString('en-US', { minute: 'numeric', timeZone: tz }), 10)
          return sh === h && sm === min
        })
        if (matched) {
          const dateLabel = formatDateFull(matched.start, tz)
          const msg = `${dateLabel} at ${matched.display} is open! What's your name?`
          await sendSMSAndLog(business, conversation.id, from, msg)
          await db.conversation.update({
            where: { id: conversation.id },
            data: {
              bookingFlowState: JSON.parse(JSON.stringify({
                step: 'awaiting_name_after_slot',
                customerName: flowState.customerName,
                serviceType: flowState.serviceType,
                notes: flowState.notes,
                selectedSlot: matched,
                sentAt: new Date().toISOString(),
              })),
            },
          })
          return true
        }
      }
    }

    const timePref = parseTimePreference(trimmed, tz)
    if (!timePref) {
      const hoursSummary = formatBusinessHoursSummary(business.businessHours)
      const msg = `What day and time work best for you? (e.g. Friday at 2pm, tomorrow at 9am) We're available ${hoursSummary}.`
      await sendSMSAndLog(business, conversation.id, from, msg)
      return true
    }

    const { startStr, timeOfDay, preferredHour, preferredMinute, isPastDate } = timePref
    if (isPastDate) {
      const msg = `That date has already passed. What day and time works better for you?`
      await sendSMSAndLog(business, conversation.id, from, msg)
      return true
    }

    if (isBusinessClosedOnDate(startStr, tz, business.businessHours)) {
      const dateLabel = formatDateFull(startStr + 'T12:00:00', tz)
      const msg = `Sorry, we're closed on ${dateLabel}. Tell us another day and time that works for you.`
      await sendSMSAndLog(business, conversation.id, from, msg)
      return true
    }

    const hour = preferredHour ?? (timeOfDay === 'morning' ? 9 : timeOfDay === 'evening' ? 17 : 14)
    const minute = preferredMinute ?? 0

    const slot = await isSpecificSlotAvailable(business.id, startStr, hour, minute, tz)
    if (slot) {
      const dateLabel = formatDateFull(slot.start, tz)
      const msg = `${dateLabel} at ${slot.display} is open! What's your name?`
      await sendSMSAndLog(business, conversation.id, from, msg)
      await db.conversation.update({
        where: { id: conversation.id },
        data: {
          bookingFlowState: JSON.parse(JSON.stringify({
            step: 'awaiting_name_after_slot',
            customerName: flowState.customerName,
            serviceType: flowState.serviceType,
            notes: flowState.notes,
            selectedSlot: slot,
            sentAt: new Date().toISOString(),
          })),
        },
      })
      return true
    }

    const closest = await getTwoClosestSlotsOnDay(business.id, startStr, hour, minute, tz)
    if (closest.length > 0) {
      const timesStr = closest.map((s) => s.display).join(' or ')
      const dateLabel = formatDateFull(startStr + 'T12:00:00', tz)
      const reqTime = `${hour > 12 ? hour - 12 : hour === 0 ? 12 : hour}${minute ? ':' + String(minute).padStart(2, '0') : ''}${hour >= 12 ? 'pm' : 'am'}`
      const msg = `Sorry, ${dateLabel} at ${reqTime} is taken. How about ${timesStr} that same day? Or tell me another day and time that works for you.`
      await sendSMSAndLog(business, conversation.id, from, msg)
      await db.conversation.update({
        where: { id: conversation.id },
        data: {
          bookingFlowState: JSON.parse(JSON.stringify({
            step: 'awaiting_time',
            customerName: flowState.customerName,
            serviceType: flowState.serviceType,
            notes: flowState.notes,
            suggestedSlots: closest,
            lastDiscussedDate: startStr,
            sentAt: new Date().toISOString(),
          })),
        },
      })
      return true
    }

    const dateLabel = formatDateFull(startStr + 'T12:00:00', tz)
    const msg = `Sorry, ${dateLabel} is fully booked. Tell us another day and time that works better for you and I'll check.`
    await sendSMSAndLog(business, conversation.id, from, msg)
    await db.conversation.update({
      where: { id: conversation.id },
      data: {
        bookingFlowState: JSON.parse(JSON.stringify({
          step: 'awaiting_time',
          customerName: flowState.customerName,
          serviceType: flowState.serviceType,
          notes: flowState.notes,
          sentAt: new Date().toISOString(),
        })),
      },
    })
    return true
  }

  // ── Step: awaiting_name_and_preference (combined: name + day/time in one reply) ──
  if (flowState.step === 'awaiting_name_and_preference') {
    const handled = await handleAwaitingNameAndPreference(business, conversation, rawText, trimmed, from, flowState)
    if (handled) return true
    return false
  }

  // ── Step: awaiting_name (legacy — redirect to combined name+time to keep messages short) ──
  if (flowState.step === 'awaiting_name') {
    if (looksLikeQuestion(rawText)) return false
    const name = parseNameFromMessage(rawText)
    if (!name || name.length > 100) return false
    const hoursSummary = formatBusinessHoursSummary(business.businessHours)
    const msg = `Thanks ${name}! What day and time works best for you? We're available ${hoursSummary}.`
    await sendSMSAndLog(business, conversation.id, from, msg)
    await db.conversation.update({
      where: { id: conversation.id },
      data: {
        bookingFlowState: JSON.parse(JSON.stringify({
          step: 'awaiting_time',
          customerName: name,
          sentAt: new Date().toISOString(),
        })),
      },
    })
    return true
  }

  // ── Step: awaiting_service ──
  if (flowState.step === 'awaiting_service' && flowState.services?.length) {
    if (looksLikeQuestion(rawText)) return false
    const serviceType = parseServiceSelection(rawText, flowState.services)
    if (!serviceType) return false
    const msg = `Got it! We'll set up a free in-person quote for ${serviceType}. ${business.name} will come out, take a look, and give you an exact price. Anything we should know before coming out? (Yard size, specific areas, etc.)`
    await sendSMSAndLog(business, conversation.id, from, msg)
    await db.conversation.update({
      where: { id: conversation.id },
      data: {
        bookingFlowState: JSON.parse(JSON.stringify({
          step: 'awaiting_notes',
          customerName: flowState.customerName,
          serviceType,
          services: flowState.services,
          sentAt: new Date().toISOString(),
        })),
      },
    })
    return true
  }

  // ── Step: awaiting_notes ──
  if (flowState.step === 'awaiting_notes') {
    if (looksLikeQuestion(rawText)) return false
    const notes = parseNotesFromMessage(rawText)
    const hoursSummary = formatBusinessHoursSummary(business.businessHours)
    const msg = `What day and time work best for you? We're available ${hoursSummary}.`
    await sendSMSAndLog(business, conversation.id, from, msg)
    await db.conversation.update({
      where: { id: conversation.id },
      data: {
        bookingFlowState: JSON.parse(JSON.stringify({
          step: 'awaiting_time',
          customerName: flowState.customerName,
          serviceType: flowState.serviceType,
          notes: notes || undefined,
          services: flowState.services,
          sentAt: new Date().toISOString(),
        })),
      },
    })
    return true
  }

  // ── Step: awaiting_address (legacy — address was between notes and preference; kept for in-flight convos) ──
  if (flowState.step === 'awaiting_address') {
    if (looksLikeQuestion(rawText)) return false
    const address = rawText.trim()
    if (!address || address.length > 500) return false
    const hoursSummary = formatBusinessHoursSummary(business.businessHours)
    const msg = `What day and time work best for you? We're available ${hoursSummary}.`
    await sendSMSAndLog(business, conversation.id, from, msg)
    await db.conversation.update({
      where: { id: conversation.id },
      data: {
        bookingFlowState: JSON.parse(JSON.stringify({
          step: 'awaiting_time',
          customerName: flowState.customerName,
          serviceType: flowState.serviceType,
          notes: flowState.notes,
          customerAddress: address,
          services: flowState.services,
          sentAt: new Date().toISOString(),
        })),
      },
    })
    return true
  }

  // ── Detect booking intent (start flow) ──
  // Check current message AND conversation history for booking intent
  const hasBookingIntentInMessage = BOOKING_INTENT_WORDS.some(w => trimmed.includes(w))
  const hasBookingIntentInConversation = !hasBookingIntentInMessage && conversation.messages
    .filter((m: any) => m.direction === 'inbound')
    .some((m: any) => {
      const c = m.content?.toLowerCase() || ''
      return BOOKING_INTENT_WORDS.some(w => c.includes(w))
    })
  // Also detect implicit intent: customer agreeing to AI's booking offer ("yes", "sure", "yeah")
  const aiOfferedBooking = conversation.messages
    .filter((m: any) => m.direction === 'outbound')
    .some((m: any) => {
      const c = m.content?.toLowerCase() || ''
      return /free.*quote|in-person quote|set up a.*quote|like to (book|schedule)|come out.*look/i.test(c)
    })
  const customerAgreeing = /^(yes|yeah|yep|yup|sure|ok|okay|please|let's do it|sounds good|that works|i'm interested|definitely|absolutely)\b/i.test(trimmed)
  const implicitBookingIntent = aiOfferedBooking && customerAgreeing
  const hasBookingIntent = hasBookingIntentInMessage || hasBookingIntentInConversation || implicitBookingIntent
  if (!hasBookingIntent || !business.calendarEnabled || !business.googleCalendarConnected) {
    console.log('[SMS BOOKING] No booking intent detected in message or conversation history, returning false')
    return false
  }
  console.log('[SMS BOOKING] Booking intent detected!', {
    inMessage: hasBookingIntentInMessage,
    inHistory: hasBookingIntentInConversation,
    implicitAgreement: implicitBookingIntent,
    text: trimmed.slice(0, 60),
  })

  // Extract any info already provided in conversation before starting flow
  const svcType = conversation.serviceRequested || extractServiceFromConversation(conversation.messages) || undefined
  const existingName = conversation.callerName || undefined
  const hoursSummary = formatBusinessHoursSummary(business.businessHours)
  const msg = existingName
    ? `I'd love to set that up, ${existingName}! What day and time work best for you? We're available ${hoursSummary}.`
    : `I'd love to set that up! What day and time work best for you? We're available ${hoursSummary}.`
  await sendSMSAndLog(business, conversation.id, from, msg)
  await db.conversation.update({
    where: { id: conversation.id },
    data: {
      status: 'booking_in_progress',
      bookingFlowState: JSON.parse(JSON.stringify({
        step: existingName ? 'awaiting_time' : 'awaiting_name_and_preference',
        customerName: existingName,
        serviceType: svcType,
        sentAt: new Date().toISOString(),
      })),
    },
  })
  console.log('[SMS BOOKING] Booking flow started', { step: existingName ? 'awaiting_time' : 'awaiting_name_and_preference', customerName: existingName, serviceType: svcType })
  return true
}

/** Handle combined name + time in one response (e.g. "John, Friday at 2pm"). Checks exact slot, no slot lists. */
async function handleAwaitingNameAndPreference(
  business: any,
  conversation: any,
  rawText: string,
  trimmed: string,
  from: string,
  flowState: BookingFlowState
): Promise<boolean> {
  if (looksLikeQuestion(rawText)) return false
  let name = parseNameFromMessage(rawText)
  if (!name || name.length > 100) return false

  const NOT_A_NAME = /^(yes|yeah|yep|yup|sure|ok|okay|no|nope|please|thanks|thank you|hi|hey|hello|sounds good|that works|definitely|absolutely|let's do it|i'm interested|great)$/i
  if (NOT_A_NAME.test(name.trim())) {
    if (flowState.customerName) {
      name = flowState.customerName
    } else {
      return false
    }
  }

  const tz = business.timezone ?? 'America/New_York'
  const timePref = parseTimePreference(trimmed, tz)
  if (timePref && flowState.customerName && (name === rawText.trim() || name.length > 30)) {
    name = flowState.customerName
  }
  if (!timePref) {
    const hoursSummary = formatBusinessHoursSummary(business.businessHours)
    const msg = `Thanks ${name}! What day and time works for you? (e.g. Friday at 2pm) We're available ${hoursSummary}.`
    await sendSMSAndLog(business, conversation.id, from, msg)
    await db.conversation.update({
      where: { id: conversation.id },
      data: {
        bookingFlowState: JSON.parse(JSON.stringify({
          step: 'awaiting_time',
          customerName: name,
          serviceType: flowState.serviceType,
          notes: flowState.notes,
          sentAt: new Date().toISOString(),
        })),
      },
    })
    return true
  }

  const { startStr, timeOfDay, preferredHour, preferredMinute, isPastDate } = timePref
  const serviceType = extractServiceFromConversation(conversation.messages) || flowState.serviceType
  const notes = parseNotesFromMessage(rawText) || flowState.notes

  if (isPastDate) {
    const msg = `That date has passed. What day and time works better for you?`
    await sendSMSAndLog(business, conversation.id, from, msg)
    await db.conversation.update({
      where: { id: conversation.id },
      data: {
        bookingFlowState: JSON.parse(JSON.stringify({
          step: 'awaiting_time',
          customerName: name,
          serviceType,
          notes: notes || undefined,
          sentAt: new Date().toISOString(),
        })),
      },
    })
    return true
  }

  if (isBusinessClosedOnDate(startStr, tz, business.businessHours)) {
    const dateLabel = formatDateFull(startStr + 'T12:00:00', tz)
    const msg = `Sorry, we're closed on ${dateLabel}. Tell us another day and time that works for you.`
    await sendSMSAndLog(business, conversation.id, from, msg)
    await db.conversation.update({
      where: { id: conversation.id },
      data: {
        bookingFlowState: JSON.parse(JSON.stringify({
          step: 'awaiting_time',
          customerName: name,
          serviceType,
          notes: notes || undefined,
          sentAt: new Date().toISOString(),
        })),
      },
    })
    return true
  }

  const hour = preferredHour ?? (timeOfDay === 'morning' ? 9 : timeOfDay === 'evening' ? 17 : 14)
  const minute = preferredMinute ?? 0

  const slot = await isSpecificSlotAvailable(business.id, startStr, hour, minute, tz)
  if (slot) {
    const dateLabel = formatDateFull(slot.start, tz)
    const msg = `${dateLabel} at ${slot.display} is open! What's your name?`
    await sendSMSAndLog(business, conversation.id, from, msg)
    await db.conversation.update({
      where: { id: conversation.id },
      data: {
        bookingFlowState: JSON.parse(JSON.stringify({
          step: 'awaiting_name_after_slot',
          customerName: name,
          serviceType,
          notes: notes || undefined,
          selectedSlot: slot,
          sentAt: new Date().toISOString(),
        })),
      },
    })
    return true
  }

  const closest = await getTwoClosestSlotsOnDay(business.id, startStr, hour, minute, tz)
  if (closest.length > 0) {
    const timesStr = closest.map((s) => s.display).join(' or ')
    const dateLabel = formatDateFull(startStr + 'T12:00:00', tz)
    const reqTime = `${hour > 12 ? hour - 12 : hour === 0 ? 12 : hour}:${String(minute).padStart(2, '0')}${hour >= 12 ? 'pm' : 'am'}`
    const msg = `Sorry, ${dateLabel} at ${reqTime} is taken. How about ${timesStr} that same day? Or tell me another day and time that works for you.`
    await sendSMSAndLog(business, conversation.id, from, msg)
    await db.conversation.update({
      where: { id: conversation.id },
      data: {
        bookingFlowState: JSON.parse(JSON.stringify({
          step: 'awaiting_time',
          customerName: name,
          serviceType,
          notes: notes || undefined,
          suggestedSlots: closest,
          lastDiscussedDate: startStr,
          sentAt: new Date().toISOString(),
        })),
      },
    })
    return true
  }

  const dateLabel = formatDateFull(startStr + 'T12:00:00', tz)
  const msg = `Sorry, ${dateLabel} is fully booked. Tell us another day and time that works better for you and I'll check.`
  await sendSMSAndLog(business, conversation.id, from, msg)
  await db.conversation.update({
    where: { id: conversation.id },
    data: {
      bookingFlowState: JSON.parse(JSON.stringify({
        step: 'awaiting_time',
        customerName: name,
        serviceType,
        notes: notes || undefined,
        sentAt: new Date().toISOString(),
      })),
    },
  })
  return true
}

/** Get next N business days starting from TODAY in business timezone (skip days when business is closed). */
function getNext3BusinessDays(tz: string, businessHoursRaw: unknown): { startStr: string; endStr: string } {
  const hours = parseBusinessHours(businessHoursRaw)
  const todayStr = getTodayInTimezone(tz)
  const [y, m, d] = todayStr.split('-').map(Number)
  const todayStart = new TZDate(y, m - 1, d, 0, 0, 0, 0, tz)
  const days: string[] = []
  for (let offset = 0; offset < 14 && days.length < 3; offset++) {
    const cursor = addDays(todayStart, offset)
    const dateStr = new Date(cursor.getTime()).toLocaleDateString('en-CA', { timeZone: tz })
    const cursorInTz = new TZDate(cursor.getTime(), tz)
    const dayName = DAY_NAMES[cursorInTz.getDay()]
    if (hours[dayName]) {
      days.push(dateStr)
    }
  }
  if (days.length === 0) {
    return { startStr: todayStr, endStr: todayStr }
  }
  return { startStr: days[0], endStr: days[days.length - 1] }
}

type SlotLike = { start: string; end: string; display: string }

type TimePreferenceResult = {
  startStr: string
  endStr: string
  timeOfDay?: 'morning' | 'afternoon' | 'evening'
  preferredHour?: number // 0-23 when user says "2pm", "9am", etc.
  preferredMinute?: number // 0-59 when user says "2:30pm", "9:15am", etc.
  isPastDate?: boolean
  /** Minutes since midnight — only show slots AFTER this time (e.g. "until 9:30" → 570) */
  notBeforeMinutes?: number
}

/** Parse natural language timing into date range + optional time-of-day filter. */
function parseTimePreference(text: string, tz: string): TimePreferenceResult | null {
  const t = text.toLowerCase().trim()
  const dayNames: Record<string, number> = {
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
    sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
  }
  const todayStr = getTodayInTimezone(tz)
  const [y, m, d] = todayStr.split('-').map(Number)
  const todayStart = new TZDate(y, m - 1, d, 0, 0, 0, 0, tz)
  const nowInTz = new TZDate(new Date(), tz)
  const todayDow = nowInTz.getDay()
  const todayMs = nowInTz.getTime()

  // Debug: log exactly what getTomorrowInTimezone returns for date resolution verification
  const tomorrowStr = getTomorrowInTimezone(tz)
  console.log('[DATE DEBUG] today:', todayStr, 'tomorrow:', tomorrowStr, 'input:', text)

  // anytime, whenever, ASAP, as soon as possible → next 3 business days
  if (/\b(anytime|whenever|asap|as\s+soon\s+as\s+possible|soonest|earliest)\b/.test(t)) {
    const { startStr, endStr } = getNext3BusinessDays(tz, null)
    return { startStr, endStr }
  }

  let startDate: Date | null = null
  let timeOfDay: 'morning' | 'afternoon' | 'evening' | undefined

  // "this weekend" = upcoming Saturday
  if (/\bthis\s+weekend\b/i.test(t)) {
    const satDow = 6
    let daysAhead = satDow - todayDow
    if (daysAhead < 0) daysAhead += 7
    startDate = addDays(todayStart, daysAhead)
  }
  // "the 6th" or "6th" or "on the 15th" = day of month (current or next month if passed)
  else if (/\b(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\b/.test(t) && !/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(t)) {
    const match = t.match(/(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?/i)
    if (match) {
      const dayOfMonth = parseInt(match[1], 10)
      if (dayOfMonth >= 1 && dayOfMonth <= 31) {
        let candidate = new TZDate(y, m - 1, Math.min(dayOfMonth, 28), 0, 0, 0, 0, tz)
        if (candidate.getDate() !== dayOfMonth) candidate.setDate(dayOfMonth)
        if (candidate.getTime() < todayMs) candidate = addMonths(candidate, 1)
        if (candidate.getDate() !== dayOfMonth) candidate.setDate(Math.min(dayOfMonth, new Date(candidate.getFullYear(), candidate.getMonth() + 1, 0).getDate()))
        startDate = candidate
      }
    }
  }
  // "March 6th" or "March 6" or "march 15" = specific date
  else if (/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i.test(t)) {
    const match = t.match(/(\w+)\s+(\d{1,2})(?:st|nd|rd|th)?/i)
    if (match) {
      const monthName = match[1].toLowerCase()
      const monthIdx = MONTH_NAMES[monthName] ?? MONTH_NAMES[monthName.slice(0, 3)]
      const dayOfMonth = parseInt(match[2], 10)
      if (monthIdx !== undefined && dayOfMonth >= 1 && dayOfMonth <= 31) {
        let candidate = new TZDate(y, monthIdx, Math.min(dayOfMonth, 28), 0, 0, 0, 0, tz)
        if (candidate.getDate() !== dayOfMonth) candidate.setDate(dayOfMonth)
        if (candidate.getTime() < todayMs) candidate = addYears(candidate, 1)
        if (candidate.getDate() !== dayOfMonth) candidate.setDate(Math.min(dayOfMonth, new Date(candidate.getFullYear(), candidate.getMonth() + 1, 0).getDate()))
        startDate = candidate
      }
    }
  }
  // "this Friday", "this Monday" — next upcoming occurrence (including today)
  else if (/\bthis\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/i.test(t)) {
    const match = t.match(/this\s+(\w+)/i)
    if (match) {
      const name = match[1].toLowerCase()
      const dow = dayNames[name] ?? dayNames[name.slice(0, 3)]
      if (dow !== undefined) {
        let daysAhead = dow - todayDow
        if (daysAhead < 0) daysAhead += 7
        startDate = addDays(todayStart, daysAhead)
      }
    }
  }
  // "next Monday" = Monday of next week
  else if (/\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/i.test(t)) {
    const match = t.match(/next\s+(\w+)/i)
    if (match) {
      const name = match[1].toLowerCase()
      const dow = dayNames[name] ?? dayNames[name.slice(0, 3)]
      if (dow !== undefined) {
        let daysAhead = dow - todayDow
        if (daysAhead <= 0) daysAhead += 7
        daysAhead += 7
        startDate = addDays(todayStart, daysAhead)
      }
    }
  }
  else if (/\bnext\s+week\b/.test(t)) {
    startDate = addDays(todayStart, 7)
  }
  else if (/\btomorrow\b/.test(t)) {
    startDate = addDays(todayStart, 1)
  }
  else if (/\btoday\b/.test(t)) {
    startDate = todayStart
  }
  else {
    // Standalone day name (e.g. "Friday", "Thursday works") = next upcoming occurrence, including today
    for (const [name, dow] of Object.entries(dayNames)) {
      if (new RegExp(`\\b${name}\\b`).test(t)) {
        let daysAhead = dow - todayDow
        if (daysAhead < 0) daysAhead += 7
        startDate = addDays(todayStart, daysAhead)
        break
      }
    }
  }

  // Specific hour: "2pm", "9am", "2:30pm", "at 3pm", "noon", "12" (when with day like "Friday at noon")
  let preferredHour: number | undefined
  let preferredMinute: number | undefined
  const hourMatch = t.match(/(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i)
  if (hourMatch) {
    let h = parseInt(hourMatch[1], 10)
    const minStr = hourMatch[2]
    preferredMinute = minStr ? Math.min(59, parseInt(minStr, 10)) : 0
    const ampm = (hourMatch[3] || '').toLowerCase()
    if (ampm === 'pm' && h < 12) h += 12
    if (ampm === 'am' && h === 12) h = 0
    if (h >= 0 && h <= 23) preferredHour = h
  }
  // "noon" or "12" (standalone when with day, e.g. "Friday at noon") = 12pm
  if (/\bnoon\b/i.test(t) || (/\b12\b/.test(t) && /\b(at|@|around)\s+12\b/i.test(t))) {
    preferredHour = 12
    preferredMinute = preferredMinute ?? 0
  }

  // "until 9:30" / "until 9" / "until 9am" / "until 10" — customer busy until then, show slots AFTER
  let notBeforeMinutes: number | undefined
  const untilMatch = t.match(/\buntil\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i)
  if (untilMatch) {
    let h = parseInt(untilMatch[1], 10)
    const min = untilMatch[2] ? parseInt(untilMatch[2], 10) : 0
    const ampm = (untilMatch[3] || '').toLowerCase()
    if (ampm === 'pm' && h < 12) h += 12
    if (ampm === 'am' && h === 12) h = 0
    notBeforeMinutes = h * 60 + min
  }
  const afterMatch = t.match(/\b(?:after|from)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i)
  if (afterMatch && notBeforeMinutes === undefined) {
    let h = parseInt(afterMatch[1], 10)
    const min = afterMatch[2] ? parseInt(afterMatch[2], 10) : 0
    const ampm = (afterMatch[3] || '').toLowerCase()
    if (ampm === 'pm' && h < 12) h += 12
    if (ampm === 'am' && h === 12) h = 0
    notBeforeMinutes = h * 60 + min
  }

  // Time of day: morning, afternoon, evening
  if (/\b(morning|am)\b/.test(t) || /\bbefore\s+noon\b/.test(t)) {
    timeOfDay = timeOfDay ?? 'morning'
  } else if (/\b(afternoon|pm)\b/.test(t) || /\bafter\s+(noon|12)\b/.test(t)) {
    timeOfDay = timeOfDay ?? 'afternoon'
  } else if (/\bevening\b/.test(t) || /\bafter\s+[56]\s*(pm)?\b/.test(t)) {
    timeOfDay = timeOfDay ?? 'evening'
  } else if (/\bbefore\s+noon\b|\baround\s+\d|^\d\s*(am|pm)\b/i.test(t)) {
    timeOfDay = timeOfDay ?? 'morning'
  } else if (/\bafter\s+\d{1,2}\s*(pm)?|\baround\s+\d{1,2}\b/i.test(t)) {
    timeOfDay = timeOfDay ?? 'afternoon'
  }

  // Standalone time-of-day without specific day
  if (!startDate && (timeOfDay || /\b(morning|afternoon|evening)\b/.test(t))) {
    const { startStr, endStr } = getNext3BusinessDays(tz, null)
    return { startStr, endStr, timeOfDay: timeOfDay ?? 'afternoon' }
  }

  if (!startDate) return null

  const startStr = startDate.toLocaleDateString('en-CA', { timeZone: tz })
  const isPastDate = startStr < todayStr

  // "tomorrow" = fetch ONLY that single day. "today" = same. Never use getNext3BusinessDays for explicit day requests.
  let endStr: string
  if (/\btomorrow\b/.test(t) || /\btoday\b/.test(t)) {
    endStr = startStr
  } else {
    const endDate = addDays(startDate, /\bnext\s+week\b/.test(t) ? 6 : timeOfDay ? 1 : 2)
    endStr = endDate.toLocaleDateString('en-CA', { timeZone: tz })
  }
  return { startStr, endStr, timeOfDay, preferredHour, preferredMinute, isPastDate: isPastDate || undefined, notBeforeMinutes }
}

// ── Helpers ─────────────────────────────────────────────────────────

async function generateAIResponse(
  business: any,
  conversation: any,
  latestMessage: string,
  bookingFlowState?: unknown,
  calendarEnabled?: boolean
): Promise<string> {
  const conversationHistory = conversation.messages.map((msg: any) => ({
    role: msg.direction === 'inbound' ? ('user' as const) : ('assistant' as const),
    content: msg.content,
  }))

  const tz = business.timezone ?? 'America/New_York'
  const todayStr = getTodayInTimezone(tz)
  const todayFormatted = formatDateFull(todayStr + 'T12:00:00', tz)
  const nowInTz = new TZDate(new Date(), tz)
  const weekday = nowInTz.toLocaleDateString('en-US', { weekday: 'long', timeZone: tz })

  let availableDatesForPrompt = ''
  if (business.calendarEnabled && business.googleCalendarConnected) {
    try {
      const endDate = addDays(nowInTz, 14)
      const endStr = endDate.toLocaleDateString('en-CA', { timeZone: tz })
      const slots = await getAvailableSlots(business.id, todayStr, endStr)
      const uniqueDates = Array.from(new Set(slots.map(s => new Date(s.start).toLocaleDateString('en-CA', { timeZone: tz }))))
        .sort()
        .slice(0, 14)
      if (uniqueDates.length > 0) {
        // Limit to 7 dates to avoid token limits on Haiku (keep prompt lean)
        const dates = uniqueDates.slice(0, 7).map(d => formatDateFull(d + 'T12:00:00', tz)).join(', ')
        availableDatesForPrompt = `\n- Available dates for quotes (next 2 weeks): ${dates}`
      }
    } catch {
      // Ignore — prompt will work without this
    }
  }

  const flowState = bookingFlowState as BookingFlowState | null | undefined
  const rawLeadState = bookingFlowState as { leadFlow?: boolean; step?: string } | null | undefined
  const inLeadFlow = rawLeadState?.leadFlow === true
  const inBookingFlow = flowState?.step && !inLeadFlow
  const bookingRequiresAddress = business.bookingRequiresAddress ?? true
  const hoursSummary = formatBusinessHoursSummary(business.businessHours)

  // ── LEAD-ONLY MODE (no calendar) ──────────────────────────────────
  if (!calendarEnabled) {
    const leadSystemPrompt = `You are the SMS assistant for ${business.name}. You text like a real person — casual, friendly, and professional.

TODAY: ${weekday}, ${todayFormatted} (${tz})

YOUR GOAL: Understand what the customer needs, collect their name and property address, get a general timeframe, then hand off to the business owner. Do NOT offer specific time slots or try to schedule — that is the owner's job.

PERSONALITY:
- Casual and friendly. Sound like a real person texting, not a robot.
- Use the customer's name once you know it.
- Max 1-2 emojis per entire conversation. Nothing inappropriate.
- Keep every message under 160 characters when possible. Never more than 3 sentences.
- NEVER use markdown formatting (no **bold**, no bullet points, no dashes for lists). Plain text only.
- After the first greeting, never mention being automated or an AI again.

GREETING:
- The first greeting was sent automatically — you did not send it.
- When the customer replies, respond naturally based on what they said. If they just said "hey" or "hi", say something like "Hey! What can I help you with today?"
- NEVER jump into lead capture from a greeting. Wait until the customer describes what they need.

IDEAL CONVERSATION (3-5 messages from you):
1. Customer describes need -> You: "We'd love to help with that! Let me get your info and have someone from the team follow up with you. What's your name?"
2. Customer: "John" -> You: "Thanks John! And what's the address for the property?"
3. Customer: "123 Main St" -> You: "When are you generally looking to get this done — this week, next week, or no rush?"
4. Customer: "Next week" -> You: "Perfect! Someone from ${business.name} will follow up with you shortly to discuss next steps and set up a time that works. Talk soon!" then output [READY_TO_CAPTURE]

LEAD CAPTURE RULES:
- Collect: name, address (ask but optional), general timeframe.
- Do NOT ask for email. Ever.
- Do NOT ask for phone number — you already have it from SMS. But DO ask "Is this the best number to reach you at?" to verify.
- If customer says "book" or "schedule", say "I'd love to help! Let me get your info and someone will call you to set that up."
- Parse info from ANY message. "I'm John and I need lawn care next week at 123 Main St" = name + service + address + timeframe in one message. Never re-ask for info already given.
- When you have collected enough info (at minimum: name), tell them someone will follow up, then output [READY_TO_CAPTURE] at the very end of your message.

SERVICES & KNOWLEDGE:
- When asked "what do you guys do", keep it vague and mention 2-3 services then ask what they need.
- Use the business info below for knowledge, but don't list everything unprompted.
- If someone describes a need that matches a service, suggest it naturally.
- If unsure which service fits, say "We can definitely help with that."
- If someone asks about multiple services, treat it as one lead for both.

PRICING — STRICT RULE:
- NEVER give pricing, estimates, ranges, or cost information. Ever.
- Say something like: "Pricing depends on the specifics of your property. We can set up a free in-person quote so you get an exact price."
- If they push, repeat that you can't give numbers over text but a quote visit is free.

BUSINESS INFO:
- Name: ${business.name}
- Services: ${JSON.stringify(business.servicesOffered) || 'General services'}
${business.aiContext ? `- About: ${business.aiContext}` : ''}
${business.aiInstructions ? `- Special instructions: ${business.aiInstructions}` : ''}
- Business hours: ${hoursSummary}
${business.forwardingNumber ? `- Phone: ${business.forwardingNumber}` : ''}
${(business as any).website ? `- Website: ${(business as any).website}` : ''}

UNKNOWN QUESTIONS:
- If you don't know the answer, don't make anything up.
- Say: "I'm not sure about that, but I'll make sure someone from the team gets back to you on it."
- Continue toward lead capture. Don't let an unknown question derail the flow.

FRUSTRATED CUSTOMER:
- Apologize: "I'm sorry about that! Let me have someone from the team reach out to you as soon as possible."
- Add [HUMAN_NEEDED: reason="Customer frustrated"] at the end.
- Stop trying to capture info — just hand off.

OFF TOPIC:
- "I can only help with questions about ${business.name} and scheduling.${business.forwardingNumber ? ` For anything else, give us a call at ${business.forwardingNumber}.` : ''}"
- If they continue off topic after one redirect, stop responding.

YES/NO WITHOUT CONTEXT:
- If someone just texts "yes" or "no" and it's unclear, ask: "Sorry, could you clarify what you mean?"

REPEAT CUSTOMERS:
- If previous messages show this person already interacted, acknowledge: "Hey [name], good to hear from you again! What can I help with this time?"

LANGUAGE:
- Only respond in English. If a message is in another language, do not respond.

THINGS YOU MUST NEVER DO:
- Never give pricing or estimates
- Never follow up if the customer stops responding
- Never use markdown formatting in SMS
- Never mention being an AI after the first greeting
- Never ask for email
- Never ask for phone number (just verify the current one)
- Never make up business information
- Never override the business's special instructions above`

    const AI_MODEL = 'claude-haiku-4-5-20251001'
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey || apiKey.trim() === '') {
      const msg = 'ANTHROPIC_API_KEY is missing or empty'
      console.error('❌ [AI]', msg)
      return `I'm having trouble right now. AI error: ${msg}`
    }
    try {
      const response = await anthropic.messages.create({
        model: AI_MODEL,
        max_tokens: 256,
        system: leadSystemPrompt,
        messages: conversationHistory,
      })
      const textContent = response.content.find(block => block.type === 'text')
      return textContent?.text || "I'm having trouble right now. Someone will call you back shortly!"
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error)
      console.error('❌ [AI] Lead mode error:', errMsg)
      return `I'm having trouble right now. AI error: ${errMsg}`
    }
  }

  const flowGuidance = inBookingFlow
    ? `
BOOKING FLOW CONTEXT: The customer is in a booking flow for a FREE IN-PERSON QUOTE. Current step: ${flowState!.step}.

STEP GUIDANCE — NEVER combine questions; ask ONE thing per message:
- awaiting_name_and_preference: Customer may give name + time together (e.g. "John, Friday at 2pm"). The system checks the exact time — never show slot lists.
- awaiting_time: Customer gives date/time (e.g. "Friday at 2pm"). System checks exact slot and confirms or suggests alternatives. No numbered slot lists.
- awaiting_name_after_slot / awaiting_name_and_address: Ask for NAME ONLY — "What's your name?" Never ask for name and address in the same message.
- awaiting_address_after_slot: Ask for ADDRESS ONLY — "What's the property address where we should meet you?"
- awaiting_confirmation: The system repeated back ALL details (date, time, name, address). Wait for "yes". Don't repeat the confirmation question.
- TIME CHANGE: If customer says "lets do 5pm", "how about 3", "5pm works" etc. when a time was suggested, that is a TIME CHANGE request — the system handles it. Do NOT treat it as their name or address.
- NEVER output [APPOINTMENT_BOOKED]. The structured booking flow handles all booking. You must NOT create appointments.
- If they ask a question mid-flow: answer briefly (1 sentence), then guide back to the current step.
- Use their exact words for services (e.g. "hydro seeding" not "landscaping").`
    : ''

  const systemPrompt = `You are the SMS assistant for ${business.name}. You text like a real person — casual, friendly, and professional.

TODAY: ${weekday}, ${todayFormatted} (${tz})
${availableDatesForPrompt}

YOUR GOAL: Help the customer book a free in-person quote appointment. The booking flow state machine handles slot verification, calendar checks, and appointment creation. You guide the conversation naturally.

PERSONALITY:
- Casual and friendly. Sound like a real person texting, not a robot.
- Use the customer's name once you know it.
- Max 1-2 emojis per entire conversation. Nothing inappropriate.
- Keep every message under 160 characters when possible. Never more than 3 sentences.
- NEVER use markdown formatting (no **bold**, no bullet points, no dashes for lists). Plain text only.
- NEVER show numbered slot lists. The system checks the customer's requested date/time directly and confirms or suggests 1-2 alternatives.
- After the first greeting, never mention being automated or an AI again.

GREETING:
- The first greeting was sent automatically — you did not send it.
- When the customer replies, respond naturally based on what they said. If they just said "hey" or "hi", say something like "Hey! What can I help you with today?"
- NEVER jump into booking from a greeting. Wait until the customer describes what they need.

IDEAL CONVERSATION — ask ONE thing per message, never combined:
1. Customer describes need -> You: "We'd love to help with that! Would you like to set up a free in-person quote so ${business.name} can take a look and give you an exact price?"
2. Customer: "Yes" -> You: "Great! What day and time work best for you? We're available ${hoursSummary}."
3. Customer: "Friday at 2pm" -> System checks that exact time, confirms if open or suggests alternatives (e.g. "2:30pm or 3pm")
4. If they say "lets do 5pm" or "how about 3" -> That is a TIME CHANGE; system checks and confirms the new time. Never treat time changes as name or address.
5. Once time confirmed -> System asks for name ONLY: "What's your name?"
6. After name -> System asks for address ONLY: "What's the property address where we should meet you?"
7. Before booking -> System repeats back ALL details (date, time, name, address) and asks for confirmation. Customer replies yes -> Booking created.

BOOKING RULES:
- Ask for date and time together. Customer picks a specific time (e.g. "Friday at 2pm"); system checks it.
- NEVER combine questions: name, address, and time must be asked in SEPARATE messages.
- "lets do 5pm", "how about 3", "5pm works" = TIME CHANGE, not name or address. The system handles it.
- NEVER show numbered slot lists. The system confirms or denies the exact time they asked for.
- If their time is taken, system suggests 1-2 alternatives on the same day or asks for another day.
- ALWAYS repeat back ALL details (date, time, name, address) before final confirmation. Never auto-book.
- Ask for name first, then address — never "What's your name and address?" in one message.
- After booking, tell them "The owner will give you a call beforehand to confirm."
- The confirmation must include the ACTUAL booked date/time, not the customer's original words.
- Verify phone: "Is this the best number to reach you at?"
- Do NOT ask for email. Ever.

DATE/TIME RULES:
- "tomorrow" = the next calendar day
- "this Friday" = the upcoming Friday
- "next Monday" = Monday of NEXT week
- Always confirm with the full date: "That would be Friday, March 7th"
- Never book a date in the past
- Never book outside business hours
- Appointments can ONLY be during business hours. If someone texts at 11pm, still chat but only offer slots during business hours.

SERVICES & KNOWLEDGE:
- When asked "what do you guys do", keep it vague and mention 2-3 services then ask what they need.
- Use the business info below for knowledge, but don't list everything unprompted.
- If someone describes a need that matches a service, suggest it naturally.
- If unsure which service fits, say "We can definitely help with that."
- If someone asks about multiple services, treat it as one appointment for both.
- Don't categorize — use the customer's exact words. "patio and walkway" not "gardening."

PRICING — STRICT RULE:
- NEVER give pricing, estimates, ranges, or cost information. Ever.
- Say something like: "Pricing depends on the specifics of your property. We can set up a free in-person quote so you get an exact price."
- If they push, repeat that you can't give numbers over text but a quote visit is free.

BUSINESS INFO:
- Name: ${business.name}
- Services: ${JSON.stringify(business.servicesOffered) || 'General services'}
${business.aiContext ? `- About: ${business.aiContext}` : ''}
${business.aiInstructions ? `- Special instructions: ${business.aiInstructions}` : ''}
- Business hours: ${hoursSummary}
${business.forwardingNumber ? `- Phone: ${business.forwardingNumber}` : ''}
${(business as any).website ? `- Website: ${(business as any).website}` : ''}

UNKNOWN QUESTIONS:
- If you don't know the answer, don't make anything up.
- Say: "I'm not sure about that, but I'll make sure someone from the team gets back to you on it."
- Continue toward booking. Don't let an unknown question derail the flow.

FRUSTRATED CUSTOMER:
- Apologize: "I'm sorry about that! Let me have someone from the team reach out to you as soon as possible."
- Add [HUMAN_NEEDED: reason="Customer frustrated"] at the end.
- Stop trying to book — just hand off.

OFF TOPIC:
- "I can only help with questions about ${business.name} and scheduling.${business.forwardingNumber ? ` For anything else, give us a call at ${business.forwardingNumber}.` : ''}"
- If they continue off topic after one redirect, stop responding.

YES/NO WITHOUT CONTEXT:
- If someone just texts "yes" or "no" and it's unclear, ask: "Sorry, could you clarify what you mean?"

REPEAT CUSTOMERS:
- If previous messages show this person already interacted, acknowledge: "Hey [name], good to hear from you again! What can I help with this time?"

LANGUAGE:
- Only respond in English. If a message is in another language, do not respond.
${flowGuidance}

THINGS YOU MUST NEVER DO:
- Never give pricing or estimates
- Never book without explicit customer confirmation
- Never follow up if the customer stops responding
- Never use markdown formatting in SMS
- Never mention being an AI after the first greeting
- Never ask for email
- Never ask for phone number (just verify the current one)
- Never make up business information
- Never output [APPOINTMENT_BOOKED] — the structured booking flow handles all appointments
- Never override the business's special instructions above`

  const AI_MODEL = 'claude-haiku-4-5-20251001'
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey || apiKey.trim() === '') {
    const msg = 'ANTHROPIC_API_KEY is missing or empty'
    console.error('❌ [AI]', msg)
    return `I'm having trouble right now. AI error: ${msg}`
  }

  // Log full request for debugging
  const requestPayload = {
    model: AI_MODEL,
    max_tokens: 256,
    systemPromptLength: systemPrompt.length,
    systemPromptPreview: systemPrompt.slice(0, 200) + (systemPrompt.length > 200 ? '...' : ''),
    messagesCount: conversationHistory.length,
    messages: conversationHistory,
  }
  console.log('🔍 [AI] Full request:', JSON.stringify(requestPayload, null, 2))

  try {
    const response = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 256,
      system: systemPrompt,
      messages: conversationHistory,
    })
    const textContent = response.content.find(block => block.type === 'text')
    return textContent?.text || "I'm having trouble right now. Someone will call you back shortly!"
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error)
    const errStack = error instanceof Error ? error.stack : undefined
    const errObj = error as { status?: number; error?: unknown; [k: string]: unknown }
    const fullError = {
      message: errMsg,
      stack: errStack,
      status: errObj?.status,
      error: errObj?.error,
      ...Object.fromEntries(
        Object.entries(errObj).filter(([k]) => !['stack', 'message'].includes(k))
      ),
    }
    console.error('❌ [AI] Full error:', JSON.stringify(fullError, null, 2))
    console.error('❌ [AI] Raw error:', error)
    return `I'm having trouble right now. AI error: ${errMsg}`
  }
}

async function sendSMS(business: any, to: string, message: string) {
  const telnyxClient = new Telnyx({ apiKey: process.env.TELNYX_API_KEY! })
  await telnyxClient.messages.send({ from: business.telnyxPhoneNumber!, to, text: message })
}

async function sendSMSAndLog(
  business: any,
  conversationId: string,
  to: string,
  message: string,
  timing?: WebhookTiming & { now: () => string }
) {
  const telnyxClient = new Telnyx({ apiKey: process.env.TELNYX_API_KEY! })
  try {
    if (timing) {
      timing.telnyxSendAt = timing.now()
      console.log('⏱️ [SMS] Telnyx send API call started at:', timing.telnyxSendAt)
    }
    const sent = await telnyxClient.messages.send({ from: business.telnyxPhoneNumber!, to, text: message })
    const data = (sent as any)?.data
    const messageId = data?.id
    const status = data?.to?.[0]?.status ?? 'sent'

    if (timing) {
      timing.telnyxResponseAt = timing.now()
      timing.telnyxMessageId = messageId
      timing.telnyxStatus = status
      console.log('⏱️ [SMS] Telnyx API responded at:', timing.telnyxResponseAt, {
        success: true,
        telnyxMessageId: messageId,
        telnyxStatus: status,
        fullResponse: JSON.stringify(data),
      })
    } else {
      console.log('📤 Sent AI response, Telnyx message ID:', messageId, 'status:', status, '| Look up in Telnyx portal:', messageId)
    }

    // Defer database writes — SMS is sent; logging can happen after (don't block response)
    const payload = { conversationId, direction: 'outbound' as const, content: message, telnyxSid: messageId ?? null, telnyxStatus: status }
    void db.message
      .create({ data: payload })
      .then(() => recordMessageSent(business.id, to))
      .catch((err) => console.error('❌ Deferred DB log failed (SMS was sent):', err))
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    if (timing) {
      timing.telnyxResponseAt = timing.now()
      timing.telnyxError = errMsg
      console.log('⏱️ [SMS] Telnyx API error at:', timing.telnyxResponseAt, { error: errMsg })
    }
    console.error('❌ Error sending SMS:', error, '| Full error:', JSON.stringify(error, Object.getOwnPropertyNames(error)))
  }
}
