// ===========================================
// CRON: /book DEMO CALL REMINDERS
// ===========================================
// Runs every 15 minutes (vercel.json). Sends two English reminder texts for
// Align and Acquire demo calls booked through the /book marketing funnel:
//
//   1. Night before, 6:30 PM Eastern. Skipped when the call was booked the same
//      day it happens (they just booked it, they do not need a reminder tonight).
//   2. One hour before.
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

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const TIMEZONE = 'America/New_York'
const NIGHT_BEFORE_HOUR = 18
const NIGHT_BEFORE_MINUTE = 30
const HOUR_BEFORE_MS = 60 * 60 * 1000

// If a cron run is missed, do not fire a stale night-before text hours late.
const NIGHT_BEFORE_GRACE_MS = 12 * 60 * 60 * 1000

// Consent marker written by /api/marketing-bookings at creation time.
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

function sameDayInTz(a: Date, b: Date): boolean {
  const ta = new TZDate(a, TIMEZONE)
  const tb = new TZDate(b, TIMEZONE)
  return (
    ta.getFullYear() === tb.getFullYear() &&
    ta.getMonth() === tb.getMonth() &&
    ta.getDate() === tb.getDate()
  )
}

/** 6:30 PM Eastern on the calendar day before the appointment. DST-correct via TZDate. */
function nightBeforeDueAt(scheduledAt: Date): Date {
  const sched = new TZDate(scheduledAt, TIMEZONE)
  return new Date(
    new TZDate(
      sched.getFullYear(),
      sched.getMonth(),
      sched.getDate() - 1,
      NIGHT_BEFORE_HOUR,
      NIGHT_BEFORE_MINUTE,
      0,
      0,
      TIMEZONE
    ).getTime()
  )
}

function formatWhen(scheduledAt: Date): { dateLabel: string; timeLabel: string } {
  return {
    dateLabel: scheduledAt.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      timeZone: TIMEZONE,
    }),
    timeLabel: scheduledAt.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: TIMEZONE,
    }),
  }
}

function reminderText(kind: ReminderKind, name: string, scheduledAt: Date): string {
  const first = name.trim().split(/\s+/)[0] || 'there'
  const { dateLabel, timeLabel } = formatWhen(scheduledAt)
  if (kind === 'night_before') {
    return `Hi ${first}, this is Jacob with Align and Acquire. Reminder: our demo call is ${dateLabel} at ${timeLabel} ET. I will call your business line and you will watch the text back come in. Reply STOP to opt out.`
  }
  return `Hi ${first}, Jacob here. Our demo call is in about an hour, at ${timeLabel} ET. I will call your business line, let it ring, and you will see the text back land. Reply STOP to opt out.`
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

  const now = new Date()
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

    // Decide which single reminder, if any, is due right now.
    let kind: ReminderKind | null = null
    if (msUntil > 0 && msUntil <= HOUR_BEFORE_MS && !appt.reminderHourBeforeSentAt) {
      kind = 'hour_before'
    } else if (!appt.reminderNightBeforeSentAt) {
      const bookedSameDay = sameDayInTz(appt.createdAt, appt.scheduledAt)
      if (bookedSameDay) {
        result.skipped.push({ id: appt.id, reason: 'booked same day, night-before not applicable' })
      } else {
        const due = nightBeforeDueAt(appt.scheduledAt).getTime()
        const overdueBy = now.getTime() - due
        if (overdueBy >= 0 && overdueBy <= NIGHT_BEFORE_GRACE_MS && msUntil > HOUR_BEFORE_MS) {
          kind = 'night_before'
        }
      }
    }

    if (!kind) continue

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

    const to = normalizeToE164(appt.customerPhone)
    const text = reminderText(kind, appt.customerName, appt.scheduledAt)

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
