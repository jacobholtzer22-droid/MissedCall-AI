// ===========================================
// MARKETING FUNNEL SLOT RULES (/book)
// ===========================================
// Extracted verbatim from app/api/marketing-bookings/route.ts so that route and
// /api/demo-book enforce exactly the same availability rules. Behaviour is
// unchanged: this is a move, not a rewrite. Slot output was hash-compared
// before and after the extraction.
//
// 15-minute demo slots on a 30-minute grid (15 slot + 15 buffer), 8:00 AM
// through 7:30 PM Eastern, 2-hour minimum notice, 14 days ahead.

import { TZDate } from '@date-fns/tz'
import { addMinutes } from 'date-fns'
import { db } from '@/lib/db'

export const TIMEZONE = 'America/New_York'
export const START_HOUR = 8 // 8:00 AM ET
export const END_HOUR = 20 // 8:00 PM ET — extended so West Coast visitors see real same-day options
export const LAST_SLOT_HOUR = 19 // last slot starts 7:30 PM and ends at 7:45 PM
export const SLOT_MINUTES = 15 // 15-minute live demo
export const BUFFER_MINUTES = 15
export const SLOT_STEP_MINUTES = SLOT_MINUTES + BUFFER_MINUTES // 30 — slot starts on the :00 and :30
export const MIN_NOTICE_HOURS = 2
export const MAX_DAYS_AHEAD = 14

export function getNowInTz() {
  return new TZDate(new Date(), TIMEZONE)
}

export function toTZDate(date: Date | string) {
  const d = typeof date === 'string' ? new Date(date) : date
  return new TZDate(d, TIMEZONE)
}

export function isWithinBookingWindow(slotStart: Date) {
  const now = getNowInTz()
  const minStart = new Date(now.getTime() + MIN_NOTICE_HOURS * 60 * 60 * 1000)
  const maxStart = new Date(now)
  maxStart.setDate(maxStart.getDate() + MAX_DAYS_AHEAD)
  maxStart.setHours(23, 59, 59, 999)
  const ms = slotStart.getTime()
  return ms >= minStart.getTime() && ms <= maxStart.getTime()
}

export function isWithinHours(slotStart: Date, slotEnd: Date) {
  const startTz = toTZDate(slotStart)
  const endTz = toTZDate(slotEnd)
  const startHour = startTz.getHours()
  const endHour = endTz.getHours()
  return startHour >= START_HOUR && endHour <= END_HOUR
}

// Slot starts land on the :00 and :30 in ET, 8:00 AM through 7:30 PM.
export function isValidSlotStart(d: Date) {
  const tz = toTZDate(d)
  const mins = tz.getMinutes()
  const hour = tz.getHours()
  if (hour < START_HOUR || hour > LAST_SLOT_HOUR) return false
  return mins === 0 || mins === 30
}

export function formatDisplay(slotStart: Date) {
  const tz = TIMEZONE
  return slotStart.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: tz,
  })
}

export function sameDay(a: Date, b: Date) {
  const ta = toTZDate(a)
  const tb = toTZDate(b)
  return (
    ta.getFullYear() === tb.getFullYear() &&
    ta.getMonth() === tb.getMonth() &&
    ta.getDate() === tb.getDate()
  )
}

export async function getExistingAppointmentsForRange(businessId: string, start: Date, end: Date) {
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

export function overlapsWithExisting(
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
export function overlapsWithBusy(
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
