// ===========================================
// /book DEMO REMINDERS: WHICH ONE IS DUE NOW
// ===========================================
// The timing rules of /api/cron/appointment-reminders, pulled out of the route
// unchanged so scripts/preview-booker-messages.ts can show exactly when each
// reminder would go out (or why it would be skipped) by calling the same
// function the cron calls. Pure: no DB, no clock, no sends.
//
// "Local" is the booker's zone (Appointment.customerTimezone), Eastern when it
// was not captured.

import { TZDate } from '@date-fns/tz'
import { normalizeTimeZone } from '@/lib/booker-time'

/** Fallback when the booker's zone was not captured. */
export const REMINDER_FALLBACK_TIMEZONE = 'America/New_York'
export const NIGHT_BEFORE_HOUR = 18
export const NIGHT_BEFORE_MINUTE = 30
export const HOUR_BEFORE_MS = 60 * 60 * 1000

/**
 * Nothing goes out before this hour, booker-local. A demo texted at 6:00 AM is
 * worse than no text at all.
 */
export const QUIET_UNTIL_HOUR = 7

/**
 * No hour-before for a demo starting before this hour. Its hour-before mark
 * would land inside quiet hours anyway, and the night-before text already told
 * them about it.
 */
export const HOUR_BEFORE_MIN_MEETING_HOUR = 8

/**
 * No hour-before when the booking was made this close to the meeting. The
 * confirmation text has only just landed and a second one an hour later reads
 * as a glitch.
 */
export const HOUR_BEFORE_MIN_LEAD_MS = 90 * 60 * 1000

/** If a cron run is missed, do not fire a stale night-before text hours late. */
export const NIGHT_BEFORE_GRACE_MS = 12 * 60 * 60 * 1000

export type ReminderKind = 'night_before' | 'hour_before'

export type ReminderAppointment = {
  scheduledAt: Date
  createdAt: Date
  customerTimezone: string | null
  reminderNightBeforeSentAt: Date | null
  reminderHourBeforeSentAt: Date | null
}

/**
 * kind: the reminder to send on this run, or null.
 * skip: why something that might have gone out did not. Logged by the cron.
 */
export type ReminderDecision = { kind: ReminderKind; skip?: undefined } | { kind: null; skip?: string }

/** The zone reminder timing runs in for this booking. */
export function reminderZone(appt: { customerTimezone: string | null }): string {
  return normalizeTimeZone(appt.customerTimezone) ?? REMINDER_FALLBACK_TIMEZONE
}

export function sameDayInTz(a: Date, b: Date, tz: string): boolean {
  const ta = new TZDate(a, tz)
  const tb = new TZDate(b, tz)
  return (
    ta.getFullYear() === tb.getFullYear() &&
    ta.getMonth() === tb.getMonth() &&
    ta.getDate() === tb.getDate()
  )
}

/** 6:30 PM local on the calendar day before the appointment. DST-correct via TZDate. */
export function nightBeforeDueAt(scheduledAt: Date, tz: string): Date {
  const sched = new TZDate(scheduledAt, tz)
  return new Date(
    new TZDate(
      sched.getFullYear(),
      sched.getMonth(),
      sched.getDate() - 1,
      NIGHT_BEFORE_HOUR,
      NIGHT_BEFORE_MINUTE,
      0,
      0,
      tz
    ).getTime()
  )
}

/** Hour of day in the given zone. */
export function localHour(d: Date, tz: string): number {
  return new TZDate(d, tz).getHours()
}

/** Which single reminder, if any, is due for this booking at `now`. */
export function decideReminder(appt: ReminderAppointment, now: Date): ReminderDecision {
  const msUntil = appt.scheduledAt.getTime() - now.getTime()
  const tz = reminderZone(appt)

  let kind: ReminderKind | null = null
  if (msUntil > 0 && msUntil <= HOUR_BEFORE_MS && !appt.reminderHourBeforeSentAt) {
    // An early demo's hour-before mark falls inside quiet hours, and the
    // night-before text has already covered it.
    if (localHour(appt.scheduledAt, tz) < HOUR_BEFORE_MIN_MEETING_HOUR) {
      return {
        kind: null,
        skip: `meeting starts before ${HOUR_BEFORE_MIN_MEETING_HOUR}:00 local, night-before covers it`,
      }
    }
    // Booked almost on top of the meeting: the confirmation is the reminder.
    const leadMs = appt.scheduledAt.getTime() - appt.createdAt.getTime()
    if (leadMs < HOUR_BEFORE_MIN_LEAD_MS) {
      return {
        kind: null,
        skip: `booked ${Math.round(leadMs / 60000)} min before the meeting, confirmation covers it`,
      }
    }
    kind = 'hour_before'
  } else if (!appt.reminderNightBeforeSentAt) {
    if (sameDayInTz(appt.createdAt, appt.scheduledAt, tz)) {
      return { kind: null, skip: 'booked same day, night-before not applicable' }
    }
    const overdueBy = now.getTime() - nightBeforeDueAt(appt.scheduledAt, tz).getTime()
    if (overdueBy >= 0 && overdueBy <= NIGHT_BEFORE_GRACE_MS && msUntil > HOUR_BEFORE_MS) {
      kind = 'night_before'
    }
  }

  if (!kind) return { kind: null }

  // Quiet hours, in the booker's own zone: 6:00 AM Pacific is 9:00 AM Eastern.
  if (localHour(now, tz) < QUIET_UNTIL_HOUR) {
    return {
      kind: null,
      skip: `quiet hours before ${QUIET_UNTIL_HOUR}:00 local (${tz}, local hour ${localHour(now, tz)})`,
    }
  }
  return { kind }
}
