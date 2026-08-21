import { NextRequest, NextResponse } from 'next/server'
import { TZDate } from '@date-fns/tz'
import { addMinutes } from 'date-fns'
import { db } from '@/lib/db'
import Telnyx from 'telnyx'
import { createMarketingCalendarEvent, getBusyTimes } from '@/lib/google-calendar'
import { normalizeToE164 } from '@/lib/phone-utils'
import {
  getMarketingBusiness,
  notifyOwnerOfMarketingEvent,
  findPartialLeadByPhone,
} from '@/lib/marketing-funnel'
import {
  sanitizeAttribution,
  formatAttributionBlock,
  formatAttributionLine,
  type Attribution,
} from '@/lib/attribution'

const TIMEZONE = 'America/New_York'
const START_HOUR = 8 // 8:00 AM ET
const END_HOUR = 20 // 8:00 PM ET — extended so West Coast visitors see real same-day options
const LAST_SLOT_HOUR = 19 // last slot starts 7:30 PM and ends at 7:45 PM
const SLOT_MINUTES = 15 // 15-minute live demo
const BUFFER_MINUTES = 15
const SLOT_STEP_MINUTES = SLOT_MINUTES + BUFFER_MINUTES // 30 — slot starts on the :00 and :30
const MIN_NOTICE_HOURS = 2
const MAX_DAYS_AHEAD = 14

type BookingPayload = {
  name: string
  phone: string
  email: string
  businessName: string
  // Pre-qualification answers from /book (marketing flow only)
  tradeType?: string // Q1: what kind of business
  missedCalls?: string // Q2: how many calls missed per week
  whoAnswers?: string // Q3: who answers the phone now
  extraNeeds?: string[] // contact step: optional "what are you interested in"
  interests?: string[] // legacy field — superseded by extraNeeds
  notes?: string
  smsConsent: boolean
  slotStart: string // ISO string in ET
  partialLeadId?: string // WebsiteLead row created at the contact step
  attribution?: unknown // utm_* + fbclid captured on landing
}

// Kept in sync with EXTRA_NEEDS_OPTIONS / JUST_AI_OPTION in app/book/page.tsx
const JUST_AI_OPTION = 'Just the Missed-Call AI system'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Build the appointment serviceType / calendar event title from the Step 4
 * "anything else" answers (marketing booking only).
 *  - only "Just the Missed-Call AI system" (or nothing extra) → "Missed Call AI"
 *  - additional services selected → "Consultation — interested in: Missed Call AI + [...]"
 *  - field absent / malformed → "General Consultation"
 */
function deriveServiceType(extraNeeds: unknown): string {
  if (!Array.isArray(extraNeeds)) return 'General Consultation'
  const additional = extraNeeds
    .filter((s): s is string => typeof s === 'string')
    .map((s) => s.trim())
    .filter((s) => s && s !== JUST_AI_OPTION)
  if (additional.length === 0) return 'Missed Call AI'
  return `Consultation — interested in: Missed Call AI + ${additional.join(', ')}`
}

function getNowInTz() {
  return new TZDate(new Date(), TIMEZONE)
}

function toTZDate(date: Date | string) {
  const d = typeof date === 'string' ? new Date(date) : date
  return new TZDate(d, TIMEZONE)
}

function isWithinBookingWindow(slotStart: Date) {
  const now = getNowInTz()
  const minStart = new Date(now.getTime() + MIN_NOTICE_HOURS * 60 * 60 * 1000)
  const maxStart = new Date(now)
  maxStart.setDate(maxStart.getDate() + MAX_DAYS_AHEAD)
  maxStart.setHours(23, 59, 59, 999)
  const ms = slotStart.getTime()
  return ms >= minStart.getTime() && ms <= maxStart.getTime()
}

function isWithinHours(slotStart: Date, slotEnd: Date) {
  const startTz = toTZDate(slotStart)
  const endTz = toTZDate(slotEnd)
  const startHour = startTz.getHours()
  const endHour = endTz.getHours()
  return startHour >= START_HOUR && endHour <= END_HOUR
}

// Slot starts land on the :00 and :30 in ET, 8:00 AM through 7:30 PM.
function isValidSlotStart(d: Date) {
  const tz = toTZDate(d)
  const mins = tz.getMinutes()
  const hour = tz.getHours()
  if (hour < START_HOUR || hour > LAST_SLOT_HOUR) return false
  return mins === 0 || mins === 30
}

function formatDisplay(slotStart: Date) {
  const tz = TIMEZONE
  return slotStart.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: tz,
  })
}

function sameDay(a: Date, b: Date) {
  const ta = toTZDate(a)
  const tb = toTZDate(b)
  return (
    ta.getFullYear() === tb.getFullYear() &&
    ta.getMonth() === tb.getMonth() &&
    ta.getDate() === tb.getDate()
  )
}

async function getExistingAppointmentsForRange(businessId: string, start: Date, end: Date) {
  return db.appointment.findMany({
    where: {
      businessId,
      status: 'confirmed',
      scheduledAt: {
        gte: start,
        lte: end,
      },
    },
    select: {
      scheduledAt: true,
      duration: true,
    },
  })
}

function overlapsWithExisting(
  slotStart: Date,
  slotEnd: Date,
  existing: { scheduledAt: Date; duration: number }[]
) {
  const slotStartMs = slotStart.getTime()
  const slotEndMsWithBuffer = addMinutes(slotEnd, BUFFER_MINUTES).getTime()

  for (const appt of existing) {
    const apptStart = new Date(appt.scheduledAt)
    const apptEnd = addMinutes(apptStart, appt.duration || SLOT_MINUTES)
    const apptEndWithBuffer = addMinutes(apptEnd, BUFFER_MINUTES).getTime()
    const apptStartMs = apptStart.getTime()
    if (slotStartMs < apptEndWithBuffer && slotEndMsWithBuffer > apptStartMs) {
      return true
    }
  }
  return false
}

/**
 * Same buffer rule as booked appointments, applied to Google Calendar busy
 * windows so anything on the calendar directly also blocks a funnel slot.
 */
function overlapsWithBusy(
  slotStart: Date,
  slotEnd: Date,
  busy: { start: string; end: string }[]
) {
  const slotStartMs = slotStart.getTime()
  const slotEndMsWithBuffer = addMinutes(slotEnd, BUFFER_MINUTES).getTime()

  for (const window of busy) {
    const busyStart = new Date(window.start)
    const busyEnd = new Date(window.end)
    if (isNaN(busyStart.getTime()) || isNaN(busyEnd.getTime())) continue
    const busyEndWithBuffer = addMinutes(busyEnd, BUFFER_MINUTES).getTime()
    if (slotStartMs < busyEndWithBuffer && slotEndMsWithBuffer > busyStart.getTime()) {
      return true
    }
  }
  return false
}

/**
 * Read Google Calendar busy windows for the range. Fails CLOSED, matching the
 * tenant booking flow: if the calendar cannot be read we refuse to offer slots
 * rather than treating an unreadable calendar as a free one.
 * Returns null when the calendar is unreadable.
 */
async function readBusyOrNull(
  business: { id: string; googleCalendarConnected: boolean },
  start: Date,
  end: Date
): Promise<{ start: string; end: string }[] | null> {
  if (!business.googleCalendarConnected) return []
  try {
    return await getBusyTimes(business.id, start, end)
  } catch (err) {
    console.error(
      '[marketing-bookings] Google free/busy read failed, failing closed:',
      err instanceof Error ? err.message : String(err)
    )
    return null
  }
}

export async function GET(request: NextRequest) {
  try {
    const now = getNowInTz()
    const startOfToday = new TZDate(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      0,
      0,
      0,
      0,
      TIMEZONE
    )
    const endOfRange = new TZDate(
      startOfToday.getFullYear(),
      startOfToday.getMonth(),
      startOfToday.getDate() + MAX_DAYS_AHEAD,
      23,
      59,
      59,
      999,
      TIMEZONE
    )

    const business = await getMarketingBusiness()
    if (!business) {
      console.error('Marketing availability: no business configured.')
      return NextResponse.json({ days: [], calendarUnavailable: true })
    }

    const existing = await getExistingAppointmentsForRange(business.id, startOfToday, endOfRange)

    const busy = await readBusyOrNull(business, startOfToday, endOfRange)
    if (busy === null) {
      // Fail closed. Better to show no times than to double-book Jacob.
      return NextResponse.json({ days: [], calendarUnavailable: true })
    }

    const days: {
      date: string
      isToday: boolean
      label: string
      timezoneLabel: string
      slots: { iso: string; display: string }[]
    }[] = []

    for (let i = 0; i <= MAX_DAYS_AHEAD; i++) {
      const day = new TZDate(
        startOfToday.getFullYear(),
        startOfToday.getMonth(),
        startOfToday.getDate() + i,
        0,
        0,
        0,
        0,
        TIMEZONE
      )

      const label = day.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        timeZone: TIMEZONE,
      })
      const dateStr = day.toISOString().slice(0, 10)

      const slots: { iso: string; display: string }[] = []

      // Slots every 30 min (15 min demo + 15 min buffer): 8:00, 8:30, 9:00 ... 7:30 PM
      const firstSlot = new TZDate(
        day.getFullYear(),
        day.getMonth(),
        day.getDate(),
        START_HOUR,
        0,
        0,
        0,
        TIMEZONE
      )
      const lastSlotStart = new TZDate(
        day.getFullYear(),
        day.getMonth(),
        day.getDate(),
        LAST_SLOT_HOUR, // 7 PM
        30, // 7:30 PM — last slot starts here, ends at 7:45
        0,
        0,
        TIMEZONE
      )

      let cursor = new Date(firstSlot.getTime())

      while (cursor.getTime() <= lastSlotStart.getTime()) {
        const slotStart = new Date(cursor.getTime())
        const slotEnd = addMinutes(slotStart, SLOT_MINUTES)

        if (!isWithinBookingWindow(slotStart)) {
          cursor = addMinutes(cursor, SLOT_STEP_MINUTES)
          continue
        }

        if (!isWithinHours(slotStart, slotEnd)) {
          cursor = addMinutes(cursor, SLOT_STEP_MINUTES)
          continue
        }

        if (!isValidSlotStart(slotStart)) {
          cursor = addMinutes(cursor, SLOT_STEP_MINUTES)
          continue
        }

        if (overlapsWithExisting(slotStart, slotEnd, existing)) {
          cursor = addMinutes(cursor, SLOT_STEP_MINUTES)
          continue
        }

        if (overlapsWithBusy(slotStart, slotEnd, busy)) {
          cursor = addMinutes(cursor, SLOT_STEP_MINUTES)
          continue
        }

        slots.push({
          iso: slotStart.toISOString(),
          display: formatDisplay(slotStart),
        })

        cursor = addMinutes(cursor, SLOT_STEP_MINUTES)
      }

      days.push({
        date: dateStr,
        isToday: sameDay(day, now),
        label,
        timezoneLabel: 'Eastern Time (ET)',
        slots,
      })
    }

    return NextResponse.json({ days })
  } catch (error) {
    console.error('Marketing bookings availability error:', error)
    return NextResponse.json({ error: 'Failed to load availability' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as BookingPayload

    const {
      name,
      phone,
      email,
      businessName,
      tradeType,
      missedCalls,
      whoAnswers,
      extraNeeds,
      notes,
      smsConsent,
      slotStart,
      partialLeadId,
    } = body

    const attribution: Attribution = sanitizeAttribution(body.attribution)

    // Optional interests on the contact step drive the serviceType / event title.
    const serviceType = deriveServiceType(extraNeeds)
    const extraList = Array.isArray(extraNeeds)
      ? extraNeeds.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
      : []

    if (!name?.trim() || !phone?.trim() || !email?.trim() || !businessName?.trim()) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    if (!smsConsent) {
      return NextResponse.json({ error: 'SMS consent is required' }, { status: 400 })
    }
    if (!slotStart) {
      return NextResponse.json({ error: 'Missing slotStart' }, { status: 400 })
    }

    const slotStartDate = new Date(slotStart)
    if (isNaN(slotStartDate.getTime())) {
      return NextResponse.json({ error: 'Invalid slotStart' }, { status: 400 })
    }
    const slotEndDate = addMinutes(slotStartDate, SLOT_MINUTES)

    if (!isWithinBookingWindow(slotStartDate) || !isWithinHours(slotStartDate, slotEndDate) || !isValidSlotStart(slotStartDate)) {
      return NextResponse.json({ error: 'This time slot is no longer available' }, { status: 409 })
    }

    const startOfRange = new TZDate(
      slotStartDate.getFullYear(),
      slotStartDate.getMonth(),
      slotStartDate.getDate(),
      0,
      0,
      0,
      0,
      TIMEZONE
    )
    const endOfRange = new TZDate(
      slotStartDate.getFullYear(),
      slotStartDate.getMonth(),
      slotStartDate.getDate(),
      23,
      59,
      59,
      999,
      TIMEZONE
    )

    const business = await getMarketingBusiness()
    if (!business) {
      console.error('Marketing booking: no business configured. Set MARKETING_BUSINESS_ID or MARKETING_BUSINESS_SLUG.')
      return NextResponse.json(
        {
          error:
            'Booking is temporarily unavailable. Please email jacob@alignandacquire.com to schedule, or try again later.',
        },
        { status: 503 }
      )
    }

    const existing = await getExistingAppointmentsForRange(business.id, startOfRange, endOfRange)
    if (overlapsWithExisting(slotStartDate, slotEndDate, existing)) {
      return NextResponse.json({ error: 'This time slot is no longer available' }, { status: 409 })
    }

    // Re-check Google free/busy at write time. Fails closed for the same reason
    // GET does: an unreadable calendar must not be treated as a free calendar.
    const busy = await readBusyOrNull(business, startOfRange, endOfRange)
    if (busy === null) {
      return NextResponse.json(
        {
          error:
            'Booking is temporarily unavailable. Please email jacob@alignandacquire.com to schedule, or try again in a few minutes.',
        },
        { status: 503 }
      )
    }
    if (overlapsWithBusy(slotStartDate, slotEndDate, busy)) {
      return NextResponse.json({ error: 'This time slot is no longer available' }, { status: 409 })
    }

    // Create Google Calendar event if the business has calendar connected (same as client booking flow)
    let googleEventId: string | null = null
    let calendarSyncFailed = false
    if (business.googleCalendarConnected) {
      try {
        googleEventId = await createMarketingCalendarEvent(
          business.id,
          slotStartDate,
          slotEndDate,
          name.trim(),
          {
            customerPhone: phone.trim(),
            customerEmail: email.trim(),
            businessName: businessName.trim(),
            serviceType,
            servicesInterested: extraList,
            message: [
              tradeType?.trim() ? `Business type: ${tradeType.trim()}` : null,
              missedCalls?.trim() ? `Missed calls per week: ${missedCalls.trim()}` : null,
              whoAnswers?.trim() ? `Who answers now: ${whoAnswers.trim()}` : null,
              notes?.trim() || null,
              formatAttributionBlock(attribution),
            ]
              .filter(Boolean)
              .join('\n') || null,
          }
        )
        if (googleEventId) {
          console.log('[marketing-bookings] Google Calendar event created:', googleEventId)
        }
      } catch (calErr) {
        calendarSyncFailed = true
        console.error('[marketing-bookings] Calendar sync failed:', calErr instanceof Error ? calErr.message : String(calErr))
        // Continue — save appointment and send notifications even if calendar fails
      }
    }

    const appointment = await db.appointment.create({
      data: {
        businessId: business.id,
        customerName: name.trim(),
        customerPhone: phone.trim(),
        customerEmail: email.trim(),
        serviceType,
        scheduledAt: slotStartDate,
        duration: SLOT_MINUTES,
        notes: [
          `Business: ${businessName.trim()}`,
          tradeType?.trim() ? `Business type: ${tradeType.trim()}` : null,
          missedCalls?.trim() ? `Missed calls per week: ${missedCalls.trim()}` : null,
          whoAnswers?.trim() ? `Who answers now: ${whoAnswers.trim()}` : null,
          extraList.length ? `Also interested in: ${extraList.join(', ')}` : null,
          notes?.trim() ? `Notes: ${notes.trim()}` : null,
          '',
          formatAttributionBlock(attribution),
        ]
          .filter((line) => line !== null)
          .join('\n'),
        status: 'confirmed',
        source: 'website',
        googleCalendarEventId: googleEventId,
        calendarSyncFailed,
      },
    })

    const dateLabel = slotStartDate.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      timeZone: TIMEZONE,
    })
    const timeLabel = slotStartDate.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: TIMEZONE,
    })

    // ── Upgrade the partial lead instead of writing a duplicate row ──────────
    // The contact step already created a WebsiteLead with status 'partial'.
    // Match on the id it handed back, falling back to phone number.
    try {
      const partial =
        (partialLeadId
          ? await db.websiteLead.findFirst({
              where: { id: partialLeadId, businessId: business.id },
            })
          : null) ?? (await findPartialLeadByPhone(business.id, phone.trim()))

      const leadMessage = [
        `Booked a ${SLOT_MINUTES}-minute demo for ${dateLabel} at ${timeLabel} ET.`,
        '',
        `Business: ${businessName.trim()}`,
        tradeType?.trim() ? `Business type: ${tradeType.trim()}` : null,
        missedCalls?.trim() ? `Missed calls per week: ${missedCalls.trim()}` : null,
        whoAnswers?.trim() ? `Who answers now: ${whoAnswers.trim()}` : null,
        extraList.length ? `Interested in: ${extraList.join(', ')}` : null,
        notes?.trim() ? `Notes: ${notes.trim()}` : null,
        '',
        formatAttributionBlock(attribution),
      ]
        .filter((line) => line !== null)
        .join('\n')

      if (partial) {
        await db.websiteLead.update({
          where: { id: partial.id },
          data: {
            status: 'converted',
            name: name.trim(),
            phone: normalizeToE164(phone.trim()),
            email: email.trim(),
            message: leadMessage,
          },
        })
      } else {
        // No partial on file (direct hit on the calendar step, or the partial
        // write failed). Still surface the booking in the Leads list.
        await db.websiteLead.create({
          data: {
            businessId: business.id,
            name: name.trim(),
            phone: normalizeToE164(phone.trim()),
            email: email.trim(),
            message: leadMessage,
            status: 'converted',
          },
        })
      }
    } catch (err) {
      // Never fail a real booking over lead bookkeeping.
      console.error('[marketing-bookings] partial lead upgrade failed:', err)
    }

    // ── Owner notification ───────────────────────────────────────────────────
    await notifyOwnerOfMarketingEvent({
      ownerEmailFallback: business.ownerEmail,
      ownerPhoneFallback: business.ownerPhone,
      subject: `New demo booked: ${name.trim()} at ${businessName.trim()}`,
      html: `
        <h2>New demo booked</h2>
        <p><strong>Name:</strong> ${escapeHtml(name.trim())}</p>
        <p><strong>Phone:</strong> ${escapeHtml(phone.trim())}</p>
        <p><strong>Email:</strong> ${escapeHtml(email.trim())}</p>
        <p><strong>Business:</strong> ${escapeHtml(businessName.trim())}</p>
        <p><strong>Business type:</strong> ${escapeHtml(tradeType?.trim() || 'Not specified')}</p>
        <p><strong>Missed calls per week:</strong> ${escapeHtml(missedCalls?.trim() || 'Not specified')}</p>
        <p><strong>Who answers now:</strong> ${escapeHtml(whoAnswers?.trim() || 'Not specified')}</p>
        <p><strong>Booking type:</strong> ${escapeHtml(serviceType)}</p>
        <p><strong>Interested in:</strong> ${escapeHtml(extraList.length ? extraList.join(', ') : 'Not specified')}</p>
        <p><strong>Time:</strong> ${escapeHtml(dateLabel)} at ${escapeHtml(timeLabel)} (Eastern Time)</p>
        <p><strong>Notes:</strong> ${escapeHtml(notes?.trim() || 'None')}</p>
        <pre style="font-family:inherit;white-space:pre-wrap;margin:0">${escapeHtml(formatAttributionBlock(attribution))}</pre>
      `,
      smsText: `Demo booked.\nName: ${name.trim()}\nPhone: ${phone.trim()}\nBusiness: ${businessName.trim()}\nMisses/wk: ${missedCalls?.trim() || 'n/a'}\nTime: ${dateLabel} at ${timeLabel} ET\n${formatAttributionLine(attribution)}`,
    })

    // ── Customer confirmation: text first, then email ────────────────────────
    // The confirmation screen promises a text, so send one. Consent is required
    // by the form, and this goes from the dedicated marketing number, never
    // from a number shared across client tenants.
    if (process.env.MARKETING_TELNYX_NUMBER && process.env.TELNYX_API_KEY && smsConsent) {
      try {
        const telnyx = new Telnyx({ apiKey: process.env.TELNYX_API_KEY })
        await telnyx.messages.send({
          from: process.env.MARKETING_TELNYX_NUMBER,
          to: normalizeToE164(phone.trim()),
          text: `You are booked with Align and Acquire for ${dateLabel} at ${timeLabel} ET. I will call this number and show you the text-back live. Reply STOP to opt out.`,
        })
      } catch (err) {
        console.error('Failed to send customer confirmation SMS via Telnyx:', err)
      }
    }

    if (process.env.RESEND_API_KEY && email) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'Align and Acquire <onboarding@resend.dev>',
            to: email,
            subject: `You're booked with Align and Acquire`,
            html: `
              <h2>You're booked</h2>
              <p>Hi ${escapeHtml(name.trim())},</p>
              <p>Your demo is set for <strong>${escapeHtml(dateLabel)} at ${escapeHtml(timeLabel)} (Eastern Time)</strong>.</p>
              <p>It takes about ${SLOT_MINUTES} minutes. I will call your business line, let it ring out, and you will watch the text back hit your phone. Then I will answer any questions.</p>
              <p>You will also get a text from me confirming.</p>
              <p>Need to move it? Just reply to this email.</p>
              <p>Talk soon, Jacob</p>
            `,
          }),
        })
      } catch (err) {
        console.error('Failed to send customer booking email via Resend:', err)
      }
    }

    return NextResponse.json({
      success: true,
      appointment: {
        id: appointment.id,
        scheduledAt: appointment.scheduledAt,
      },
    })
  } catch (error) {
    console.error('Marketing booking create error:', error)
    const raw = error instanceof Error ? error.message : 'Something went wrong while saving your booking.'
    // Avoid exposing internal/Prisma messages to the user
    const isInternal =
      /unique constraint|foreign key|prisma|connection|ECONNREFUSED|timeout/i.test(raw) || raw.length > 120
    const message = isInternal
      ? 'Something went wrong while saving your booking. Please try again or email jacob@alignandacquire.com.'
      : raw
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

