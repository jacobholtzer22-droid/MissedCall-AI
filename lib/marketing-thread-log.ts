// ===========================================
// DEMO-LINE OUTBOUND LOG
// ===========================================
// Every automated text the /book funnel sends used to leave nothing behind but
// a timestamp column and a log line. When a prospect replied, the alert could
// show what they said and nothing about what we had said to them.
//
// This module is the one door those sends log through. It writes an outbound
// Message on the same Conversation the inbound branch of the SMS webhook uses
// (app/api/webhooks/sms/route.ts), so one person is one thread containing both
// halves of the exchange — and /admin/marketing-threads shows it whole.
//
// SCOPE: the marketing business only. Nothing here is reachable from a client
// tenant's number; every function resolves the marketing business itself and
// queries with that id.

import { db } from '@/lib/db'
import { getMarketingBusiness } from '@/lib/marketing-funnel'
import { normalizeToE164 } from '@/lib/phone-utils'
import { bookerWhen } from '@/lib/booker-time'

/**
 * Which automated send this was. Used only by the fallback below, which has
 * timestamps but no bodies: rows written before this module existed, and sends
 * whose Message write lost its race with a cold start.
 */
export type AutomatedSendKind =
  | 'otp'
  | 'lead'
  | 'follow_up'
  | 'confirmation'
  | 'reminder_night_before'
  | 'reminder_hour_before'

const KIND_LABELS: Record<AutomatedSendKind, string> = {
  otp: 'verification code',
  lead: 'lead text',
  follow_up: '24h follow-up',
  confirmation: 'booking confirmation',
  reminder_night_before: 'night-before reminder',
  reminder_hour_before: 'hour-before reminder',
}

/**
 * The OTP code never reaches the database.
 *
 * The body is the one thing worth logging for every other send, and the one
 * thing that must not be logged for this one: a live code sitting in a Message
 * row is readable by anyone with dashboard access for as long as the row lives.
 * The placeholder still answers the question the alert is asking — "what did we
 * last send this person" — without carrying the secret.
 */
export const OTP_LOG_PLACEHOLDER = '[verification code sent]'

/**
 * Log one outbound automated text onto the person's demo-line thread.
 *
 * CONTRACT — call this only AFTER telnyx.messages.send() has resolved, and
 * never await it in a way that can fail the send. It swallows every error on
 * purpose: a Message row that could not be written is a gap in Jacob's view,
 * while a throw here would abort a send that already went out, or worse, cause
 * a retry that texts the prospect twice.
 *
 * Returns true when a row was written, false when anything at all went wrong.
 */
export async function logMarketingOutbound(params: {
  phone: string
  body: string
  telnyxSid?: string | null
  /** Saves a lookup when the caller already holds the marketing business. */
  businessId?: string
  /** Prefixes the console line so a failure is traceable to its sender. */
  label: string
}): Promise<boolean> {
  try {
    const to = normalizeToE164(params.phone)
    if (!to) return false

    const businessId = params.businessId ?? (await getMarketingBusiness())?.id
    if (!businessId) return false

    // Find-or-create mirrors the inbound branch of the SMS webhook exactly, so
    // an automated send and a later reply land on the same row. Two concurrent
    // sends to one person could both create a thread; sends to one prospect are
    // sequential in every path here, and a duplicate thread is cosmetic.
    const existing = await db.conversation.findFirst({
      where: { businessId, callerPhone: to },
      orderBy: { lastMessageAt: 'desc' },
      select: { id: true },
    })
    const conversationId =
      existing?.id ??
      (
        await db.conversation.create({
          data: { businessId, callerPhone: to, status: 'active', lastMessageAt: new Date() },
          select: { id: true },
        })
      ).id

    await db.message.create({
      data: {
        conversationId,
        direction: 'outbound',
        content: params.body,
        telnyxSid: params.telnyxSid ?? null,
      },
    })
    await db.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date() },
    })
    return true
  } catch (err) {
    console.error(
      `[${params.label}] outbound log FAILED (text was sent): ${err instanceof Error ? err.message : String(err)}`
    )
    return false
  }
}

// ── Reading it back, for the inbound alert ──────────────────────────────

export type LastOutbound = { body: string; sentAt: Date }
export type LastAutomatedFallback = { kind: AutomatedSendKind; label: string; sentAt: Date }

export type DemoThreadContext = {
  /** The real thing: a logged body. */
  lastOutbound: LastOutbound | null
  /** Timestamp-only reconstruction, used when no Message row exists. */
  fallback: LastAutomatedFallback | null
  /** Their next demo, ET. */
  demo: { scheduledAt: Date; whenEt: string } | null
}

/**
 * Everything the inbound alert needs about what we sent this person.
 *
 * Never throws: an alert missing context is better than an inbound that
 * produces no alert at all.
 */
export async function getDemoThreadContext(
  businessId: string,
  phone: string
): Promise<DemoThreadContext> {
  const empty: DemoThreadContext = { lastOutbound: null, fallback: null, demo: null }
  try {
    const to = normalizeToE164(phone)
    if (!to) return empty

    const [message, lead, appointment, upcoming] = await Promise.all([
      db.message.findFirst({
        where: {
          direction: 'outbound',
          conversation: { businessId, callerPhone: to },
        },
        orderBy: { createdAt: 'desc' },
        select: { content: true, createdAt: true },
      }),
      db.websiteLead.findFirst({
        where: { businessId, phone: to },
        orderBy: { createdAt: 'desc' },
        select: { demoSmsSentAt: true, followUpSentAt: true },
      }),
      db.appointment.findFirst({
        where: { businessId, customerPhone: to },
        orderBy: { createdAt: 'desc' },
        select: {
          createdAt: true,
          reminderNightBeforeSentAt: true,
          reminderHourBeforeSentAt: true,
        },
      }),
      db.appointment.findFirst({
        where: {
          businessId,
          customerPhone: to,
          status: { not: 'cancelled' },
          scheduledAt: { gt: new Date() },
        },
        orderBy: { scheduledAt: 'asc' },
        select: { scheduledAt: true },
      }),
    ])

    // The confirmation is not stamped anywhere of its own, so the booking's
    // createdAt stands in for it: the text goes out in the same request.
    const candidates: LastAutomatedFallback[] = []
    const add = (kind: AutomatedSendKind, at: Date | null | undefined) => {
      if (at) candidates.push({ kind, label: KIND_LABELS[kind], sentAt: at })
    }
    add('lead', lead?.demoSmsSentAt)
    add('follow_up', lead?.followUpSentAt)
    add('confirmation', appointment?.createdAt)
    add('reminder_night_before', appointment?.reminderNightBeforeSentAt)
    add('reminder_hour_before', appointment?.reminderHourBeforeSentAt)
    candidates.sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime())

    return {
      lastOutbound: message ? { body: message.content, sentAt: message.createdAt } : null,
      fallback: candidates[0] ?? null,
      demo: upcoming
        ? { scheduledAt: upcoming.scheduledAt, whenEt: formatDemoEt(upcoming.scheduledAt) }
        : null,
    }
  } catch (err) {
    console.error(
      `[marketing-reply] thread context FAILED: ${err instanceof Error ? err.message : String(err)}`
    )
    return empty
  }
}

/**
 * "Tuesday, Sep 22 at 4:00 PM EDT".
 *
 * Routed through bookerWhen with a null zone, which is the same ET path every
 * booker-facing message uses, so the alert can never drift from the texts. The
 * EDT/EST abbreviation is the ET label; it is not spelled out twice.
 */
export function formatDemoEt(scheduledAt: Date): string {
  const when = bookerWhen(scheduledAt, null)
  return `${when.dateLong} at ${when.time}`
}

/** "just now" / "14 min ago" / "3 hr ago" / "2 days ago" / an ET date. */
export function relativeAge(then: Date, now: Date = new Date()): string {
  const secs = Math.round((now.getTime() - then.getTime()) / 1000)
  if (secs < 0) return 'in the future'
  if (secs < 60) return 'just now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} hr ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`
  return formatDemoEt(then)
}
