// ===========================================
// CRON: /book DEMO CALL REMINDERS
// ===========================================
// Runs every 15 minutes (vercel.json). Sends two English reminder texts for
// Align and Acquire demo calls booked through the /book marketing funnel:
//
//   1. Night before, 6:30 PM the booker's local time. Skipped when the call was
//      booked the same day it happens (they just booked it, they do not need a
//      reminder tonight).
//   2. One hour before, unless the meeting starts before 8:00 AM local (its
//      hour-before mark falls inside quiet hours and the night-before text has
//      already covered it), or the booking was made within 90 minutes of the
//      meeting (the confirmation text IS the reminder at that point).
//
// Nothing at all goes out before 7:00 AM local.
//
// "Local" means the BOOKER's zone (Appointment.customerTimezone), falling back
// to Eastern when it was not captured. It used to be Eastern for everyone, so a
// Pacific booker with a 10:00 AM ET call was texted at 6:00 AM their time. A
// guessed (IP) zone is used for timing too: it is the best information we have
// about when they are awake, and the copy shows ET beside it.
//
// Copy for both texts lives in lib/marketing-sms-copy.ts alongside the booking
// confirmation, so the wording and the reschedule number cannot drift across the
// three messages one prospect receives. The reschedule number is always derived
// from business.ownerPhone, never hardcoded.
//
// Scope is deliberately the marketing business only. Client-tenant appointments
// are NOT touched: those customers never consented to texts from this funnel and
// their businesses have their own numbers.
//
// Guards, all required:
//   - appointment status is still 'confirmed'
//   - SMS consent was captured at booking (marker written into notes)
//   - the number has not sent STOP (BlockedNumber row for this business)
//   - the matching reminder flag is still null
//
// Idempotency: each reminder is claimed with a conditional updateMany before the
// text is sent, so two overlapping cron runs cannot both send. A send failure
// after a successful claim is logged loudly and NOT retried — a missed reminder
// is a better failure than texting a prospect twice.
//
// Auth: same pattern as the no-reply cron. Vercel sends
// `Authorization: Bearer ${CRON_SECRET}`; the super-admin can trigger manually.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { TZDate } from '@date-fns/tz'
import Telnyx from 'telnyx'
import { db } from '@/lib/db'
import { normalizeToE164, phonesMatch } from '@/lib/phone-utils'
import { getMarketingBusiness } from '@/lib/marketing-funnel'
import { getCalendarEventState } from '@/lib/google-calendar'
import { isSendableStatus } from '@/lib/reminder-status'
import { nightBeforeText, hourBeforeText } from '@/lib/marketing-sms-copy'
import { normalizeTimeZone } from '@/lib/booker-time'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Fallback when the booker's zone was not captured. */
const TIMEZONE = 'America/New_York'
const NIGHT_BEFORE_HOUR = 18
const NIGHT_BEFORE_MINUTE = 30
const HOUR_BEFORE_MS = 60 * 60 * 1000

/**
 * Nothing goes out before this hour, business-local. A demo texted at 6:00 AM is
 * worse than no text at all.
 */
const QUIET_UNTIL_HOUR = 7

/**
 * No hour-before for a demo starting before this hour. Its hour-before mark
 * would land inside quiet hours anyway, and the night-before text already told
 * them about it.
 */
const HOUR_BEFORE_MIN_MEETING_HOUR = 8

/**
 * No hour-before when the booking was made this close to the meeting. The
 * confirmation text has only just landed and a second one an hour later reads
 * as a glitch.
 */
const HOUR_BEFORE_MIN_LEAD_MS = 90 * 60 * 1000

// If a cron run is missed, do not fire a stale night-before text hours late.
const NIGHT_BEFORE_GRACE_MS = 12 * 60 * 60 * 1000

// Consent marker written by /api/demo-book at creation time. Keying on this
// exact string is why that literal must never be reworded there.
const CONSENT_MARKER = 'SMS consent: yes'



type ReminderKind = 'night_before' | 'hour_before'

async function isAuthorized(request: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET?.trim()
  const authHeader = request.headers.get('authorization')
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true
  try {
    const { userId } = await auth()
    if (userId && process.env.ADMIN_USER_ID && userId === process.env.ADMIN_USER_ID) return true
  } catch {
    // No Clerk context (cron request without a session) — fall through
  }
  return false
}

/** The zone reminder timing runs in for this booking. */
function bookerZone(appt: { customerTimezone: string | null }): string {
  return normalizeTimeZone(appt.customerTimezone) ?? TIMEZONE
}

function sameDayInTz(a: Date, b: Date, tz: string): boolean {
  const ta = new TZDate(a, tz)
  const tb = new TZDate(b, tz)
  return (
    ta.getFullYear() === tb.getFullYear() &&
    ta.getMonth() === tb.getMonth() &&
    ta.getDate() === tb.getDate()
  )
}

/** 6:30 PM local on the calendar day before the appointment. DST-correct via TZDate. */
function nightBeforeDueAt(scheduledAt: Date, tz: string): Date {
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
function localHour(d: Date, tz: string): number {
  return new TZDate(d, tz).getHours()
}

function reminderText(
  kind: ReminderKind,
  scheduledAt: Date,
  meetLink: string | null,
  ownerPhone: string | null,
  timeZone: string | null,
  timeZoneSource: string | null
): string {
  const params = { scheduledAt, meetLink, ownerPhone, timeZone, timeZoneSource }
  return kind === 'night_before' ? nightBeforeText(params) : hourBeforeText(params)
}

/** True when this number has opted out of texts from this business. */
async function hasOptedOut(businessId: string, phone: string): Promise<boolean> {
  const e164 = normalizeToE164(phone)
  const exact = await db.blockedNumber.findFirst({
    where: { businessId, phoneNumber: e164 },
  })
  if (exact) return true
  // Fallback for rows stored in another format.
  const all = await db.blockedNumber.findMany({ where: { businessId }, take: 500 })
  return all.some((b) => phonesMatch(b.phoneNumber, phone))
}

export async function GET(request: NextRequest) {
  return runAppointmentReminders(request)
}

export async function POST(request: NextRequest) {
  return runAppointmentReminders(request)
}

async function runAppointmentReminders(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const business = await getMarketingBusiness()
  if (!business) {
    console.error('[reminders] no marketing business configured')
    return NextResponse.json({ error: 'No marketing business configured' }, { status: 503 })
  }

  const fromNumber = process.env.MARKETING_TELNYX_NUMBER || business.telnyxPhoneNumber
  if (!fromNumber || !process.env.TELNYX_API_KEY) {
    console.error('[reminders] no sender configured (MARKETING_TELNYX_NUMBER / TELNYX_API_KEY)')
    return NextResponse.json({ error: 'No SMS sender configured' }, { status: 503 })
  }

  // `?now=<ISO>` shifts the clock for verification runs. Authorized callers only
  // (CRON_SECRET bearer or the super-admin), and logged loudly, because it can
  // make a real reminder fire early against a real booking.
  const nowParam = request.nextUrl.searchParams.get('now')
  const overridden = nowParam ? new Date(nowParam) : null
  if (nowParam && (!overridden || isNaN(overridden.getTime()))) {
    return NextResponse.json({ error: `Invalid now override: ${nowParam}` }, { status: 400 })
  }
  const now = overridden ?? new Date()
  if (overridden) {
    console.warn(`[reminders] CLOCK OVERRIDE now=${now.toISOString()} (verification run)`)
  }

  const telnyx = new Telnyx({ apiKey: process.env.TELNYX_API_KEY })

  // Candidate window: anything upcoming in the next 48h that is still confirmed.
  const candidates = await db.appointment.findMany({
    where: {
      businessId: business.id,
      status: 'confirmed',
      scheduledAt: { gt: now, lte: new Date(now.getTime() + 48 * 60 * 60 * 1000) },
    },
    orderBy: { scheduledAt: 'asc' },
    take: 200,
  })

  const result = {
    checked: candidates.length,
    sent: [] as { id: string; kind: ReminderKind }[],
    skipped: [] as { id: string; reason: string }[],
    failed: [] as { id: string; kind: ReminderKind; error: string }[],
  }

  for (const appt of candidates) {
    const notes = appt.notes ?? ''
    if (!notes.includes(CONSENT_MARKER)) {
      result.skipped.push({ id: appt.id, reason: 'no sms consent recorded' })
      continue
    }
    if (!appt.customerPhone?.trim()) {
      result.skipped.push({ id: appt.id, reason: 'no phone' })
      continue
    }

    const msUntil = appt.scheduledAt.getTime() - now.getTime()
    const tz = bookerZone(appt)

    // Decide which single reminder, if any, is due right now.
    let kind: ReminderKind | null = null
    if (msUntil > 0 && msUntil <= HOUR_BEFORE_MS && !appt.reminderHourBeforeSentAt) {
      // An early demo's hour-before mark falls inside quiet hours, and the
      // night-before text has already covered it.
      if (localHour(appt.scheduledAt, tz) < HOUR_BEFORE_MIN_MEETING_HOUR) {
        result.skipped.push({
          id: appt.id,
          reason: `meeting starts before ${HOUR_BEFORE_MIN_MEETING_HOUR}:00 local, night-before covers it`,
        })
        continue
      }
      // Booked almost on top of the meeting: the confirmation is the reminder.
      const leadMs = appt.scheduledAt.getTime() - appt.createdAt.getTime()
      if (leadMs < HOUR_BEFORE_MIN_LEAD_MS) {
        result.skipped.push({
          id: appt.id,
          reason: `booked ${Math.round(leadMs / 60000)} min before the meeting, confirmation covers it`,
        })
        continue
      }
      kind = 'hour_before'
    } else if (!appt.reminderNightBeforeSentAt) {
      const bookedSameDay = sameDayInTz(appt.createdAt, appt.scheduledAt, tz)
      if (bookedSameDay) {
        result.skipped.push({ id: appt.id, reason: 'booked same day, night-before not applicable' })
      } else {
        const due = nightBeforeDueAt(appt.scheduledAt, tz).getTime()
        const overdueBy = now.getTime() - due
        if (overdueBy >= 0 && overdueBy <= NIGHT_BEFORE_GRACE_MS && msUntil > HOUR_BEFORE_MS) {
          kind = 'night_before'
        }
      }
    }

    if (!kind) continue

    // Quiet hours, in the booker's own zone. Per appointment now that bookers
    // are in different zones: 6:00 AM Pacific is 9:00 AM Eastern.
    if (localHour(now, tz) < QUIET_UNTIL_HOUR) {
      result.skipped.push({
        id: appt.id,
        reason: `quiet hours before ${QUIET_UNTIL_HOUR}:00 local (${tz}, local hour ${localHour(now, tz)})`,
      })
      continue
    }

    if (await hasOptedOut(business.id, appt.customerPhone)) {
      result.skipped.push({ id: appt.id, reason: 'opted out (STOP)' })
      continue
    }

    // Claim before sending. If another run already claimed it, count is 0.
    const claimField =
      kind === 'night_before'
        ? { reminderNightBeforeSentAt: now }
        : { reminderHourBeforeSentAt: now }
    const claimWhere =
      kind === 'night_before'
        ? { id: appt.id, reminderNightBeforeSentAt: null }
        : { id: appt.id, reminderHourBeforeSentAt: null }

    const claim = await db.appointment.updateMany({ where: claimWhere, data: claimField })
    if (claim.count === 0) {
      result.skipped.push({ id: appt.id, reason: 'already claimed by another run' })
      continue
    }

    // Send-time status re-read. Deliberately AFTER the claim: if the booking is
    // dead we want the flag to stay burned so no later run retries it.
    const fresh = await db.appointment.findUnique({
      where: { id: appt.id },
      select: { status: true, googleMeetLink: true, googleCalendarEventId: true },
    })
    if (!fresh || !isSendableStatus(fresh.status)) {
      const reason = !fresh ? 'deleted before send' : `status '${fresh.status}' at send time`
      console.log(`[reminders] ABORT kind=${kind} appointmentId=${appt.id} reason=${reason}`)
      result.skipped.push({ id: appt.id, reason })
      continue
    }

    // Scenario B guard: the booking is 'confirmed' in our database, but it may
    // have been cancelled directly in Google Calendar, which nothing syncs back.
    // That is the realistic failure mode while there is no admin calendar UI.
    //
    // Deliberately three-state. 'unknown' (network error, expired token, Google
    // 5xx) must NOT be treated as cancelled, or one bad API call would wipe out
    // live bookings. On unknown we log and still send, because our own record
    // says the booking is on.
    if (fresh.googleCalendarEventId) {
      const calState = await getCalendarEventState(business.id, fresh.googleCalendarEventId)
      if (calState === 'cancelled') {
        await db.appointment.update({
          where: { id: appt.id },
          data: { status: 'cancelled' },
        })
        console.log(
          `[reminders] ABORT kind=${kind} appointmentId=${appt.id} reason=cancelled in Google Calendar ` +
            `eventId=${fresh.googleCalendarEventId} (booking marked cancelled in DB, no SMS sent)`
        )
        result.skipped.push({ id: appt.id, reason: 'cancelled in Google Calendar' })
        continue
      }
      if (calState === 'unknown') {
        console.warn(
          `[reminders] WARN appointmentId=${appt.id} could not verify Google event ` +
            `${fresh.googleCalendarEventId}. Proceeding with send on DB status '${fresh.status}'.`
        )
      }
    }

    const to = normalizeToE164(appt.customerPhone)
    const text = reminderText(
      kind,
      appt.scheduledAt,
      fresh.googleMeetLink,
      business.ownerPhone,
      appt.customerTimezone,
      appt.customerTimezoneSource
    )

    try {
      await telnyx.messages.send({ from: fromNumber, to, text })
      console.log(
        `[reminders] SENT kind=${kind} appointmentId=${appt.id} to=${to} scheduledAt=${appt.scheduledAt.toISOString()} at=${now.toISOString()}`
      )
      result.sent.push({ id: appt.id, kind })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      // Flag stays set on purpose: never risk double-texting a prospect.
      console.error(
        `[reminders] FAILED kind=${kind} appointmentId=${appt.id} to=${to} error=${message} (flag left set, will not retry)`
      )
      result.failed.push({ id: appt.id, kind, error: message })
    }
  }

  console.log(
    `[reminders] run complete checked=${result.checked} sent=${result.sent.length} skipped=${result.skipped.length} failed=${result.failed.length}`
  )
  return NextResponse.json({ ok: true, ...result })
}
