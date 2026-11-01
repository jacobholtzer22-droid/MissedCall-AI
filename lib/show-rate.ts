// ===========================================
// /book SHOW-RATE: FLAGS, MARKERS, TIMING
// ===========================================
// Pure decision logic for the show-rate layer on the /book funnel. No DB, no
// clock, no sends: the reminder cron (lib/show-rate-cron.ts wires the steps),
// the SMS webhook and Ops HQ call these, and lib/show-rate.test.ts tests them.
//
// Every feature is behind its own env flag, OFF unless the value is exactly
// the string 'true':
//
//   NOSHOW_REBOOK_SMS  one rebook text after the owner marks a booking no_show
//   START_NUDGE_SMS    one "I'm on now" text with the Meet link at start time
//   CONFIRM_TRACKING   record a YES reply on the booking, flag no reply by 9 AM
//   RESCHEDULE_LINK    self-serve /calendar link in the night-before text and
//                      the confirmation email
//
// State lives in Appointment.notes as one marker line per event, the same
// pattern as the consent marker /api/demo-book writes and the reminder cron
// keys on. No schema change. Each marker is written with a conditional update
// on the exact notes value read (see appendMarker), so a send is claimed once
// and a concurrent writer is never clobbered.

import { TZDate } from '@date-fns/tz'
import { reminderZone, localHour, QUIET_UNTIL_HOUR } from '@/lib/demo-reminder-schedule'

// -------------------------------------------
// Flags
// -------------------------------------------

export type ShowRateFlags = {
  noshowRebook: boolean
  startNudge: boolean
  confirmTracking: boolean
  rescheduleLink: boolean
}

export function showRateFlags(env: Record<string, string | undefined> = process.env): ShowRateFlags {
  return {
    noshowRebook: env.NOSHOW_REBOOK_SMS === 'true',
    startNudge: env.START_NUDGE_SMS === 'true',
    confirmTracking: env.CONFIRM_TRACKING === 'true',
    rescheduleLink: env.RESCHEDULE_LINK === 'true',
  }
}

// -------------------------------------------
// Notes markers
// -------------------------------------------

/**
 * Same literal the reminder cron gates on (written by /api/demo-book). Kept
 * here so the show-rate steps can be tested without importing the route.
 */
export const CONSENT_MARKER = 'SMS consent: yes'

/** One line each, "<marker> <ISO time>", appended to Appointment.notes. */
export const REBOOK_SENT_MARKER = 'Rebook text sent:'
export const START_NUDGE_SENT_MARKER = 'Start nudge sent:'
export const CONFIRMED_BY_REPLY_MARKER = 'Confirmed by reply:'

export function hasConsent(notes: string | null | undefined): boolean {
  return (notes ?? '').includes(CONSENT_MARKER)
}

export function hasMarker(notes: string | null | undefined, marker: string): boolean {
  return (notes ?? '').split('\n').some((line) => line.startsWith(marker))
}

/** When the marker was stamped, or null when absent or unreadable. */
export function markerTime(notes: string | null | undefined, marker: string): Date | null {
  const line = (notes ?? '').split('\n').find((l) => l.startsWith(marker))
  if (!line) return null
  const d = new Date(line.slice(marker.length).trim())
  return isNaN(d.getTime()) ? null : d
}

/** The notes value with the marker line added. Never rewrites what is there. */
export function appendMarker(notes: string | null | undefined, marker: string, at: Date): string {
  const line = `${marker} ${at.toISOString()}`
  const base = notes ?? ''
  return base ? `${base}\n${line}` : line
}

// -------------------------------------------
// Shared shape
// -------------------------------------------

export type ShowRateAppointment = {
  id: string
  scheduledAt: Date
  /** Minutes. /api/demo-book writes SLOT_MINUTES. */
  duration: number
  createdAt: Date
  customerName: string | null
  customerPhone: string | null
  customerTimezone: string | null
  customerTimezoneSource: string | null
  notes: string | null
  status: string
  showStatus: string
  googleMeetLink: string | null
  googleCalendarEventId: string | null
  reminderNightBeforeSentAt: Date | null
}

export type ShowRateDecision = { send: true; skip?: undefined } | { send: false; skip?: string }

const DEAD_STATUSES = ['cancelled', 'canceled', 'deleted']

function isDead(status: string | null | undefined): boolean {
  return DEAD_STATUSES.includes((status ?? '').trim().toLowerCase())
}

/** A wall-clock time on the same local calendar day as `d` (plus dayOffset). */
function localAt(d: Date, tz: string, hour: number, dayOffset = 0): Date {
  const t = new TZDate(d, tz)
  return new Date(new TZDate(t.getFullYear(), t.getMonth(), t.getDate() + dayOffset, hour, 0, 0, 0, tz).getTime())
}

// -------------------------------------------
// 1. No-show rebook (NOSHOW_REBOOK_SMS)
// -------------------------------------------

export const REBOOK_DELAY_MS = 3 * 60 * 60 * 1000
/** Booker-local daytime window for the rebook text: 10:00 AM to 7:00 PM. */
export const REBOOK_WINDOW_START_HOUR = 10
export const REBOOK_WINDOW_END_HOUR = 19
/** Nothing goes out for a call that ended longer ago than this. */
export const REBOOK_MAX_AGE_MS = 72 * 60 * 60 * 1000

export function callEnd(appt: Pick<ShowRateAppointment, 'scheduledAt' | 'duration'>): Date {
  return new Date(appt.scheduledAt.getTime() + (appt.duration || 0) * 60 * 1000)
}

/**
 * Earliest moment the rebook text may go: 3 hours after the call's end, moved
 * into 10:00 AM to 7:00 PM booker-local. Before 10:00 AM waits for 10:00 AM
 * that day; 7:00 PM or later waits for 10:00 AM the next day.
 */
export function rebookDueAt(appt: Pick<ShowRateAppointment, 'scheduledAt' | 'duration' | 'customerTimezone'>): Date {
  const tz = reminderZone(appt)
  const t = new Date(callEnd(appt).getTime() + REBOOK_DELAY_MS)
  const h = localHour(t, tz)
  if (h < REBOOK_WINDOW_START_HOUR) return localAt(t, tz, REBOOK_WINDOW_START_HOUR)
  if (h >= REBOOK_WINDOW_END_HOUR) return localAt(t, tz, REBOOK_WINDOW_START_HOUR, 1)
  return t
}

export function decideRebook(appt: ShowRateAppointment, now: Date): ShowRateDecision {
  if (appt.showStatus !== 'no_show') return { send: false }
  if (hasMarker(appt.notes, REBOOK_SENT_MARKER)) return { send: false }
  if (isDead(appt.status)) return { send: false, skip: `status '${appt.status}'` }
  if (now.getTime() - callEnd(appt).getTime() > REBOOK_MAX_AGE_MS) {
    return { send: false, skip: 'call ended more than 72h ago' }
  }
  if (now.getTime() < rebookDueAt(appt).getTime()) return { send: false }
  // A missed cron run (or a no-show marked late) must still land in daytime.
  const tz = reminderZone(appt)
  const h = localHour(now, tz)
  if (h < REBOOK_WINDOW_START_HOUR || h >= REBOOK_WINDOW_END_HOUR) {
    // This window sits inside the cron's 7:00 AM quiet-hours rule by construction.
    return { send: false, skip: `outside 10:00 AM to 7:00 PM local (${tz}, local hour ${h})` }
  }
  return { send: true }
}

// -------------------------------------------
// 2. Start nudge (START_NUDGE_SMS)
// -------------------------------------------

/** The nudge goes from the start time up to this long after it. */
export const START_NUDGE_WINDOW_MS = 10 * 60 * 1000

/**
 * One "I'm on now" text with the Meet link, from scheduledAt to scheduledAt + 10
 * minutes, while the booking is still confirmed and unmarked (showStatus
 * pending: not showed, no_show or cancelled). Slots start on :00 and :30 and the
 * cron runs on :00/:15/:30/:45, so the run at the start time lands inside it.
 */
export function decideStartNudge(appt: ShowRateAppointment, now: Date): ShowRateDecision {
  if (appt.status !== 'confirmed') return { send: false }
  if (appt.showStatus !== 'pending') return { send: false }
  if (hasMarker(appt.notes, START_NUDGE_SENT_MARKER)) return { send: false }
  const since = now.getTime() - appt.scheduledAt.getTime()
  if (since < 0 || since > START_NUDGE_WINDOW_MS) return { send: false }
  if (!appt.googleMeetLink?.trim()) return { send: false, skip: 'no Meet link' }
  const tz = reminderZone(appt)
  if (localHour(now, tz) < QUIET_UNTIL_HOUR) {
    return { send: false, skip: `quiet hours before ${QUIET_UNTIL_HOUR}:00 local (${tz}, local hour ${localHour(now, tz)})` }
  }
  return { send: true }
}
