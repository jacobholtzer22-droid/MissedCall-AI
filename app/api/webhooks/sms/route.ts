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
import { getAvailableSlots } from '@/lib/google-calendar'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

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

      // Find or create conversation
      let conversation = await db.conversation.findFirst({
        where: {
          businessId: business.id,
          callerPhone: from,
          status: 'active',
          createdAt: { gte: new Date(Date.now() - CONVERSATION_TIMEOUT_HOURS * 60 * 60 * 1000) },
        },
        include: { messages: { orderBy: { createdAt: 'asc' }, take: 50 } },
      })

      if (!conversation) {
        conversation = await db.conversation.create({
          data: { businessId: business.id, callerPhone: from, status: 'active' },
          include: { messages: true },
        })
      }

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

      // Refresh with new message included and bookingFlowState
      conversation = await db.conversation.findUnique({
        where: { id: conversation.id },
        include: { messages: { orderBy: { createdAt: 'asc' } } },
      })
      if (!conversation) return new NextResponse('OK', { status: 200 })

      // ── SMS BOOKING FLOW ─────────────────────────────────────────
      const bookingHandled = await handleSmsBookingFlow(business, conversation, text, from)
      if (bookingHandled) return new NextResponse('OK', { status: 200 })

      // AI response
      const aiResponse = await generateAIResponse(business, conversation, text)

      // Appointment booking tag
      const apptMatch = aiResponse.match(
        /\[APPOINTMENT_BOOKED: name="([^"]+)", service="([^"]+)", datetime="([^"]+)"(?:, notes="([^"]*)")?\]/
      )
      if (apptMatch) {
        const [, name, service, datetime, notes] = apptMatch
        await db.appointment.create({
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
      }

      const cleanResponse = aiResponse
        .replace(/\[APPOINTMENT_BOOKED:.*?\]/g, '')
        .replace(/\[HUMAN_NEEDED\]/g, '')
        .trim()

      if (aiResponse.includes('[HUMAN_NEEDED]')) {
        await db.conversation.update({
          where: { id: conversation.id },
          data: { status: 'needs_review', intent: 'human_needed' },
        })
        console.log('🚨 Flagged for human review')
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

async function handleSmsBookingFlow(
  business: any,
  conversation: any,
  text: string,
  from: string
): Promise<boolean> {
  if (!business.calendarEnabled) return false

  const trimmed = text?.toLowerCase().trim() || ''
  const flowState = (conversation.bookingFlowState as {
    step?: string
    slots?: { start: string; end: string; display: string }[]
  } | null) ?? {}

  // Already in flow: user is selecting a slot
  if (flowState.step === 'awaiting_slot' && flowState.slots?.length) {
    const selectedSlot = parseSlotSelection(trimmed, flowState.slots)
    if (selectedSlot) {
      const baseUrl =
        process.env.NEXT_PUBLIC_APP_URL ??
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://alignandacquire.com')
      const res = await fetch(`${baseUrl}/api/bookings/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: business.id,
          customerName: conversation.callerName || 'Customer',
          customerPhone: from,
          serviceType: conversation.serviceRequested || 'Appointment',
          slotStart: selectedSlot.start,
          conversationId: conversation.id,
        }),
      })
      if (res.ok) {
        await db.conversation.update({
          where: { id: conversation.id },
          data: {
            status: 'appointment_booked',
            intent: 'book_appointment',
            bookingFlowState: Prisma.DbNull,
          },
        })
        console.log('📅 SMS booking confirmed (confirmation SMS sent by create API)')
        return true
      }
    }
    // Invalid selection - clear flow and let AI handle
    await db.conversation.update({
      where: { id: conversation.id },
      data: { bookingFlowState: Prisma.DbNull },
    })
  }

  // Detect booking intent (only if calendar/booking is enabled for this business)
  const hasBookingIntent = BOOKING_INTENT_WORDS.some(w => trimmed.includes(w))
  if (!hasBookingIntent || !business.calendarEnabled || !business.googleCalendarConnected) return false

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://alignandacquire.com')
  const bookingUrl = `${baseUrl}/book/${business.slug}`

  // Fetch available slots for next 14 days (use business TZ for correct dates)
  const tz = business.timezone ?? 'America/New_York'
  const now = new Date()
  const startStr = now.toLocaleDateString('en-CA', { timeZone: tz }) // YYYY-MM-DD
  const endDate = new Date(now)
  endDate.setDate(endDate.getDate() + 14)
  const endStr = endDate.toLocaleDateString('en-CA', { timeZone: tz })

  const slots = await getAvailableSlots(business.id, startStr, endStr)
  const displaySlots = slots.slice(0, 8) // Max 8 slots for SMS

  if (displaySlots.length === 0) {
    await sendSMSAndLog(
      business,
      conversation.id,
      from,
      `Hi! You can book online here: ${bookingUrl}\n\nWe don't have any availability in the next few days. Please check the link for other dates or call us to schedule!`
    )
    return true
  }

  const lines = displaySlots.map((s, i) => {
    const d = new Date(s.start)
    const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    return `${i + 1}. ${dateStr} - ${s.display}`
  })
  const msg = `Hi! You can book online here: ${bookingUrl}\n\nOr pick a time below:\n${lines.join('\n')}\n\nReply with a number to book!`
  await sendSMSAndLog(business, conversation.id, from, msg)

  await db.conversation.update({
    where: { id: conversation.id },
    data: {
      bookingFlowState: JSON.parse(JSON.stringify({
        step: 'awaiting_slot',
        slots: displaySlots,
        sentAt: new Date().toISOString(),
      })),
    },
  })
  return true
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

async function generateAIResponse(business: any, conversation: any, latestMessage: string): Promise<string> {
  const conversationHistory = conversation.messages.map((msg: any) => ({
    role: msg.direction === 'inbound' ? ('user' as const) : ('assistant' as const),
    content: msg.content,
  }))

  const systemPrompt = `You are a friendly SMS assistant for ${business.name}. You're helping someone who tried to call.

GOALS:
1. Be helpful, friendly, and brief (SMS should be under 160 chars when possible)
2. Understand what they need
3. If they want an appointment: get their name, service needed, and preferred date/time
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
- If someone seems upset or you can't help, add [HUMAN_NEEDED] at the end

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
