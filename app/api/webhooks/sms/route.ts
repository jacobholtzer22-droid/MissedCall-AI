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
import { addDays } from 'date-fns'
import { TZDate } from '@date-fns/tz'
import { getAvailableSlots, parseBusinessHours } from '@/lib/google-calendar'
import {
  notifyOwnerOnBookingCreated,
  notifyOwnerOnBookingRequestNoCalendar,
  notifyOwnerOnHumanNeeded,
} from '@/lib/notify-owner'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const

const MAX_MESSAGES_PER_CONVERSATION = 20
const BOOKING_INTENT_WORDS = ['book', 'appointment', 'schedule', 'booking', 'reserve']
const CONVERSATION_TIMEOUT_HOURS = 24
const SPAM_WINDOW_SECONDS = 30

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const eventType = body.data?.event_type as string
    const payload = body.data?.payload

    console.log('💬 SMS webhook event:', eventType)

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

      // STOP / unsubscribe
      const stopWords = ['stop', 'unsubscribe', 'cancel', 'quit']
      if (stopWords.includes(text?.toLowerCase().trim())) {
        console.log('🛑 User requested STOP')
        await sendSMS(business, from, "You've been unsubscribed. Reply START to resubscribe.")
        return new NextResponse('OK', { status: 200 })
      }

      // Find or create conversation (prefer existing, including closed ones — never create new after booking)
      const NO_AI_RESPONSE_STATUSES = ['appointment_booked', 'closed', 'human_needed', 'needs_review', 'completed'] as const
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

        // appointment_booked: send ONE final message then close; closed/human_needed: no response
        if (conversation.status === 'appointment_booked') {
          const finalMsg = `Your appointment is all set! If you need to reschedule or have questions, call us directly at ${business.telnyxPhoneNumber}.`
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

      // Message limit guard
      if (conversation.messages.length >= MAX_MESSAGES_PER_CONVERSATION) {
        console.log('⚠️ Conversation hit message limit')
        await db.conversation.update({
          where: { id: conversation.id },
          data: { status: 'completed', summary: 'Conversation ended - message limit reached' },
        })
        await sendSMS(
          business,
          from,
          `Thanks for chatting! For further assistance, please call us directly at ${business.telnyxPhoneNumber}.`
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

      // ── SMS BOOKING FLOW ─────────────────────────────────────────
      const bookingHandled = await handleSmsBookingFlow(business, conversation, text, from)
      if (bookingHandled) return new NextResponse('OK', { status: 200 })

      // AI response (pass bookingFlowState so AI can guide back when customer goes off-topic)
      const aiResponse = await generateAIResponse(business, conversation, text, conversation.bookingFlowState)

      const cleanResponse = aiResponse
        .replace(/\[APPOINTMENT_BOOKED:.*?\]/g, '')
        .replace(/\[HUMAN_NEEDED(?:: reason="[^"]*")?\]/g, '')
        .trim()

      const conversationTranscript = [
        ...conversation.messages.map((m) => ({
          direction: m.direction,
          content: m.content,
          createdAt: m.createdAt as Date,
        })),
        { direction: 'outbound' as const, content: cleanResponse, createdAt: new Date() },
      ]

      // Appointment booking tag — skip if conversation already has a booking
      const apptMatch = aiResponse.match(
        /\[APPOINTMENT_BOOKED: name="([^"]+)", service="([^"]+)", datetime="([^"]+)"(?:, notes="([^"]*)")?\]/
      )
      if (apptMatch && conversation.status !== 'appointment_booked' && !conversation.appointment) {
        const [, name, service, datetime, notes] = apptMatch
        const appointment = await db.appointment.create({
          data: {
            businessId: business.id,
            conversationId: conversation.id,
            customerName: name,
            customerPhone: from,
            serviceType: service,
            scheduledAt: new Date(datetime),
            notes: notes || null,
            status: 'confirmed',
            source: 'sms',
          },
        })
        await db.conversation.update({
          where: { id: conversation.id },
          data: { status: 'appointment_booked', callerName: name, intent: 'book_appointment', serviceRequested: service },
        })
        console.log('📅 Appointment booked:', { name, service, datetime })

        if (business.calendarEnabled) {
          try {
            await notifyOwnerOnBookingCreated(business, {
              id: appointment.id,
              customerName: name,
              customerPhone: from,
              customerEmail: null,
              serviceType: service,
              scheduledAt: new Date(datetime),
              notes: notes || null,
              source: 'sms',
            })
          } catch (err) {
            console.error('❌ Failed to notify owner of booking:', err)
          }
        } else {
          try {
            await notifyOwnerOnBookingRequestNoCalendar(business, {
              customerName: name,
              customerPhone: from,
              service,
              datetime,
              notes: notes || null,
              conversationTranscript,
            })
          } catch (err) {
            console.error('❌ Failed to notify owner of booking request (no calendar):', err)
          }
        }
      }

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

      await sendSMSAndLog(business, conversation.id, from, cleanResponse)
      return new NextResponse('OK', { status: 200 })
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
  step: 'greeting' | 'awaiting_name' | 'awaiting_service' | 'awaiting_notes' | 'awaiting_preference' | 'awaiting_selection' | 'confirmed'
  customerName?: string
  serviceType?: string
  notes?: string
  timePreference?: string  // Raw text: "tomorrow afternoon", "next week", etc.
  offeredSlots?: { start: string; end: string; display: string }[]
  services?: { value: string; label: string }[]
  sentAt?: string
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

function parseNameFromMessage(text: string): string {
  const m = text.match(/(?:my name is|i'm|i am|this is|name is|it's)\s+(.+)/i)
  return m ? m[1].trim() : text.trim()
}

function parseServiceSelection(text: string, services: { value: string; label: string }[]): string | null {
  const num = parseInt(text.replace(/\D/g, ''), 10)
  if (num >= 1 && num <= services.length) {
    return services[num - 1].label
  }
  const lower = text.toLowerCase().trim()
  const found = services.find(s => s.label.toLowerCase().includes(lower) || s.value.toLowerCase().includes(lower))
  return found ? found.label : null
}

function parseNotesFromMessage(text: string): string {
  const t = text.trim().toLowerCase()
  if (!t || ['no', 'nope', 'nothing', 'skip', 'n/a', 'na', 'none', "don't have any", "i don't"].some(w => t === w || t.startsWith(w + ' '))) {
    return ''
  }
  return text.trim()
}

async function handleSmsBookingFlow(
  business: any,
  conversation: any,
  text: string,
  from: string
): Promise<boolean> {
  if (!business.calendarEnabled) return false
  // Do not restart or continue flow if already confirmed or has booking
  if (conversation.appointment || conversation.status === 'appointment_booked') return true
  const rawFlowState = (conversation.bookingFlowState as Record<string, unknown> | null) ?? {}
  if (rawFlowState.step === 'confirmed') return true

  const rawText = text?.trim() || ''
  const trimmed = rawText.toLowerCase()
  // Support legacy step names
  const legacyStep = rawFlowState.step as string
  const mappedStep: BookingFlowState['step'] =
    legacyStep === 'awaiting_slot' || legacyStep === 'awaiting_time'
      ? 'awaiting_selection'
      : (legacyStep as BookingFlowState['step']) || 'greeting'

  const flowState: BookingFlowState = {
    ...rawFlowState,
    step: mappedStep,
    customerName: rawFlowState.customerName ?? conversation.callerName,
    serviceType: rawFlowState.serviceType ?? conversation.serviceRequested,
  } as BookingFlowState
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://alignandacquire.com')
  const tz = business.timezone ?? 'America/New_York'

  // Resolve slots from state (support legacy 'slots' or new 'offeredSlots')
  const offeredSlots = (flowState.offeredSlots ?? (rawFlowState.slots as SlotLike[] | undefined) ?? []) as SlotLike[]

  // ── Step: awaiting_selection (user picking from offered slots) ──
  const inSelectionStep = flowState.step === 'awaiting_selection'
  if (inSelectionStep && offeredSlots.length > 0) {
    const selectedSlot = parseSlotSelection(trimmed, offeredSlots)
    if (selectedSlot) {
      // Re-check: conversation might have booking from another request
      const convCheck = await db.conversation.findUnique({
        where: { id: conversation.id },
        include: { appointment: true },
      })
      if (convCheck?.appointment) return true
      const res = await fetch(`${baseUrl}/api/bookings/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: business.id,
          customerName: flowState.customerName || 'Customer',
          customerPhone: from,
          serviceType: flowState.serviceType || 'Appointment',
          notes: flowState.notes ?? undefined,
          slotStart: selectedSlot.start,
          conversationId: conversation.id,
        }),
      })
      if (res.ok) {
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
        console.log('📅 SMS booking confirmed (confirmation SMS sent by create API)')
        return true
      }
    }
    // "None of those work" / "something else" → ask for new preference
    const wantsDifferentTimes = /\b(no|none|nope|those don't|doesn't work|something else|different|other)\b/.test(trimmed)
    if (wantsDifferentTimes) {
      const msg = `No problem! What day and time would be better for you?`
      await sendSMSAndLog(business, conversation.id, from, msg)
      await db.conversation.update({
        where: { id: conversation.id },
        data: {
          bookingFlowState: JSON.parse(JSON.stringify({
            step: 'awaiting_preference',
            customerName: flowState.customerName,
            serviceType: flowState.serviceType,
            notes: flowState.notes,
            sentAt: new Date().toISOString(),
          })),
        },
      })
      return true
    }

    // User gave a new time preference (e.g. "Thursday afternoon", "next week")
    const timePref = parseTimePreference(trimmed, tz)
    if (timePref) {
      const { startStr, endStr, timeOfDay } = timePref
      let slots = await getAvailableSlots(business.id, startStr, endStr)
      slots = filterPastSlots(slots, tz)
      slots = filterSlotsByTimeOfDay(slots, timeOfDay, tz)
      const displaySlots = pickSlotsForPreference(slots, tz, business.businessHours, trimmed)
      if (displaySlots.length > 0) {
        const msg = formatSlotsMessage(displaySlots, tz)
        await sendSMSAndLog(business, conversation.id, from, msg)
        await db.conversation.update({
          where: { id: conversation.id },
          data: {
            bookingFlowState: JSON.parse(JSON.stringify({
              step: 'awaiting_selection',
              customerName: flowState.customerName,
              serviceType: flowState.serviceType,
              notes: flowState.notes,
              timePreference: trimmed,
              offeredSlots: displaySlots,
              sentAt: new Date().toISOString(),
            })),
          },
        })
        return true
      }
      // Requested time range has no slots — offer alternatives
      const fallback = getNext3BusinessDays(tz, business.businessHours)
      let fallbackSlots = await getAvailableSlots(business.id, fallback.startStr, fallback.endStr)
      fallbackSlots = filterPastSlots(fallbackSlots, tz)
      const altSlots = pickSlotsAcrossDays(fallbackSlots, tz, business.businessHours, 3)
      if (altSlots.length > 0) {
        const msg = `That slot is taken, but I've got:\n\n${formatSlotsMessage(altSlots, tz)}`
        await sendSMSAndLog(business, conversation.id, from, msg)
        await db.conversation.update({
          where: { id: conversation.id },
          data: {
            bookingFlowState: JSON.parse(JSON.stringify({
              step: 'awaiting_selection',
              customerName: flowState.customerName,
              serviceType: flowState.serviceType,
              notes: flowState.notes,
              offeredSlots: altSlots,
              sentAt: new Date().toISOString(),
            })),
          },
        })
        return true
      }
      await sendSMSAndLog(
        business,
        conversation.id,
        from,
        `We don't have any availability in the next few days. Text us back when you'd like to try again or give us a call!`
      )
      await db.conversation.update({ where: { id: conversation.id }, data: { bookingFlowState: Prisma.DbNull } })
      return true
    }
    // Invalid or unclear — let AI handle
    return false
  }

  // ── Step: awaiting_preference (asked "when works best?", waiting for answer) ──
  if (flowState.step === 'awaiting_preference') {
    if (looksLikeQuestion(rawText)) return false
    const timePref = parseTimePreference(trimmed, tz)
    if (timePref) {
      const { startStr, endStr, timeOfDay } = timePref
      let slots = await getAvailableSlots(business.id, startStr, endStr)
      slots = filterPastSlots(slots, tz)
      slots = filterSlotsByTimeOfDay(slots, timeOfDay, tz)
      const displaySlots = pickSlotsForPreference(slots, tz, business.businessHours, trimmed)
      if (displaySlots.length > 0) {
        const msg = formatSlotsMessage(displaySlots, tz)
        await sendSMSAndLog(business, conversation.id, from, msg)
        await db.conversation.update({
          where: { id: conversation.id },
          data: {
            bookingFlowState: JSON.parse(JSON.stringify({
              step: 'awaiting_selection',
              customerName: flowState.customerName,
              serviceType: flowState.serviceType,
              notes: flowState.notes,
              timePreference: trimmed,
              offeredSlots: displaySlots,
              sentAt: new Date().toISOString(),
            })),
          },
        })
        return true
      }
      // No slots in that range — offer closest alternatives
      const fallback = getNext3BusinessDays(tz, business.businessHours)
      let fallbackSlots = await getAvailableSlots(business.id, fallback.startStr, fallback.endStr)
      fallbackSlots = filterPastSlots(fallbackSlots, tz)
      const altSlots = pickSlotsAcrossDays(fallbackSlots, tz, business.businessHours, 3)
      if (altSlots.length > 0) {
        const msg = `That slot is taken, but I've got:\n\n${formatSlotsMessage(altSlots, tz)}`
        await sendSMSAndLog(business, conversation.id, from, msg)
        await db.conversation.update({
          where: { id: conversation.id },
          data: {
            bookingFlowState: JSON.parse(JSON.stringify({
              step: 'awaiting_selection',
              customerName: flowState.customerName,
              serviceType: flowState.serviceType,
              notes: flowState.notes,
              offeredSlots: altSlots,
              sentAt: new Date().toISOString(),
            })),
          },
        })
        return true
      }
      // No availability at all
      await sendSMSAndLog(
        business,
        conversation.id,
        from,
        `We don't have any availability in the next few days. Text us back when you'd like to try again or give us a call!`
      )
      await db.conversation.update({ where: { id: conversation.id }, data: { bookingFlowState: Prisma.DbNull } })
      return true
    }
    // Couldn't parse — ask for clarification
    const msg = `No problem! What day and time would be better for you? (e.g. "tomorrow afternoon", "next week", "anytime")`
    await sendSMSAndLog(business, conversation.id, from, msg)
    return true
  }

  // ── Step: awaiting_name ──
  if (flowState.step === 'awaiting_name') {
    if (looksLikeQuestion(rawText)) return false
    const name = parseNameFromMessage(rawText)
    if (!name || name.length > 100) return false
    const services = getServicesList(business)
    const serviceLines =
      services.length > 1
        ? `\n\n${services.map((s, i) => `${i + 1}. ${s.label}`).join('\n')}\n\nReply with a number.`
        : ''
    const msg = `Nice to meet you ${name}! What can we help you with?${serviceLines}`.trim()
    await sendSMSAndLog(business, conversation.id, from, msg)
    await db.conversation.update({
      where: { id: conversation.id },
      data: {
        bookingFlowState: JSON.parse(JSON.stringify({
          step: 'awaiting_service',
          customerName: name,
          services,
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
    const msg = `Got it! Anything specific we should know to prepare for your ${serviceType}?`
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
    const msg = `When works best for you? Do you have a day or time of day in mind?`
    await sendSMSAndLog(business, conversation.id, from, msg)
    await db.conversation.update({
      where: { id: conversation.id },
      data: {
        bookingFlowState: JSON.parse(JSON.stringify({
          step: 'awaiting_preference',
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

  // ── Detect booking intent (start flow) ──
  const hasBookingIntent = BOOKING_INTENT_WORDS.some(w => trimmed.includes(w))
  if (!hasBookingIntent || !business.calendarEnabled || !business.googleCalendarConnected) return false

  const msg = `Hey! I'd love to help you get something scheduled. What's your name?`
  await sendSMSAndLog(business, conversation.id, from, msg)
  await db.conversation.update({
    where: { id: conversation.id },
    data: {
      status: 'booking_in_progress',
      bookingFlowState: JSON.parse(JSON.stringify({
        step: 'awaiting_name',
        sentAt: new Date().toISOString(),
      })),
    },
  })
  return true
}

/** Get next N business days starting from TODAY in business timezone (skip days when business is closed). */
function getNext3BusinessDays(tz: string, businessHoursRaw: unknown): { startStr: string; endStr: string } {
  const hours = parseBusinessHours(businessHoursRaw)
  const nowInTz = new TZDate(new Date(), tz)
  const todayStr = nowInTz.toISOString().slice(0, 10)
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

/** Pick up to 3 slots per day (morning, midday, afternoon) across multiple days. */
function pickSlotsAcrossDays(
  slots: SlotLike[],
  tz: string,
  _businessHoursRaw: unknown,
  targetDays: number
): SlotLike[] {
  const byDay = new Map<string, SlotLike[]>()
  for (const s of slots) {
    const d = new Date(s.start)
    const dateStr = d.toLocaleDateString('en-CA', { timeZone: tz })
    if (!byDay.has(dateStr)) byDay.set(dateStr, [])
    byDay.get(dateStr)!.push(s)
  }
  const sortedDays = Array.from(byDay.keys()).sort()
  const result: SlotLike[] = []
  let globalIndex = 1
  for (let i = 0; i < Math.min(targetDays, sortedDays.length); i++) {
    const daySlots = byDay.get(sortedDays[i])!.sort(
      (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
    )
    const picked = pickBest3ForDay(daySlots)
    for (const slot of picked) {
      result.push(slot)
      globalIndex++
    }
  }
  return result
}

/** Pick up to 3 slots for one day: morning, midday, afternoon. */
function pickBest3ForDay(slots: SlotLike[]): SlotLike[] {
  if (slots.length <= 3) return slots
  const sorted = [...slots].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const midIdx = Math.floor(sorted.length / 2)
  const mid = sorted[midIdx]
  return [first, mid, last]
}

/** Filter out slots that are in the past (use business timezone). */
function filterPastSlots(slots: SlotLike[], tz: string): SlotLike[] {
  const nowInTz = new TZDate(new Date(), tz)
  const nowMs = nowInTz.getTime()
  return slots.filter(s => new Date(s.start).getTime() >= nowMs)
}

/** Filter slots by time of day: morning (<12), afternoon (12-17), evening (17+). */
function filterSlotsByTimeOfDay(
  slots: SlotLike[],
  timeOfDay: 'morning' | 'afternoon' | 'evening' | undefined,
  tz: string
): SlotLike[] {
  if (!timeOfDay) return slots
  return slots.filter(s => {
    const d = new Date(s.start)
    const hour = parseInt(d.toLocaleTimeString('en-US', { hour: 'numeric', hour12: false, timeZone: tz }), 10)
    if (timeOfDay === 'morning') return hour < 12
    if (timeOfDay === 'afternoon') return hour >= 12 && hour < 17
    if (timeOfDay === 'evening') return hour >= 17
    return true
  })
}

/** Pick slots based on preference: tomorrow→2-3, next week→3-4, anytime→3 across days. */
function pickSlotsForPreference(
  slots: SlotLike[],
  tz: string,
  businessHoursRaw: unknown,
  preferenceText: string
): SlotLike[] {
  const t = preferenceText.toLowerCase()
  if (/\btomorrow\b/.test(t)) {
    return pickSlotsAcrossDays(slots, tz, businessHoursRaw, 1).slice(0, 3)
  }
  if (/\bnext\s+week\b/.test(t)) {
    return pickSlotsAcrossDays(slots, tz, businessHoursRaw, 7).slice(0, 4)
  }
  if (/\b(anytime|whenever|asap|as\s+soon\s+as\s+possible)\b/.test(t)) {
    return pickSlotsAcrossDays(slots, tz, businessHoursRaw, 3).slice(0, 3)
  }
  return pickSlotsAcrossDays(slots, tz, businessHoursRaw, 3).slice(0, 4)
}

function formatSlotsMessage(slots: SlotLike[], tz: string): string {
  const lines: string[] = ["Here's what I've got:", '']
  slots.forEach((s, i) => {
    const d = new Date(s.start)
    const dayLabel = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: tz })
    lines.push(`${i + 1}. ${dayLabel} at ${s.display}`)
  })
  lines.push('')
  lines.push("Reply with a number or tell me something else that works!")
  return lines.join('\n').trim()
}

/** Parse natural language timing into date range + optional time-of-day filter. */
function parseTimePreference(
  text: string,
  tz: string
): { startStr: string; endStr: string; timeOfDay?: 'morning' | 'afternoon' | 'evening' } | null {
  const t = text.toLowerCase().trim()
  const dayNames: Record<string, number> = {
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
    sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
  }
  const nowInTz = new TZDate(new Date(), tz)
  const todayStr = nowInTz.toISOString().slice(0, 10)
  const [y, m, d] = todayStr.split('-').map(Number)
  const todayStart = new TZDate(y, m - 1, d, 0, 0, 0, 0, tz)
  const todayDow = nowInTz.getDay()

  // anytime, whenever, ASAP, as soon as possible → next 3 business days
  if (/\b(anytime|whenever|asap|as\s+soon\s+as\s+possible|soonest|earliest)\b/.test(t)) {
    const { startStr, endStr } = getNext3BusinessDays(tz, null)
    return { startStr, endStr }
  }

  let startDate: Date | null = null
  let timeOfDay: 'morning' | 'afternoon' | 'evening' | undefined

  // "this Friday", "next Monday" etc. — day names mean NEXT upcoming occurrence (including today)
  if (/\bthis\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/i.test(t)) {
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
  } else if (/\bnext\s+week\b/.test(t)) {
    startDate = addDays(todayStart, 7)
  } else if (/\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/i.test(t)) {
    const match = t.match(/next\s+(\w+)/i)
    if (match) {
      const name = match[1].toLowerCase()
      const dow = dayNames[name] ?? dayNames[name.slice(0, 3)]
      if (dow !== undefined) {
        let daysAhead = dow - todayDow
        if (daysAhead <= 0) daysAhead += 7
        daysAhead += 7 // "next" Monday = Monday of next week
        startDate = addDays(todayStart, daysAhead)
      }
    }
  } else if (/\btomorrow\b/.test(t)) {
    startDate = addDays(todayStart, 1)
  } else if (/\btoday\b/.test(t)) {
    startDate = todayStart
  } else {
    // Standalone day name (e.g. "Monday", "Thursday") = next upcoming occurrence, including today
    for (const [name, dow] of Object.entries(dayNames)) {
      if (new RegExp(`\\b${name}\\b`).test(t)) {
        let daysAhead = dow - todayDow
        if (daysAhead < 0) daysAhead += 7
        startDate = addDays(todayStart, daysAhead)
        break
      }
    }
  }

  // Time of day: morning, afternoon, evening, after X, before X, around X
  if (/\b(morning|am)\b/.test(t) || /\bbefore\s+noon\b/.test(t)) {
    timeOfDay = 'morning'
  } else if (/\b(afternoon|pm)\b/.test(t) || /\bafter\s+(noon|12)\b/.test(t)) {
    timeOfDay = 'afternoon'
  } else if (/\bevening\b/.test(t) || /\bafter\s+[56]\s*(pm)?\b/.test(t)) {
    timeOfDay = 'evening'
  } else if (/\bbefore\s+noon\b|\baround\s+\d|^\d\s*(am|pm)\b/i.test(t)) {
    timeOfDay = 'morning'
  } else if (/\bafter\s+\d{1,2}\s*(pm)?|\baround\s+\d{1,2}\b/i.test(t)) {
    timeOfDay = 'afternoon'
  }

  // If no specific day, "ASAP" etc. already handled; check for standalone time-of-day
  if (!startDate && (timeOfDay || /\b(morning|afternoon|evening)\b/.test(t))) {
    const { startStr, endStr } = getNext3BusinessDays(tz, null)
    return { startStr, endStr, timeOfDay: timeOfDay ?? 'afternoon' }
  }

  if (!startDate) return null

  const startStr = startDate.toLocaleDateString('en-CA', { timeZone: tz })
  const endDate = new Date(startDate)
  if (/\bnext\s+week\b/.test(t)) {
    endDate.setDate(endDate.getDate() + 6)
  } else if (timeOfDay) {
    endDate.setDate(endDate.getDate() + 1)
  } else {
    endDate.setDate(endDate.getDate() + 2)
  }
  const endStr = endDate.toLocaleDateString('en-CA', { timeZone: tz })
  return { startStr, endStr, timeOfDay }
}

function parseSlotSelection(text: string, slots: { start: string; display: string }[]): { start: string } | null {
  const num = parseInt(text.replace(/\D/g, ''), 10)
  if (num >= 1 && num <= slots.length) {
    return { start: slots[num - 1].start }
  }
  // Try matching time like "9:00" or "9am"
  const timeMatch = text.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i)
  if (timeMatch) {
    let hour = parseInt(timeMatch[1], 10)
    const min = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0
    const ampm = (timeMatch[3] || '').toLowerCase()
    if (ampm === 'pm' && hour < 12) hour += 12
    if (ampm === 'am' && hour === 12) hour = 0
    const displayTarget = `${hour > 12 ? hour - 12 : hour}:${min.toString().padStart(2, '0')} ${ampm || (hour < 12 ? 'AM' : 'PM')}`
    const found = slots.find(s => s.display.toLowerCase().replace(/\s/g, '') === displayTarget.toLowerCase().replace(/\s/g, ''))
    if (found) return { start: found.start }
  }
  return null
}

// ── Helpers ─────────────────────────────────────────────────────────

async function generateAIResponse(
  business: any,
  conversation: any,
  latestMessage: string,
  bookingFlowState?: unknown
): Promise<string> {
  const conversationHistory = conversation.messages.map((msg: any) => ({
    role: msg.direction === 'inbound' ? ('user' as const) : ('assistant' as const),
    content: msg.content,
  }))

  const flowState = bookingFlowState as BookingFlowState | null | undefined
  const inBookingFlow = flowState?.step
  const flowGuidance = inBookingFlow
    ? `
BOOKING FLOW CONTEXT: The customer is in a conversational booking flow via SMS. Current step: ${flowState.step}.
- If they asked a question mid-flow (e.g. "how much does it cost?"): answer briefly, then guide them back.
- awaiting_name: "What's your name?"
- awaiting_service: remind them to pick a service (by number or name)
- awaiting_notes: "Anything specific we should know? (Reply 'no' to skip)"
- awaiting_preference: "When works best for you? Do you have a day or time in mind?" (e.g. tomorrow, next week, anytime)
- awaiting_selection: remind them to reply with a number to pick a time, or describe a different time
Keep responses natural and conversational. No booking links — everything happens in the text conversation.`
    : ''

  const systemPrompt = `You are a friendly SMS assistant for ${business.name}. You're helping someone who tried to call.

GOALS:
1. Be helpful, friendly, and brief (SMS should be under 160 chars when possible)
2. Understand what they need
3. If they want an appointment: the SMS booking flow will collect name, service, notes, and time - you may see customers mid-flow
4. Answer questions about the business
5. If you can't help or they're upset, flag for human follow-up

BUSINESS INFO:
- Name: ${business.name}
- Services: ${JSON.stringify(business.servicesOffered) || 'General services'}
${business.aiContext ? `- About: ${business.aiContext}` : ''}
${business.aiInstructions ? `- Instructions: ${business.aiInstructions}` : ''}

RULES:
- Keep responses SHORT (1-2 sentences ideal)
- Be warm and natural, not robotic
- Don't make up information
- If someone seems upset or you can't help, add [HUMAN_NEEDED] at the end (optional: [HUMAN_NEEDED: reason="brief reason"] to help the owner)
${flowGuidance}

WHEN BOOKING IS CONFIRMED (you have name + service + date/time):
Add this EXACT tag at the end of your message:
[APPOINTMENT_BOOKED: name="John Smith", service="Teeth Cleaning", datetime="2024-01-15 14:00", notes="First time patient"]`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 256,
      system: systemPrompt,
      messages: conversationHistory,
    })
    const textContent = response.content.find(block => block.type === 'text')
    return textContent?.text || "I'm having trouble right now. Someone will call you back shortly!"
  } catch (error) {
    console.error('❌ Error generating AI response:', error)
    return "I'm having trouble right now. Someone from our team will get back to you shortly!"
  }
}

async function sendSMS(business: any, to: string, message: string) {
  const telnyxClient = new Telnyx({ apiKey: process.env.TELNYX_API_KEY! })
  await telnyxClient.messages.send({ from: business.telnyxPhoneNumber!, to, text: message })
}

async function sendSMSAndLog(business: any, conversationId: string, to: string, message: string) {
  const telnyxClient = new Telnyx({ apiKey: process.env.TELNYX_API_KEY! })
  try {
    const sent = await telnyxClient.messages.send({ from: business.telnyxPhoneNumber!, to, text: message })
    await db.message.create({
      data: {
        conversationId,
        direction: 'outbound',
        content: message,
        telnyxSid: (sent as any).data?.id ?? null,
        telnyxStatus: (sent as any).data?.to?.[0]?.status ?? 'sent',
      },
    })
    console.log('📤 Sent AI response:', (sent as any).data?.id)
  } catch (error) {
    console.error('❌ Error sending SMS:', error)
  }
}
