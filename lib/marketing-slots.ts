// ===========================================
// MARKETING FUNNEL SLOT RULES (/book)
// ===========================================
// The single source of truth for /book availability. Two files import it:
// /api/demo-book (the write path) and the /api/marketing-bookings GET (the read
// path). Both funnel arms, /book/a and /book/b, inherit these rules through that
// GET rather than by importing anything, so there is one place to change them.
// Nothing else may hardcode an hour, a step or a window.
//
// 30-minute demo blocks stacked back to back, 7:00 AM through 9:00 PM Eastern,
// 1-hour minimum notice, 3 days ahead. 7:00 to 21:00 on a 30-minute step yields
// 28 slots a day, 7:00 AM through 8:30 PM.

import { TZDate } from '@date-fns/tz'
import { addMinutes } from 'date-fns'
import { db } from '@/lib/db'

export const TIMEZONE = 'America/New_York'
export const START_HOUR = 7 // 7:00 AM ET
export const END_HOUR = 21 // 9:00 PM ET. Every block has to finish by this hour.
export const SLOT_MINUTES = 30 // 30-minute live demo
/**
 * Gap required between a demo and anything adjacent to it. Zero on purpose:
 * demos stack back to back, so a call ending at 8:30 and one starting at 8:30
 * are both offered. Raising this widens the grid AND the overlap test together,
 * which is why both derive from this one constant.
 */
export const BUFFER_MINUTES = 0
export const SLOT_STEP_MINUTES = SLOT_MINUTES + BUFFER_MINUTES // 30
export const MIN_NOTICE_HOURS = 1
export const MAX_DAYS_AHEAD = 3

export function getNowInTz() {
  return new TZDate(new Date(), TIMEZONE)
}

export function toTZDate(date: Date | string) {
  const d = typeof date === 'string' ? new Date(date) : date
  return new TZDate(d, TIMEZONE)
}

/**
 * Slot has to be at least MIN_NOTICE_HOURS out and no later than the end of the
 * MAX_DAYS_AHEAD-th day.
 *
 * The upper bound is built with TZDate rather than setDate/setHours on a plain
 * Date. setHours resolves against the SERVER's zone, which is UTC on Vercel, so
 * the old form capped the last day at 23:59 UTC, i.e. 7:59 PM Eastern. That
 * silently threw away the 8:00 PM and 8:30 PM slots on the final day of the
 * window. It was invisible locally because this machine is already Eastern.
 */
export function isWithinBookingWindow(slotStart: Date) {
  const now = getNowInTz()
  const minStart = new Date(now.getTime() + MIN_NOTICE_HOURS * 60 * 60 * 1000)
  const maxStart = new TZDate(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + MAX_DAYS_AHEAD,
    23,
    59,
    59,
    999,
    TIMEZONE
  )
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

/**
 * Slot starts are every SLOT_STEP_MINUTES from START_HOUR, and the call has to
 * finish by END_HOUR.
 *
 * Derived rather than hard-coded on purpose: this used to test `mins === 0 ||
 * mins === 30`, which silently matched only a 30 minute step. Changing the slot
 * length without changing that literal would have thrown away most of the day's
 * slots with no error.
 */
export function isValidSlotStart(d: Date) {
  const tz = toTZDate(d)
  const hour = tz.getHours()
  const mins = tz.getMinutes()
  if (hour < START_HOUR) return false
  const minutesFromOpen = (hour - START_HOUR) * 60 + mins
  if (minutesFromOpen < 0) return false
  if (minutesFromOpen % SLOT_STEP_MINUTES !== 0) return false
  return minutesFromOpen + SLOT_MINUTES <= (END_HOUR - START_HOUR) * 60
}

/** Minutes past START_HOUR for the last slot that still finishes by END_HOUR. */
export function lastSlotOffsetMinutes(): number {
  const usable = (END_HOUR - START_HOUR) * 60 - SLOT_MINUTES
  return Math.floor(usable / SLOT_STEP_MINUTES) * SLOT_STEP_MINUTES
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

/**
 * Do two blocks collide, allowing for the required gap between them?
 *
 * BUFFER_MINUTES is applied ONCE, to the gap itself, not once per side. Two
 * blocks conflict when either one starts before the other has ended plus the
 * gap. At BUFFER_MINUTES 0 this collapses to a strict overlap test, so
 * 8:00 to 8:30 and 8:30 to 9:00 do not conflict and both are offered.
 */
function conflicts(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return (
    aStart.getTime() < addMinutes(bEnd, BUFFER_MINUTES).getTime() &&
    bStart.getTime() < addMinutes(aEnd, BUFFER_MINUTES).getTime()
  )
}

export function overlapsWithExisting(
  slotStart: Date,
  slotEnd: Date,
  existing: { scheduledAt: Date; duration: number }[]
) {
  for (const appt of existing) {
    const apptStart = new Date(appt.scheduledAt)
    const apptEnd = addMinutes(apptStart, appt.duration || SLOT_MINUTES)
    if (conflicts(slotStart, slotEnd, apptStart, apptEnd)) return true
  }
  return false
}

/**
 * Same gap rule as booked appointments, applied to Google Calendar busy windows
 * so anything on the calendar directly also blocks a funnel slot.
 */
export function overlapsWithBusy(
  slotStart: Date,
  slotEnd: Date,
  busy: { start: string; end: string }[]
) {
  for (const window of busy) {
    const busyStart = new Date(window.start)
    const busyEnd = new Date(window.end)
    if (isNaN(busyStart.getTime()) || isNaN(busyEnd.getTime())) continue
    if (conflicts(slotStart, slotEnd, busyStart, busyEnd)) return true
  }
  return false
}
