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
import Telnyx from 'telnyx'
import { db } from '@/lib/db'
import { logMarketingOutbound } from '@/lib/marketing-thread-log'
import { normalizeToE164, phonesMatch } from '@/lib/phone-utils'
import { getMarketingBusiness } from '@/lib/marketing-funnel'
import { getCalendarEventState } from '@/lib/google-calendar'
import { isSendableStatus } from '@/lib/reminder-status'
import { nightBeforeText, hourBeforeText } from '@/lib/marketing-sms-copy'
import { decideReminder, type ReminderKind } from '@/lib/demo-reminder-schedule'
import { showRateFlags } from '@/lib/show-rate'
import { reminderExtras, runShowRateSteps, type ShowRateDeps, type ShowRateResult } from '@/lib/show-rate-cron'
import { OWNER_TIMEZONE } from '@/lib/booker-time'
import { outcomeCaptureEnabled } from '@/lib/outcome-capture'
import { runOutcomeCapture, type OutcomeCronResult, type OutcomeDeps } from '@/lib/outcome-capture-cron'
import { OUTCOME_SELECT, ownerNumber } from '@/lib/outcome-capture-reply'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Timing rules (quiet hours, 6:30 PM night-before, the hour-before skips) live
// in lib/demo-reminder-schedule.ts, so scripts/preview-booker-messages.ts shows
// exactly what this cron would do by calling the same decideReminder.

// Consent marker written by /api/demo-book at creation time. Keying on this
// exact string is why that literal must never be reworded there.
const CONSENT_MARKER = 'SMS consent: yes'

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

function reminderText(
  kind: ReminderKind,
  scheduledAt: Date,
  firstName: string | null,
  meetLink: string | null,
  ownerPhone: string | null,
  timeZone: string | null,
  timeZoneSource: string | null,
  rescheduleLink?: string
): string {
  // rescheduleLink is only ever set with RESCHEDULE_LINK on; undefined renders today's copy.
  const params = { scheduledAt, firstName, meetLink, ownerPhone, timeZone, timeZoneSource, rescheduleLink }
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

  // Show-rate flags (lib/show-rate.ts), each OFF by default.
  const flags = showRateFlags()
  const showRateLinks = flags.rescheduleLink ? showRateDeps(business.id, telnyx, fromNumber) : null

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

    // Which single reminder, if any, is due right now. Rules and their
    // reasons are in lib/demo-reminder-schedule.ts.
    const decision = decideReminder(appt, now)
    if (decision.skip) result.skipped.push({ id: appt.id, reason: decision.skip })
    if (!decision.kind) continue
    const kind: ReminderKind = decision.kind

    if (await hasOptedOut(business.id, appt.customerPhone)) {
      result.skipped.push({ id: appt.id, reason: 'opted out (STOP)' })
      continue
    }

    // RESCHEDULE_LINK only: skip a superseded booking, link in the night-before.
    const extras = showRateLinks ? await reminderExtras(flags, kind, appt, showRateLinks, now) : {}
    if (extras.skip) {
      result.skipped.push({ id: appt.id, reason: extras.skip })
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
      appt.customerName,
      fresh.googleMeetLink,
      business.ownerPhone,
      appt.customerTimezone,
      appt.customerTimezoneSource,
      extras.rescheduleLink
    )

    try {
      const res = await telnyx.messages.send({ from: fromNumber, to, text })
      const providerId = (res as { data?: { id?: string } })?.data?.id ?? null
      console.log(
        `[reminders] SENT kind=${kind} appointmentId=${appt.id} to=${to} scheduledAt=${appt.scheduledAt.toISOString()} at=${now.toISOString()}`
      )
      // After the send. The claim above is what prevents a double-text; a
      // failure to log must not touch it or the send result.
      await logMarketingOutbound({
        phone: to,
        body: text,
        telnyxSid: providerId,
        businessId: business.id,
        label: 'reminders',
      })
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

  // Show-rate steps (lib/show-rate-cron.ts), each behind its own env flag and
  // OFF by default. With every flag off nothing below runs and the response is
  // exactly what it was.
  let showRate: ShowRateResult | null = null
  if (flags.noshowRebook || flags.startNudge) {
    showRate = await runShowRateSteps(flags, showRateDeps(business.id, telnyx, fromNumber), now)
  }

  // Outcome capture (lib/outcome-capture-cron.ts): the owner's "did they show"
  // prompt 30 minutes after each call and the 6 PM list of unmarked calls.
  // OUTCOME_PROMPT_SMS off (the default): nothing runs and the response is
  // exactly what it was. Texts go to the owner only, never to a prospect.
  let outcome: OutcomeCronResult | null = null
  if (outcomeCaptureEnabled()) {
    if (ownerNumber(business.ownerPhone)) {
      outcome = await runOutcomeCapture(outcomeDeps(business, telnyx, fromNumber), now)
    } else {
      console.error('[outcome] SKIP reason=no_owner_number (OWNER_PHONE unset and business.ownerPhone empty)')
    }
  }

  console.log(
    `[reminders] run complete checked=${result.checked} sent=${result.sent.length} skipped=${result.skipped.length} failed=${result.failed.length}`
  )
  const body: Record<string, unknown> = { ok: true, ...result }
  if (showRate) body.showRate = showRate
  if (outcome) body.outcome = outcome
  return NextResponse.json(body)
}

const SHOW_RATE_SELECT = {
  id: true,
  scheduledAt: true,
  duration: true,
  createdAt: true,
  customerName: true,
  customerPhone: true,
  customerTimezone: true,
  customerTimezoneSource: true,
  notes: true,
  status: true,
  showStatus: true,
  googleMeetLink: true,
  googleCalendarEventId: true,
  reminderNightBeforeSentAt: true,
} as const

/** The real side effects behind lib/show-rate-cron.ts. Only built when a flag is on. */
function showRateDeps(businessId: string, telnyx: Telnyx, fromNumber: string): ShowRateDeps {
  return {
    findNoShows: (since, until) =>
      db.appointment.findMany({
        where: { businessId, showStatus: 'no_show', scheduledAt: { gte: since, lte: until } },
        orderBy: { scheduledAt: 'asc' },
        take: 200,
        select: SHOW_RATE_SELECT,
      }),
    findStarting: (since, until) =>
      db.appointment.findMany({
        where: { businessId, status: 'confirmed', scheduledAt: { gte: since, lte: until } },
        orderBy: { scheduledAt: 'asc' },
        take: 200,
        select: SHOW_RATE_SELECT,
      }),
    claim: async (id, expected, next) =>
      (await db.appointment.updateMany({ where: { id, notes: expected }, data: { notes: next } })).count,
    reread: (id) => db.appointment.findUnique({ where: { id }, select: SHOW_RATE_SELECT }),
    hasOptedOut: (phone) => hasOptedOut(businessId, phone),
    hasNewerBooking: async (appt) =>
      (await db.appointment.count({
        where: {
          businessId,
          id: { not: appt.id },
          customerPhone: normalizeToE164(appt.customerPhone),
          createdAt: { gt: appt.createdAt },
          status: 'confirmed',
        },
      })) > 0,
    calendarState: (eventId) => getCalendarEventState(businessId, eventId),
    leadForPhone: (phone) =>
      db.websiteLead.findFirst({
        where: { businessId, phone: normalizeToE164(phone), calendarToken: { not: null } },
        orderBy: { createdAt: 'desc' },
        select: { calendarToken: true, otpVerifiedAt: true, createdAt: true, funnelVariant: true },
      }),
    send: async (to, text) => {
      const res = await telnyx.messages.send({ from: fromNumber, to, text })
      return (res as { data?: { id?: string } })?.data?.id ?? null
    },
    logOutbound: async (to, text, providerId) => {
      await logMarketingOutbound({ phone: to, body: text, telnyxSid: providerId, businessId, label: 'reminders' })
    },
  }
}

/** The real side effects behind lib/outcome-capture-cron.ts. Only built when OUTCOME_PROMPT_SMS is on. */
function outcomeDeps(
  business: { id: string; ownerPhone: string | null; timezone: string | null },
  telnyx: Telnyx,
  fromNumber: string
): OutcomeDeps {
  const to = ownerNumber(business.ownerPhone)
  return {
    ownerTimeZone: business.timezone || OWNER_TIMEZONE,
    findRecent: (since, until) =>
      db.appointment.findMany({
        where: { businessId: business.id, scheduledAt: { gte: since, lte: until } },
        orderBy: { scheduledAt: 'asc' },
        take: 200,
        select: OUTCOME_SELECT,
      }),
    claim: async (id, expected, next) =>
      (await db.appointment.updateMany({ where: { id, notes: expected }, data: { notes: next } })).count,
    sendOwner: async (text) => {
      const res = await telnyx.messages.send({ from: fromNumber, to, text })
      return (res as { data?: { id?: string } })?.data?.id ?? null
    },
  }
}
