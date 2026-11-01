// ===========================================
// /book SHOW-RATE: THE REMINDER CRON'S EXTRA STEPS
// ===========================================
// Runs after the night-before / hour-before loop in
// /api/cron/appointment-reminders, and only for the flags that are on. With
// every flag off the route never calls this, so the cron is unchanged.
//
// Everything with a side effect comes in through ShowRateDeps (database reads,
// the claim, the STOP check, the Google check, the send), so
// lib/show-rate-cron.test.ts runs the real step logic against fakes and no test
// can send a text. The route wires the real ones.
//
// Same rules as the reminders above it:
//   - SMS consent marker in notes, a phone, no STOP for this business
//   - claim before send: a marker line is appended to notes with a conditional
//     update on the exact notes value read. Count 0 means another run (or a
//     concurrent notes write) got there first, and this run sends nothing.
//   - a send failure after the claim is logged and NOT retried. A missed text
//     is a better failure than a second one.
//   - Google 'cancelled' aborts; 'unknown' still sends on our own record.

import { calendarLink, LEAD_TOKEN_TTL_MS } from '@/lib/lead-token'
import { normalizeToE164 } from '@/lib/phone-utils'
import { noShowRebookText, startNudgeText } from '@/lib/marketing-sms-copy'
import {
  REBOOK_MAX_AGE_MS,
  REBOOK_SENT_MARKER,
  START_NUDGE_SENT_MARKER,
  START_NUDGE_WINDOW_MS,
  appendMarker,
  decideRebook,
  decideStartNudge,
  hasConsent,
  type ShowRateAppointment,
  type ShowRateFlags,
} from '@/lib/show-rate'

export type ShowRateKind = 'noshow_rebook' | 'start_nudge'

/** The lead row fields the /calendar link needs. */
export type LeadLinkRow = {
  calendarToken: string | null
  otpVerifiedAt: Date | null
  createdAt: Date
  funnelVariant: string | null
}

export type ShowRateDeps = {
  /** Marketing-business appointments with showStatus no_show, scheduled in [since, until]. */
  findNoShows(since: Date, until: Date): Promise<ShowRateAppointment[]>
  /** Marketing-business appointments with status confirmed, scheduled in [since, until]. */
  findStarting(since: Date, until: Date): Promise<ShowRateAppointment[]>
  /** Conditional update: set notes to `next` only where notes still equals `expected`. Returns the row count. */
  claim(id: string, expected: string | null, next: string): Promise<number>
  /** Send-time re-read, after the claim. */
  reread(id: string): Promise<ShowRateAppointment | null>
  hasOptedOut(phone: string): Promise<boolean>
  /** True when this phone booked again after this appointment was created, and that booking is live. */
  hasNewerBooking(appt: Pick<ShowRateAppointment, 'id' | 'customerPhone' | 'createdAt'>): Promise<boolean>
  calendarState(eventId: string): Promise<'active' | 'cancelled' | 'unknown'>
  /** The newest lead row for this phone, for the signed /calendar link. */
  leadForPhone(phone: string): Promise<LeadLinkRow | null>
  /** Sends one text. Returns the provider message id. Throws on failure. */
  send(to: string, text: string): Promise<string | null>
  /** Thread log after a successful send. Its failure must not affect the send result. */
  logOutbound(to: string, text: string, providerId: string | null): Promise<void>
  log?: (line: string) => void
}

export type ShowRateResult = {
  sent: { id: string; kind: ShowRateKind }[]
  skipped: { id: string; kind: ShowRateKind; reason: string }[]
  failed: { id: string; kind: ShowRateKind; error: string }[]
}

/**
 * The signed /calendar link for this lead, or the bare page when there is no
 * token or it has expired (resolveCalendarToken would reject it anyway, and the
 * page would quietly fall back to direct mode). Never a new token scheme.
 */
export function showRateCalendarLink(lead: LeadLinkRow | null, now: Date): string {
  const token = lead?.calendarToken ?? null
  const issuedAt = lead ? (lead.otpVerifiedAt ?? lead.createdAt).getTime() : 0
  const usable = token && now.getTime() - issuedAt <= LEAD_TOKEN_TTL_MS ? token : null
  return calendarLink(usable, lead?.funnelVariant ?? null)
}

export async function runShowRateSteps(
  flags: ShowRateFlags,
  deps: ShowRateDeps,
  now: Date
): Promise<ShowRateResult> {
  const result: ShowRateResult = { sent: [], skipped: [], failed: [] }
  const log = deps.log ?? ((line: string) => console.log(line))

  if (flags.noshowRebook) {
    // 72h after the call's end is the cap; the window starts a little earlier
    // so a long call scheduled just over 72h ago is still read and skipped
    // with a reason rather than silently.
    const since = new Date(now.getTime() - REBOOK_MAX_AGE_MS - 2 * 60 * 60 * 1000)
    const rows = await deps.findNoShows(since, now)
    for (const appt of rows) {
      await sendOne('noshow_rebook', appt, deps, now, result, log)
    }
  }

  if (flags.startNudge) {
    const rows = await deps.findStarting(new Date(now.getTime() - START_NUDGE_WINDOW_MS), now)
    for (const appt of rows) {
      await sendOne('start_nudge', appt, deps, now, result, log)
    }
  }

  return result
}

async function sendOne(
  kind: ShowRateKind,
  appt: ShowRateAppointment,
  deps: ShowRateDeps,
  now: Date,
  result: ShowRateResult,
  log: (line: string) => void
): Promise<void> {
  const skip = (reason: string): void => {
    result.skipped.push({ id: appt.id, kind, reason })
  }

  if (!hasConsent(appt.notes)) return skip('no sms consent recorded')
  if (!appt.customerPhone?.trim()) return skip('no phone')

  const decision = kind === 'noshow_rebook' ? decideRebook(appt, now) : decideStartNudge(appt, now)
  if (!decision.send) {
    if (decision.skip) skip(decision.skip)
    return
  }

  if (await deps.hasOptedOut(appt.customerPhone)) return skip('opted out (STOP)')
  // They already picked a new time: a rebook text, or a nudge for the old
  // slot, would read as a glitch.
  if (await deps.hasNewerBooking(appt)) return skip('already booked again')

  const marker = kind === 'noshow_rebook' ? REBOOK_SENT_MARKER : START_NUDGE_SENT_MARKER
  const claimed = await deps.claim(appt.id, appt.notes, appendMarker(appt.notes, marker, now))
  if (claimed === 0) return skip('already claimed by another run')

  // Deliberately AFTER the claim: if the state changed, the marker stays burned.
  const fresh = await deps.reread(appt.id)
  if (!fresh) return skip('deleted before send')
  if (kind === 'noshow_rebook') {
    if (fresh.showStatus !== 'no_show') return skip(`showStatus '${fresh.showStatus}' at send time`)
    if (['cancelled', 'canceled', 'deleted'].includes(fresh.status)) return skip(`status '${fresh.status}' at send time`)
  } else {
    if (fresh.status !== 'confirmed') return skip(`status '${fresh.status}' at send time`)
    if (fresh.showStatus !== 'pending') return skip(`showStatus '${fresh.showStatus}' at send time`)
    if (!fresh.googleMeetLink?.trim()) return skip('no Meet link at send time')
  }
  if (fresh.googleCalendarEventId) {
    const state = await deps.calendarState(fresh.googleCalendarEventId)
    if (state === 'cancelled') return skip('cancelled in Google Calendar')
  }

  const to = normalizeToE164(appt.customerPhone)
  const base = {
    scheduledAt: appt.scheduledAt,
    firstName: appt.customerName,
    timeZone: appt.customerTimezone,
    timeZoneSource: appt.customerTimezoneSource,
  }
  const text =
    kind === 'noshow_rebook'
      ? noShowRebookText({ ...base, rebookLink: showRateCalendarLink(await deps.leadForPhone(to), now), sentAt: now })
      : startNudgeText({ ...base, meetLink: fresh.googleMeetLink!.trim() })

  try {
    const providerId = await deps.send(to, text)
    log(`[reminders] SENT kind=${kind} appointmentId=${appt.id} to=${to} at=${now.toISOString()}`)
    result.sent.push({ id: appt.id, kind })
    try {
      await deps.logOutbound(to, text, providerId)
    } catch (err) {
      console.error(`[reminders] thread log failed kind=${kind} appointmentId=${appt.id}:`, err)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(
      `[reminders] FAILED kind=${kind} appointmentId=${appt.id} to=${to} error=${message} (marker left set, will not retry)`
    )
    result.failed.push({ id: appt.id, kind, error: message })
  }
}

// -------------------------------------------
// RESCHEDULE_LINK, inside the existing reminder loop
// -------------------------------------------

export type ReminderExtras = { skip?: string; rescheduleLink?: string }

/**
 * What RESCHEDULE_LINK changes for one night-before / hour-before reminder.
 * Flag off: always {}, and nothing is read.
 *
 * The /calendar link books a NEW slot; it does not cancel the old one. So once
 * the link is live, a booking whose phone has booked again after it is treated
 * as superseded and gets no further reminder. The old Google event and row are
 * left for the owner to cancel by hand.
 */
export async function reminderExtras(
  flags: ShowRateFlags,
  kind: 'night_before' | 'hour_before',
  appt: Pick<ShowRateAppointment, 'id' | 'customerPhone' | 'createdAt'>,
  deps: Pick<ShowRateDeps, 'hasNewerBooking' | 'leadForPhone'>,
  now: Date
): Promise<ReminderExtras> {
  if (!flags.rescheduleLink) return {}
  if (await deps.hasNewerBooking(appt)) return { skip: 'superseded by a newer booking' }
  if (kind !== 'night_before') return {}
  const lead = await deps.leadForPhone(normalizeToE164(appt.customerPhone))
  return { rescheduleLink: showRateCalendarLink(lead, now) }
}
