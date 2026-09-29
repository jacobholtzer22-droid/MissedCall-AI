// ===========================================
// PLATFORM ALERTS: health alerts for the PLATFORM OWNER
// ===========================================
// When something a paying client depends on fails quietly (a text-back that
// never sent, an owner alert that reached nobody, a calendar that silently
// disconnected), a PlatformAlert row is written and one email goes to the
// platform owner. This is NOT a client-owner notification; those live in
// lib/notify-owner.ts.
//
// Three rules the rest of this file exists to keep:
//
//   1. An alert must never break the thing that raised it. raisePlatformAlert()
//      returns void immediately and cannot throw; the work runs after the
//      response through afterResponse() (waitUntil on Vercel). Outside a request
//      (a cron, a script) waitUntil is a no-op and the work is simply a floating
//      promise that catches its own errors.
//
//   2. Alerts are recorded far more often than they are emailed. The same
//      dedupeKey inside its throttle window is recorded but not re-sent, a storm
//      cap stops a platform-wide outage from sending hundreds of emails, and a
//      key that wrote a row in the last 10 minutes writes nothing at all, so one
//      failing hot path cannot flood the table.
//
//   3. Nothing sensitive is stored or emailed. Title, detail, metadata and the
//      dedupeKey all pass through the scrubber: phone numbers keep their last 4
//      digits only, bearer tokens and API-key-shaped strings are removed, and
//      metadata keys that could carry a message body or a credential are dropped.
//
// The email goes through the same path the two pre-existing owner alerts use
// (notifyOwnerOfMarketingEvent, recipient YOUR_EMAIL), so there is no new env var.

import { db } from '@/lib/db'
import { afterResponse } from '@/lib/after-response'
import { notifyOwnerOfMarketingEvent } from '@/lib/marketing-funnel'

// ── Types ────────────────────────────────────────────────────────────────

export type PlatformAlertSeverity = 'info' | 'warning' | 'critical'

export type PlatformAlertType =
  | 'sms_send_failed'
  | 'voice_webhook_error'
  | 'voice_call_ended'
  | 'owner_notify_failed'
  | 'owner_notify_none_delivered'
  | 'book_demo_failed'
  | 'calendar_disconnected'
  | 'calendar_refresh_error'
  | 'calendar_sync_failed'
  | 'alert_storm'
  | 'test'

export type PlatformAlertInput = {
  type: PlatformAlertType
  severity: PlatformAlertSeverity
  businessId?: string | null
  title: string
  detail: string
  metadata?: Record<string, unknown>
  dedupeKey: string
  /** How long the same dedupeKey stays quiet after an email. Defaults to 6. */
  throttleHours?: number
  /**
   * Whether this alert is worth an email. Defaults to TRUE, so every existing
   * builder is unaffected.
   *
   * false = record only: the PlatformAlert row is written exactly as usual and no
   * email is ever sent, at any severity and regardless of throttle state. For the
   * expected-but-worth-counting events, where the row is the whole point and an
   * inbox is the wrong place for it.
   *
   * Severity deliberately does NOT control this. 'info' still emails — the test
   * alert is 'info' and is meant to arrive in the inbox to prove the path works.
   */
  email?: boolean
}

// ── Tunables ─────────────────────────────────────────────────────────────

/** A failure that might clear on its own, or might be an outage: re-alert every 6 hours. */
export const THROTTLE_HOURS_DEFAULT = 6
/** A missing setting does not fix itself and does not get worse: once a day is enough. */
export const THROTTLE_HOURS_CONFIG = 24
/** At or above this many alert emails in the last hour, further emails are held back. */
export const STORM_EMAIL_CAP = 10
export const STORM_WINDOW_MINUTES = 60
export const STORM_DEDUPE_KEY = 'alert_storm'
/** A key that already wrote a row this recently writes nothing at all: at most 6 rows an hour per key. */
export const ROW_THROTTLE_MINUTES = 10

const MAX_TITLE = 160
const MAX_DETAIL = 2000
const MAX_ERROR = 400

// ── Scrubbing ────────────────────────────────────────────────────────────

/** "+15551234567" / "(555) 123-4567" / "555.123.4567" -> "***4567". */
function maskPhoneMatch(match: string): string {
  const digits = match.replace(/\D/g, '')
  return `***${digits.slice(-4)}`
}

/**
 * Remove anything sensitive from free text. Deliberately narrow patterns: a
 * date ("2026-09-19") or a cuid must survive, a phone number must not.
 */
export function scrubText(input: string): string {
  return String(input)
    // Credentials first, so a digit run inside a token is not half-masked.
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    // Underscore-prefixed keys only ("re_", "sk_live_"): a hyphen would also
    // swallow ordinary words like "re-authentication-required".
    .replace(/\b(?:sk|pk|rk|re|whsec)_[A-Za-z0-9_-]{12,}/g, '[redacted-key]')
    .replace(/\bsk-ant-[A-Za-z0-9_-]{12,}/g, '[redacted-key]')
    .replace(/\bKEY[A-Za-z0-9]{16,}/g, '[redacted-key]')
    // US-formatted phone numbers, with or without a +1 / 1 prefix.
    .replace(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g, maskPhoneMatch)
    // Any bare run of 10+ digits (E.164 without separators, and anything else that long).
    .replace(/\+?\d{10,}/g, maskPhoneMatch)
}

/** Keys whose values could be a message body or a credential. Dropped, never scrubbed. */
const DROPPED_METADATA_KEY = /token|secret|password|authorization|api[-_]?key|^body$|^content$|^text$|^html$|messagebody|^message$|transcript/i

export function scrubMetadata(value: unknown, depth = 0): unknown {
  if (value == null) return value
  if (depth > 4) return '[truncated]'
  if (typeof value === 'string') return scrubText(value).slice(0, MAX_ERROR)
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => scrubMetadata(v, depth + 1))
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (DROPPED_METADATA_KEY.test(k)) continue
      out[k] = scrubMetadata(v, depth + 1)
    }
    return out
  }
  return String(value)
}

/** Last 4 digits of a phone, for metadata. Never pass a full number to an alert. */
export function last4(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '')
  return digits.length >= 4 ? digits.slice(-4) : null
}

/** A short, scrubbed, single-line description of whatever was thrown. */
export function describeError(err: unknown): string {
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : safeJson(err)
  return scrubText(raw).replace(/\s+/g, ' ').trim().slice(0, MAX_ERROR)
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

/**
 * Turn an error message into something stable enough to throttle on. A per-call
 * id or a timestamp inside the message must not make every occurrence look new:
 * digit runs become "#", any token of 20+ characters becomes "*", first 40 chars.
 */
export function normalizeForDedupe(message: string): string {
  return String(message)
    .replace(/\d+/g, '#')
    .replace(/\S{20,}/g, '*')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40)
}

/** Everything that leaves this module (row or email) has been through here. */
export function sanitizeAlert(input: PlatformAlertInput): Required<Omit<PlatformAlertInput, 'businessId' | 'metadata'>> & {
  businessId: string | null
  metadata: Record<string, unknown>
} {
  const hours = Number(input.throttleHours)
  return {
    type: input.type,
    severity: input.severity,
    businessId: input.businessId ?? null,
    title: scrubText(input.title).slice(0, MAX_TITLE),
    detail: scrubText(input.detail).slice(0, MAX_DETAIL),
    metadata: (scrubMetadata(input.metadata ?? {}) as Record<string, unknown>) ?? {},
    dedupeKey: scrubText(input.dedupeKey).slice(0, 200),
    throttleHours: Number.isFinite(hours) && hours > 0 ? hours : THROTTLE_HOURS_DEFAULT,
    // Opt out, never opt in: anything but an explicit false emails as before.
    email: input.email !== false,
  }
}

// ── Alert builders: one per type ─────────────────────────────────────────
// Pure. Each returns the full input for raisePlatformAlert, so the type,
// severity, dedupeKey and throttle window for an alert are decided in exactly
// one place and can be tested without a database.

type BusinessRef = { id: string; name?: string | null }
const label = (b: BusinessRef) => (b.name?.trim() ? b.name.trim() : b.id)

/** 1. A text-back or AI reply failed at send time (the Telnyx call threw). */
export function buildSmsSendFailedAlert(p: {
  business: BusinessRef
  path: 'missed_call' | 'ai_reply'
  error: unknown
  toPhone?: string | null
  conversationId?: string | null
}): PlatformAlertInput {
  const what = p.path === 'missed_call' ? 'Missed-call text-back' : 'AI reply'
  return {
    type: 'sms_send_failed',
    severity: 'critical',
    businessId: p.business.id,
    title: `${what} failed to send for ${label(p.business)}`,
    detail:
      `${what} could not be sent: the Telnyx send call failed, so the customer received nothing ` +
      `and no Message row exists for it.\n\nError: ${describeError(p.error)}`,
    metadata: { path: p.path, toLast4: last4(p.toPhone), conversationId: p.conversationId ?? null, error: describeError(p.error) },
    // Per business and path, NOT per phone: a Telnyx outage is one email, not one per caller.
    dedupeKey: `sms_send_failed:${p.business.id}:${p.path}`,
    throttleHours: THROTTLE_HOURS_DEFAULT,
  }
}

/** 2. The voice webhook handler threw. It still returned 200, so Telnyx will not retry. */
export function buildVoiceWebhookErrorAlert(p: { error: unknown }): PlatformAlertInput {
  const name = p.error instanceof Error ? p.error.name : 'Error'
  const message = p.error instanceof Error ? p.error.message : String(p.error)
  return {
    type: 'voice_webhook_error',
    severity: 'critical',
    businessId: null,
    title: 'Voice webhook handler threw',
    detail:
      `The voice webhook caught an exception and returned 200, so Telnyx will not retry this event. ` +
      `A call may have gone unanswered or been left mid-flow.\n\nError: ${describeError(p.error)}`,
    metadata: { errorName: name, error: describeError(p.error) },
    dedupeKey: `voice_webhook_error:${name}:${normalizeForDedupe(message)}`,
    throttleHours: THROTTLE_HOURS_DEFAULT,
  }
}

/**
 * 2b. The voice webhook aborted because the caller had already hung up (Telnyx 90018).
 *
 * Expected, unavoidable, and not actionable: every call-control command races the
 * caller putting the phone down. It is NOT a platform failure and must never email —
 * it was drowning the real voice_webhook_error alert at 6-hour throttle. Recorded so
 * the rate stays visible in PlatformAlert, where a sudden jump is still a signal.
 *
 * NOTE: ROW_THROTTLE_MINUTES caps this at one row per 10 minutes, so these rows are a
 * SAMPLE, not a count. Treat a run of them as "this is happening", never as "this many
 * times".
 */
export function buildVoiceCallEndedAlert(p: { error: unknown }): PlatformAlertInput {
  return {
    type: 'voice_call_ended',
    severity: 'info',
    businessId: null,
    title: 'Voice webhook aborted: call had already ended',
    detail:
      `A Telnyx call-control command was rejected with 90018 ("call has already ended") on a path ` +
      `that does not wrap it, so the webhook handler unwound. The caller hung up; nothing is broken ` +
      `and nothing is retryable.\n\nError: ${describeError(p.error)}`,
    metadata: { error: describeError(p.error) },
    // One key: this is a rate signal, not a per-call record.
    dedupeKey: 'voice_call_ended',
    email: false,
  }
}

/** 4. /api/book-demo could not email the request, could not store it, or both. */
export function buildBookDemoFailedAlert(p: { stage: 'email' | 'persist' | 'both'; error: unknown; leadId?: string | null }): PlatformAlertInput {
  const what =
    p.stage === 'both'
      ? 'A demo request was neither emailed nor saved. It is lost.'
      : p.stage === 'email'
        ? 'A demo request was saved as a lead but the email to you failed.'
        : 'A demo request was emailed to you but could not be saved as a lead.'
  return {
    type: 'book_demo_failed',
    severity: 'critical',
    businessId: null,
    title: `Demo request ${p.stage === 'both' ? 'lost' : `${p.stage} failed`}`,
    detail: `${what}\n\nError: ${describeError(p.error)}`,
    metadata: { stage: p.stage, leadId: p.leadId ?? null, error: describeError(p.error) },
    dedupeKey: `book_demo_failed:${p.stage}`,
    throttleHours: THROTTLE_HOURS_DEFAULT,
  }
}

/** Which part of a demo request failed, or null when both the save and the email worked. */
export function bookDemoFailureStage(p: { emailOk: boolean; persistOk: boolean }): 'email' | 'persist' | 'both' | null {
  if (p.emailOk && p.persistOk) return null
  if (!p.emailOk && !p.persistOk) return 'both'
  return p.emailOk ? 'persist' : 'email'
}

/** 5a. A definitive auth failure disconnected a business's Google Calendar. */
export function buildCalendarDisconnectedAlert(p: { businessId: string; error: unknown }): PlatformAlertInput {
  return {
    type: 'calendar_disconnected',
    severity: 'critical',
    businessId: p.businessId,
    title: 'Google Calendar disconnected',
    detail:
      `Google rejected the stored refresh token (invalid_grant), so the business was marked disconnected. ` +
      `Its booking page now offers no times and the SMS assistant has dropped to lead capture. ` +
      `The owner has to reconnect Google Calendar.\n\nError: ${describeError(p.error)}`,
    metadata: { error: describeError(p.error) },
    dedupeKey: `calendar_disconnected:${p.businessId}`,
    throttleHours: THROTTLE_HOURS_CONFIG,
  }
}

/** 5b. A token refresh failed for a reason that is NOT a revoked grant. Calendar stays connected. */
export function buildCalendarRefreshErrorAlert(p: { businessId: string; error: unknown }): PlatformAlertInput {
  return {
    type: 'calendar_refresh_error',
    severity: 'warning',
    businessId: p.businessId,
    title: 'Google token refresh failed (calendar left connected)',
    detail:
      `A Google token refresh failed with something other than invalid_grant (network, timeout, 5xx, ` +
      `rate limit, or a platform credential problem). The calendar was NOT disconnected; this request ` +
      `failed and the next one will try again.\n\nError: ${describeError(p.error)}`,
    metadata: { error: describeError(p.error) },
    dedupeKey: `calendar_refresh_error:${p.businessId}`,
    throttleHours: THROTTLE_HOURS_DEFAULT,
  }
}

/** 6. A booking was saved but its Google Calendar event could not be created. */
export function buildCalendarSyncFailedAlert(p: { business: BusinessRef; appointmentId: string; error: unknown }): PlatformAlertInput {
  return {
    type: 'calendar_sync_failed',
    severity: 'warning',
    businessId: p.business.id,
    title: `Booking saved without a calendar event for ${label(p.business)}`,
    detail:
      `An appointment was saved with calendarSyncFailed = true: the customer is booked, but the job is ` +
      `not on the owner's Google Calendar.\n\nError: ${describeError(p.error)}`,
    metadata: { appointmentId: p.appointmentId, error: describeError(p.error) },
    dedupeKey: `calendar_sync_failed:${p.business.id}`,
    throttleHours: THROTTLE_HOURS_DEFAULT,
  }
}

/** Storm notice: emails were held back because too many went out in the last hour. */
export function buildAlertStormAlert(p: { suppressedCount: number }): PlatformAlertInput {
  return {
    type: 'alert_storm',
    severity: 'critical',
    businessId: null,
    title: `Alert storm: ${p.suppressedCount} alert email${p.suppressedCount === 1 ? '' : 's'} held back`,
    detail:
      `${STORM_EMAIL_CAP} or more platform alert emails went out in the last ${STORM_WINDOW_MINUTES} minutes, ` +
      `so further emails are being held back. ${p.suppressedCount} alert${p.suppressedCount === 1 ? ' was' : 's were'} ` +
      `recorded without an email in that window. Every one of them is in the PlatformAlert table.`,
    metadata: { suppressedCount: p.suppressedCount },
    dedupeKey: STORM_DEDUPE_KEY,
    throttleHours: STORM_WINDOW_MINUTES / 60,
  }
}

/** Manual test alert from POST /api/admin/alerts/test. Never throttled against a previous test. */
export function buildTestAlert(p: { nonce: string }): PlatformAlertInput {
  return {
    type: 'test',
    severity: 'info',
    businessId: null,
    title: 'Test alert',
    detail: 'This is a test alert raised from the admin test route. If you are reading it in your inbox, the alert path works end to end.',
    metadata: { nonce: p.nonce },
    dedupeKey: `test:${p.nonce}`,
    throttleHours: THROTTLE_HOURS_DEFAULT,
  }
}

// ── 3. Owner notification outcome ────────────────────────────────────────

export type OwnerNotifyReason = 'no_recipient' | 'no_sender' | 'no_owner_email' | 'send_error'

export type OwnerNotifyChannelOutcome = {
  /** The business has this channel switched on (notifyBySms / notifyByEmail). */
  enabled: boolean
  delivered: boolean
  reason?: OwnerNotifyReason
  error?: string
}

export type OwnerNotifyOutcome = { sms: OwnerNotifyChannelOutcome; email: OwnerNotifyChannelOutcome }

/** A fresh outcome for a notifier to fill in: nothing enabled, nothing delivered. */
export function newOwnerNotifyOutcome(): OwnerNotifyOutcome {
  return { sms: { enabled: false, delivered: false }, email: { enabled: false, delivered: false } }
}

const CONFIG_REASONS: ReadonlySet<OwnerNotifyReason> = new Set<OwnerNotifyReason>(['no_recipient', 'no_sender', 'no_owner_email'])
const isConfigReason = (r?: OwnerNotifyReason) => Boolean(r && CONFIG_REASONS.has(r))

/**
 * Decide whether an owner notification's outcome is worth an alert.
 *
 *   both channels switched off by setting   -> null (the owner chose silence)
 *   every enabled channel delivered         -> null
 *   nothing delivered, something enabled    -> critical owner_notify_none_delivered
 *   one delivered, another enabled one failed -> warning owner_notify_failed
 *
 * A missing setting throttles for 24 hours; a send error for 6. The reason class
 * is part of the "none delivered" key so a fresh send error is never hidden
 * behind a day-old "no owner phone on file" email.
 */
export function decideOwnerNotifyAlert(p: {
  business: BusinessRef
  /** Which notifier ran, e.g. "website_lead", "lead_captured", "voicemail". */
  notifier: string
  outcome: OwnerNotifyOutcome
}): PlatformAlertInput | null {
  const { sms, email } = p.outcome
  if (!sms.enabled && !email.enabled) return null

  const channels = [
    { name: 'sms' as const, o: sms },
    { name: 'email' as const, o: email },
  ].filter((c) => c.o.enabled)

  const failed = channels.filter((c) => !c.o.delivered)
  if (failed.length === 0) return null

  const reasons = failed.map((c) => `${c.name}: ${c.o.reason ?? 'send_error'}${c.o.error ? ` (${describeError(c.o.error)})` : ''}`)
  const allConfig = failed.every((c) => isConfigReason(c.o.reason))
  const metadata = {
    notifier: p.notifier,
    sms: { enabled: sms.enabled, delivered: sms.delivered, reason: sms.reason ?? null },
    email: { enabled: email.enabled, delivered: email.delivered, reason: email.reason ?? null },
  }

  if (failed.length === channels.length) {
    return {
      type: 'owner_notify_none_delivered',
      severity: 'critical',
      businessId: p.business.id,
      title: `Owner of ${label(p.business)} was NOT notified (${p.notifier})`,
      detail:
        `An owner notification (${p.notifier}) reached nobody. Every channel the business has switched on failed:\n` +
        reasons.map((r) => `  - ${r}`).join('\n') +
        `\n\nThe lead or booking itself is saved; the owner just does not know about it.`,
      metadata,
      dedupeKey: `owner_notify_none:${p.business.id}:${allConfig ? 'config' : 'send'}`,
      throttleHours: allConfig ? THROTTLE_HOURS_CONFIG : THROTTLE_HOURS_DEFAULT,
    }
  }

  // Exactly one enabled channel failed while another delivered.
  const f = failed[0]
  const reason: OwnerNotifyReason = f.o.reason ?? 'send_error'
  return {
    type: 'owner_notify_failed',
    severity: 'warning',
    businessId: p.business.id,
    title: `Owner ${f.name} alert failed for ${label(p.business)} (${reason})`,
    detail:
      `An owner notification (${p.notifier}) was delivered on one channel but failed on another:\n` +
      reasons.map((r) => `  - ${r}`).join('\n'),
    metadata,
    dedupeKey: `owner_notify:${p.business.id}:${f.name}:${reason}`,
    throttleHours: isConfigReason(reason) ? THROTTLE_HOURS_CONFIG : THROTTLE_HOURS_DEFAULT,
  }
}

/**
 * An owner notifier THREW instead of returning. Its per-channel outcome is unknown,
 * so this is reported as "nothing delivered" under the same key a send failure uses.
 */
export function buildOwnerNotifyThrewAlert(p: { business: BusinessRef; notifier: string; error: unknown }): PlatformAlertInput {
  return {
    type: 'owner_notify_none_delivered',
    severity: 'critical',
    businessId: p.business.id,
    title: `Owner of ${label(p.business)} was NOT notified (${p.notifier} threw)`,
    detail:
      `The owner notifier (${p.notifier}) threw before reporting what it delivered, so assume the owner ` +
      `was told nothing. The lead or booking itself is saved.\n\nError: ${describeError(p.error)}`,
    metadata: { notifier: p.notifier, threw: true, error: describeError(p.error) },
    dedupeKey: `owner_notify_none:${p.business.id}:send`,
    throttleHours: THROTTLE_HOURS_DEFAULT,
  }
}

// ── 5. Google auth failure classification ────────────────────────────────

/**
 * True only when Google has definitively rejected the stored refresh token.
 *
 * google-auth-library throws a GaxiosError whose response body is
 * { error: 'invalid_grant', error_description: '...' } and whose message is
 * 'invalid_grant'. In the ReAuth case the library overwrites message with
 * JSON.stringify(response.data), so the body is checked first and the message
 * second (plain, then as JSON).
 *
 * Everything else is treated as transient and must NOT disconnect a calendar:
 * a network error (no response at all, a `code` like ECONNRESET), a timeout, a
 * 5xx, a 429. invalid_client / unauthorized_client are deliberately excluded
 * too: those mean the PLATFORM's OAuth credentials are wrong, and disconnecting
 * on them would disconnect every client at once.
 */
export function isDefinitiveAuthFailure(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const e = error as { message?: unknown; response?: { data?: unknown } }

  const data = e.response?.data
  if (data && typeof data === 'object' && (data as { error?: unknown }).error === 'invalid_grant') return true
  if (typeof data === 'string' && parsedErrorField(data) === 'invalid_grant') return true

  if (typeof e.message === 'string') {
    if (e.message === 'invalid_grant') return true
    if (parsedErrorField(e.message) === 'invalid_grant') return true
  }
  return false
}

function parsedErrorField(text: string): unknown {
  if (!text.trim().startsWith('{')) return undefined
  try {
    return (JSON.parse(text) as { error?: unknown }).error
  } catch {
    return undefined
  }
}

// ── Processing (throttle, storm cap, write, email) ───────────────────────

export type PlatformAlertDeps = {
  now: () => Date
  /**
   * One lookup, used by both throttles: among rows for this dedupeKey created since `since`,
   * when was the newest one written, and when was the newest email sent? null = none.
   */
  recentForKey: (dedupeKey: string, since: Date) => Promise<{ lastCreatedAt: Date | null; lastEmailedAt: Date | null }>
  /** How many alert emails (storm notices excluded) went out since `since`? */
  countEmailedSince: (since: Date) => Promise<number>
  /** How many alerts were recorded without an email because of the storm cap since `since`? */
  countStormSuppressedSince: (since: Date) => Promise<number>
  createAlert: (row: {
    type: string
    severity: string
    businessId: string | null
    title: string
    detail: string
    metadata: Record<string, unknown>
    dedupeKey: string
  }) => Promise<{ id: string }>
  markEmailed: (id: string, at: Date) => Promise<void>
  /** Resolves true only when the email actually went out. Must not throw. */
  sendEmail: (subject: string, html: string) => Promise<boolean>
}

export type PlatformAlertResult = {
  alertId: string | null
  emailed: boolean
  skipped: 'row_throttled' | 'record_only' | 'throttled' | 'storm' | 'send_failed' | null
  stormNoticeSent: boolean
}

export function alertEmailSubject(a: { severity: string; title: string }): string {
  return `[PLATFORM ALERT] ${a.severity}: ${a.title}`
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function alertEmailHtml(a: {
  type: string
  severity: string
  businessId: string | null
  title: string
  detail: string
  metadata: Record<string, unknown>
  dedupeKey: string
  throttleHours: number
}, at: Date): string {
  return `
    <h2>${escapeHtml(a.title)}</h2>
    <p><strong>Severity:</strong> ${escapeHtml(a.severity)} &nbsp; <strong>Type:</strong> ${escapeHtml(a.type)}</p>
    <p><strong>Business:</strong> ${escapeHtml(a.businessId ?? 'none (platform-wide)')}</p>
    <pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(a.detail)}</pre>
    <hr />
    <p style="color:#666;font-size:13px">
      <strong>Details:</strong> ${escapeHtml(safeJson(a.metadata))}<br />
      <strong>Time:</strong> ${escapeHtml(at.toISOString())}<br />
      <strong>Key:</strong> ${escapeHtml(a.dedupeKey)}.
      Repeats of this key are recorded but not emailed again for ${a.throttleHours} hour${a.throttleHours === 1 ? '' : 's'}.
    </p>`
}

// If the database is unreachable the throttle cannot be read. Without a fallback
// every failing request would email; with this, each instance sends a given key
// once per window and nothing more until the database is back.
const memoryThrottle = new Map<string, number>()
function memoryAllows(key: string, windowMs: number, nowMs: number): boolean {
  const last = memoryThrottle.get(key)
  if (last !== undefined && nowMs - last < windowMs) return false
  if (memoryThrottle.size > 500) memoryThrottle.clear()
  memoryThrottle.set(key, nowMs)
  return true
}
/** Test hook. */
export function _resetMemoryThrottle(): void {
  memoryThrottle.clear()
}

/**
 * The whole alert pipeline with its dependencies injected, so the throttle, the
 * storm cap and the never-throws guarantee can be tested with no database and
 * no email. Never rejects: every dependency call is individually guarded.
 */
export async function processPlatformAlert(input: PlatformAlertInput, deps: PlatformAlertDeps): Promise<PlatformAlertResult> {
  const result: PlatformAlertResult = { alertId: null, emailed: false, skipped: null, stormNoticeSent: false }
  try {
    const a = sanitizeAlert(input)
    const now = deps.now()
    const windowMs = a.throttleHours * 3_600_000

    // 1. Throttle on the dedupeKey. One lookup answers both questions: was a row written
    //    in the last few minutes (then write nothing), and was an email sent inside this
    //    alert's window (then write the row, skip the email).
    const rowWindowMs = ROW_THROTTLE_MINUTES * 60_000
    let throttled: boolean
    try {
      const recent = await deps.recentForKey(a.dedupeKey, new Date(now.getTime() - Math.max(windowMs, rowWindowMs)))
      if (recent.lastCreatedAt && now.getTime() - recent.lastCreatedAt.getTime() < rowWindowMs) {
        result.skipped = 'row_throttled'
        console.log(`[platform-alert] not recorded (same key within ${ROW_THROTTLE_MINUTES} min) type=${a.type} key=${a.dedupeKey}`)
        return result
      }
      throttled = Boolean(recent.lastEmailedAt && now.getTime() - recent.lastEmailedAt.getTime() < windowMs)
    } catch (err) {
      console.error('[platform-alert] throttle check failed, using in-memory fallback:', describeError(err))
      throttled = !memoryAllows(a.dedupeKey, windowMs, now.getTime())
    }

    // 2. Storm cap. A storm notice is never itself capped. A record-only alert
    //    never reaches the email step, so it is not counted or capped either.
    let stormCapped = false
    if (a.email && !throttled && a.type !== 'alert_storm') {
      try {
        const sent = await deps.countEmailedSince(new Date(now.getTime() - STORM_WINDOW_MINUTES * 60_000))
        stormCapped = sent >= STORM_EMAIL_CAP
      } catch (err) {
        console.error('[platform-alert] storm count failed, not capping:', describeError(err))
      }
    }

    const emailSkipped = !a.email ? 'record_only' : throttled ? 'throttled' : stormCapped ? 'storm' : null

    // 3. The row is written whatever happens to the email.
    try {
      const row = await deps.createAlert({
        type: a.type,
        severity: a.severity,
        businessId: a.businessId,
        title: a.title,
        detail: a.detail,
        metadata: emailSkipped ? { ...a.metadata, emailSkipped } : a.metadata,
        dedupeKey: a.dedupeKey,
      })
      result.alertId = row.id
    } catch (err) {
      // Loud, because at this point the email below is the only record.
      console.error(`[platform-alert] ROW NOT WRITTEN type=${a.type} key=${a.dedupeKey} error=${describeError(err)}`)
    }

    // 4. The email.
    if (!emailSkipped) {
      let sent = false
      try {
        sent = await deps.sendEmail(alertEmailSubject(a), alertEmailHtml(a, now))
      } catch (err) {
        console.error(`[platform-alert] email threw type=${a.type} error=${describeError(err)}`)
      }
      if (sent) {
        result.emailed = true
        if (result.alertId) {
          try {
            await deps.markEmailed(result.alertId, now)
          } catch (err) {
            console.error(`[platform-alert] could not stamp emailedAt id=${result.alertId} error=${describeError(err)}`)
          }
        }
      } else {
        result.skipped = 'send_failed'
        console.error(`[platform-alert] EMAIL NOT SENT type=${a.type} key=${a.dedupeKey} (row ${result.alertId ?? 'not written'})`)
      }
    } else {
      result.skipped = emailSkipped
      console.log(`[platform-alert] recorded without email (${emailSkipped}) type=${a.type} key=${a.dedupeKey}`)
    }

    // 5. One storm notice per hour, carrying how many emails were held back.
    if (stormCapped) {
      result.stormNoticeSent = await sendStormNotice(deps, now)
    }
  } catch (err) {
    console.error('[platform-alert] unexpected failure (swallowed):', describeError(err))
  }
  return result
}

async function sendStormNotice(deps: PlatformAlertDeps, now: Date): Promise<boolean> {
  try {
    const since = new Date(now.getTime() - STORM_WINDOW_MINUTES * 60_000)
    if ((await deps.recentForKey(STORM_DEDUPE_KEY, since)).lastEmailedAt) return false
    const suppressedCount = await deps.countStormSuppressedSince(since)
    const storm = sanitizeAlert(buildAlertStormAlert({ suppressedCount }))
    const row = await deps.createAlert({
      type: storm.type,
      severity: storm.severity,
      businessId: null,
      title: storm.title,
      detail: storm.detail,
      metadata: storm.metadata,
      dedupeKey: storm.dedupeKey,
    })
    const sent = await deps.sendEmail(alertEmailSubject(storm), alertEmailHtml(storm, now))
    if (sent) await deps.markEmailed(row.id, now)
    return sent
  } catch (err) {
    console.error('[platform-alert] storm notice failed (swallowed):', describeError(err))
    return false
  }
}

// ── Production wiring ────────────────────────────────────────────────────

const liveDeps: PlatformAlertDeps = {
  now: () => new Date(),
  // emailedAt is stamped moments after createdAt, so "created since" also bounds "emailed since".
  recentForKey: async (dedupeKey, since) => {
    const agg = await db.platformAlert.aggregate({
      where: { dedupeKey, createdAt: { gte: since } },
      _max: { createdAt: true, emailedAt: true },
    })
    return { lastCreatedAt: agg._max.createdAt, lastEmailedAt: agg._max.emailedAt }
  },
  countEmailedSince: async (since) =>
    db.platformAlert.count({ where: { emailedAt: { gte: since }, type: { not: 'alert_storm' } } }),
  countStormSuppressedSince: async (since) =>
    db.platformAlert.count({
      where: { createdAt: { gte: since }, emailedAt: null, metadata: { path: ['emailSkipped'], equals: 'storm' } },
    }),
  createAlert: async (row) =>
    db.platformAlert.create({
      data: { ...row, metadata: row.metadata as object },
      select: { id: true },
    }),
  markEmailed: async (id, at) => {
    await db.platformAlert.update({ where: { id }, data: { emailedAt: at } })
  },
  // Email only: with no smsText, notifyOwnerOfMarketingEvent sends no text. It
  // never throws and reports what happened, which is what decides emailedAt.
  sendEmail: async (subject, html) => (await notifyOwnerOfMarketingEvent({ subject, html })).email === 'sent',
}

/**
 * Raise a platform alert. Returns immediately, never throws, and never delays
 * the caller: safe to call from a webhook's catch block right before it returns.
 *
 *   void-returning on purpose. Do not await it; there is nothing to await.
 */
export function raisePlatformAlert(input: PlatformAlertInput): void {
  try {
    afterResponse('platform-alert', input?.type ?? 'unknown', () => processPlatformAlert(input, liveDeps))
  } catch (err) {
    // afterResponse does not throw, but "never throws" should not depend on that.
    console.error('[platform-alert] could not schedule alert (swallowed):', describeError(err))
  }
}

/**
 * Same pipeline, awaited, returning what happened. For the admin test route
 * only, where the caller wants to see "row written, email sent" in the
 * response. Never rejects. Request paths use raisePlatformAlert() above.
 */
export function raisePlatformAlertAndReport(input: PlatformAlertInput): Promise<PlatformAlertResult> {
  return processPlatformAlert(input, liveDeps)
}
