import { NextRequest, NextResponse } from 'next/server'
import { TZDate } from '@date-fns/tz'
import { addMinutes } from 'date-fns'
import { db } from '@/lib/db'
import Telnyx from 'telnyx'

const TIMEZONE = 'America/New_York'
const START_HOUR = 8 // 8:00 AM
const END_HOUR = 16 // 4:00 PM
const SLOT_MINUTES = 30
const BUFFER_MINUTES = 15
const MIN_NOTICE_HOURS = 2
const MAX_DAYS_AHEAD = 14

type BookingPayload = {
  name: string
  phone: string
  email: string
  businessName: string
  interests: string[]
  notes?: string
  smsConsent: boolean
  slotStart: string // ISO string in ET
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

function isOnHalfHour(d: Date) {
  const mins = toTZDate(d).getMinutes()
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

async function getExistingAppointmentsForRange(start: Date, end: Date) {
  // NOTE: This assumes there's a single marketing business configured via env.
  const businessId = process.env.MARKETING_BUSINESS_ID
  if (!businessId) return []

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

    const existing = await getExistingAppointmentsForRange(startOfToday, endOfRange)

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
      const lastSlotEnd = new TZDate(
        day.getFullYear(),
        day.getMonth(),
        day.getDate(),
        END_HOUR,
        0,
        0,
        0,
        TIMEZONE
      )

      let cursor = new Date(firstSlot.getTime())

      while (cursor < lastSlotEnd) {
        const slotStart = new Date(cursor.getTime())
        const slotEnd = addMinutes(slotStart, SLOT_MINUTES)

        if (!isWithinBookingWindow(slotStart)) {
          cursor = addMinutes(cursor, SLOT_MINUTES)
          continue
        }

        if (!isWithinHours(slotStart, slotEnd)) {
          cursor = addMinutes(cursor, SLOT_MINUTES)
          continue
        }

        if (!isOnHalfHour(slotStart)) {
          cursor = addMinutes(cursor, SLOT_MINUTES)
          continue
        }

        if (overlapsWithExisting(slotStart, slotEnd, existing)) {
          cursor = addMinutes(cursor, SLOT_MINUTES)
          continue
        }

        slots.push({
          iso: slotStart.toISOString(),
          display: formatDisplay(slotStart),
        })

        cursor = addMinutes(cursor, SLOT_MINUTES)
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

    const { name, phone, email, businessName, interests, notes, smsConsent, slotStart } = body

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

    if (!isWithinBookingWindow(slotStartDate) || !isWithinHours(slotStartDate, slotEndDate) || !isOnHalfHour(slotStartDate)) {
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

    const existing = await getExistingAppointmentsForRange(startOfRange, endOfRange)
    if (overlapsWithExisting(slotStartDate, slotEndDate, existing)) {
      return NextResponse.json({ error: 'This time slot is no longer available' }, { status: 409 })
    }

    const businessId = process.env.MARKETING_BUSINESS_ID
    if (!businessId) {
      console.error('MARKETING_BUSINESS_ID env var is not set')
      return NextResponse.json({ error: 'Booking unavailable' }, { status: 500 })
    }

    const appointment = await db.appointment.create({
      data: {
        businessId,
        customerName: name.trim(),
        customerPhone: phone.trim(),
        customerEmail: email.trim(),
        serviceType: interests && interests.length ? interests.join(', ') : 'Discovery Call',
        scheduledAt: slotStartDate,
        duration: SLOT_MINUTES,
        notes: [
          `Business: ${businessName.trim()}`,
          interests && interests.length ? `Services: ${interests.join(', ')}` : null,
          notes?.trim() ? `Notes: ${notes.trim()}` : null,
        ]
          .filter(Boolean)
          .join('\n'),
        status: 'confirmed',
        source: 'website',
      },
    })

    // Notify business owner via email (Resend) and SMS (Telnyx)
    const ownerEmail = process.env.YOUR_EMAIL
    const ownerPhone = process.env.OWNER_PHONE
    const telnyxFrom = process.env.MARKETING_TELNYX_NUMBER

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

    // Owner email via Resend (same infra as contact form)
    if (process.env.RESEND_API_KEY && ownerEmail) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'Align and Acquire <onboarding@resend.dev>',
            to: ownerEmail,
            subject: `New Strategy Call Booking: ${name}`,
            html: `
              <h2>New Strategy Call Booking</h2>
              <p><strong>Name:</strong> ${name}</p>
              <p><strong>Phone:</strong> ${phone}</p>
              <p><strong>Email:</strong> ${email}</p>
              <p><strong>Business Name:</strong> ${businessName}</p>
              <p><strong>Selected Services:</strong> ${interests && interests.length ? interests.join(', ') : 'Not specified'}</p>
              <p><strong>Time:</strong> ${dateLabel} at ${timeLabel} (Eastern Time)</p>
              <p><strong>Notes:</strong> ${notes?.trim() || 'None'}</p>
            `,
          }),
        })
      } catch (err) {
        console.error('Failed to send owner booking email via Resend:', err)
      }
    }

    // Owner SMS via Telnyx
    if (telnyxFrom && ownerPhone && process.env.TELNYX_API_KEY) {
      try {
        const telnyx = new Telnyx({ apiKey: process.env.TELNYX_API_KEY })
        const smsText = `📅 New strategy call booked with Align and Acquire.\nName: ${name}\nPhone: ${phone}\nEmail: ${email}\nBusiness: ${businessName}\nServices: ${
          interests && interests.length ? interests.join(', ') : 'Not specified'
        }\nTime: ${dateLabel} at ${timeLabel} (ET).`
        await telnyx.messages.send({
          from: telnyxFrom,
          to: ownerPhone,
          text: smsText,
        })
      } catch (err) {
        console.error('Failed to send owner booking SMS via Telnyx:', err)
      }
    }

    // Customer confirmation email via Resend
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
              <h2>You're booked! ✓</h2>
              <p>Hi ${name},</p>
              <p>Your strategy call with Align and Acquire is confirmed for <strong>${dateLabel} at ${timeLabel} (Eastern Time)</strong>.</p>
              <p>If you need to reschedule, reply to this email.</p>
              <p>Talk soon — Jacob</p>
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
    return NextResponse.json({ error: 'Failed to book call' }, { status: 500 })
  }
}

