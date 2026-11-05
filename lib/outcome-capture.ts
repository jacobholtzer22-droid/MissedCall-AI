// ===========================================
// /book SHOW-RATE: OUTCOME CAPTURE BY TEXT (OUTCOME_PROMPT_SMS)
// ===========================================
// Jacob marks whether a demo call happened by answering a text instead of
// opening /admin/pipeline. Pure: no DB, no clock, no sends. The reminder cron
// (lib/outcome-capture-cron.ts) sends one prompt per call and one 6 PM list;
// the SMS webhook (lib/outcome-capture-reply.ts) reads his reply and writes
// Appointment.showStatus, the same column the pipeline's one-tap buttons write.
//
// Off unless OUTCOME_PROMPT_SMS === 'true'. State is marker lines on
// Appointment.notes, the show-rate layer's pattern (lib/show-rate.ts): each
// marker is claimed with a conditional update on the exact notes value read.
//
//   "Outcome prompt sent: <ISO>"           one prompt per booking, 30 min after
//                                          the call ends, inside 6h
//   "Outcome digest sent: <ISO> <letter>"  the booking was on a 6 PM list (or a
//                                          "Which one?" list) under that letter
//   "Outcome by reply: <status> <ISO>"     Jacob's reply set showStatus
//
// Replies: "1" showed, "2" no-show, "3" moved (the booking reads as cancelled,
// which show rate leaves out). A bare digit answers the most recent prompt;
// "A1 B2" answers a list by its letters. The words showed / yes / no / no show /
// moved / rescheduled work as a whole message.

import { localHour, sameDayInTz } from '@/lib/demo-reminder-schedule'
import { OWNER_TIMEZONE } from '@/lib/booker-time'
import { callEnd, hasMarker, markerTime, type ShowRateAppointment, type ShowRateDecision } from '@/lib/show-rate'

export function outcomeCaptureEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.OUTCOME_PROMPT_SMS === 'true'
}

// -------------------------------------------
// Markers and timing
// -------------------------------------------

export const OUTCOME_PROMPT_SENT_MARKER = 'Outcome prompt sent:'
export const OUTCOME_DIGEST_SENT_MARKER = 'Outcome digest sent:'
export const OUTCOME_BY_REPLY_MARKER = 'Outcome by reply:'

/** The prompt goes this long after the call's end time. */
export const PROMPT_DELAY_MS = 30 * 60 * 1000
/** No prompt for a call that ended longer ago than this; the list carries it. */
export const PROMPT_MAX_AGE_MS = 6 * 60 * 60 * 1000
/** A booking prompted this recently stays off the list, so one call is not asked about twice in an hour. */
export const PROMPT_RECENT_MS = 60 * 60 * 1000
/** The list goes out on the first cron run at or after this hour, owner-local. */
export const DIGEST_HOUR = 18
/** The list and a reply reach back this far. */
export const DIGEST_MAX_AGE_MS = 36 * 60 * 60 * 1000
export const REPLY_MAX_AGE_MS = DIGEST_MAX_AGE_MS
/** No owner text outside these hours, owner-local. */
export const OWNER_HOURS_START = 7
export const OWNER_HOURS_END = 22

export type OutcomeAppointment = Pick<
  ShowRateAppointment,
  'id' | 'scheduledAt' | 'duration' | 'customerName' | 'notes' | 'status' | 'showStatus'
>

export type OutcomeStatus = 'showed' | 'no_show' | 'cancelled'

export const OUTCOME_BY_CODE: Record<string, OutcomeStatus> = { '1': 'showed', '2': 'no_show', '3': 'cancelled' }
export const OUTCOME_CODE: Record<OutcomeStatus, string> = { showed: '1', no_show: '2', cancelled: '3' }
export const OUTCOME_LABELS: Record<OutcomeStatus, string> = { showed: 'showed', no_show: 'no-show', cancelled: 'moved' }
/** Whole-message words that read as a code. */
export const OUTCOME_WORDS: Record<string, OutcomeStatus> = {
  showed: 'showed',
  yes: 'showed',
  no: 'no_show',
  noshow: 'no_show',
  'no show': 'no_show',
  moved: 'cancelled',
  rescheduled: 'cancelled',
}

/** List letters. I and O are left out so they cannot be read as 1 and 0. */
export const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'

const DEAD_STATUSES = ['cancelled', 'canceled', 'deleted']

/** 'confirmed' and 'completed' both count: GET /api/appointments flips past confirmed rows to completed. */
export function isLiveStatus(status: string | null | undefined): boolean {
  return !DEAD_STATUSES.includes((status ?? '').trim().toLowerCase())
}

export function isUnmarked(appt: Pick<OutcomeAppointment, 'status' | 'showStatus'>): boolean {
  return appt.showStatus === 'pending' && isLiveStatus(appt.status)
}

export function inOwnerHours(now: Date, tz: string): boolean {
  const h = localHour(now, tz)
  return h >= OWNER_HOURS_START && h < OWNER_HOURS_END
}

/** The notes value with one more line. Never rewrites what is there. */
export function appendLine(notes: string | null | undefined, line: string): string {
  const base = notes ?? ''
  return base ? `${base}\n${line}` : line
}

export function digestMarker(at: Date, letter: string): string {
  return `${OUTCOME_DIGEST_SENT_MARKER} ${at.toISOString()} ${letter}`
}

/** The newest list this booking was on: when, and under which letter. */
export function latestDigest(notes: string | null | undefined): { at: Date; letter: string } | null {
  let best: { at: Date; letter: string } | null = null
  for (const line of (notes ?? '').split('\n')) {
    if (!line.startsWith(OUTCOME_DIGEST_SENT_MARKER)) continue
    const [iso, letter] = line.slice(OUTCOME_DIGEST_SENT_MARKER.length).trim().split(/\s+/)
    const at = new Date(iso ?? '')
    if (!letter || isNaN(at.getTime())) continue
    if (!best || at.getTime() > best.at.getTime()) best = { at, letter }
  }
  return best
}

// -------------------------------------------
// 1. The prompt, 30 minutes after a call ends
// -------------------------------------------

export function decideOutcomePrompt(appt: OutcomeAppointment, now: Date, tz: string = OWNER_TIMEZONE): ShowRateDecision {
  if (!isUnmarked(appt)) return { send: false }
  if (hasMarker(appt.notes, OUTCOME_PROMPT_SENT_MARKER)) return { send: false }
  if (hasMarker(appt.notes, OUTCOME_DIGEST_SENT_MARKER)) return { send: false }
  const since = now.getTime() - callEnd(appt).getTime()
  if (since < PROMPT_DELAY_MS) return { send: false }
  if (since > PROMPT_MAX_AGE_MS) return { send: false, skip: 'call ended more than 6h ago; the 6 PM list carries it' }
  if (!inOwnerHours(now, tz)) {
    return {
      send: false,
      skip: `outside ${OWNER_HOURS_START}:00 to ${OWNER_HOURS_END}:00 owner-local (${tz}, local hour ${localHour(now, tz)})`,
    }
  }
  return { send: true }
}

// -------------------------------------------
// 2. The 6 PM list
// -------------------------------------------

export function digestDue(now: Date, tz: string = OWNER_TIMEZONE): boolean {
  const h = localHour(now, tz)
  return h >= DIGEST_HOUR && h < OWNER_HOURS_END
}

/** True when any booking in `rows` was put on a list today, owner-local: one list a day. */
export function digestSentToday(rows: Pick<OutcomeAppointment, 'notes'>[], now: Date, tz: string = OWNER_TIMEZONE): boolean {
  return rows.some((r) => {
    const d = latestDigest(r.notes)
    return Boolean(d && sameDayInTz(d.at, now, tz))
  })
}

/**
 * Unmarked bookings for the list: ended at least 30 minutes ago and inside
 * 36h, never listed, and not prompted in the last hour. Oldest call first.
 */
export function digestCandidates<T extends OutcomeAppointment>(appts: T[], now: Date): T[] {
  return appts
    .filter(isUnmarked)
    .filter((a) => !hasMarker(a.notes, OUTCOME_DIGEST_SENT_MARKER))
    .filter((a) => {
      const since = now.getTime() - callEnd(a).getTime()
      return since >= PROMPT_DELAY_MS && since <= DIGEST_MAX_AGE_MS
    })
    .filter((a) => {
      const prompted = markerTime(a.notes, OUTCOME_PROMPT_SENT_MARKER)
      return !prompted || now.getTime() - prompted.getTime() >= PROMPT_RECENT_MS
    })
    .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())
}

// -------------------------------------------
// 3. Reading a reply
// -------------------------------------------

export type OutcomeReplyItem = { letter: string | null; status: OutcomeStatus }

const ITEM_RE = /^([A-Z])?([123])$/

/**
 * "1", "a2", "A1 B2", "A 1, b 3", or one of OUTCOME_WORDS as the whole message.
 * Null when the text is anything else, so the webhook treats it as a normal
 * inbound. "12" is null too: two digits glued together are not two answers.
 */
export function parseOutcomeReply(text: string | null | undefined): OutcomeReplyItem[] | null {
  const clean = (text ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!clean) return null
  const word = OUTCOME_WORDS[clean.toLowerCase()]
  if (word) return [{ letter: null, status: word }]
  const parts = clean.split(' ')
  const tokens: string[] = []
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]
    const next = parts[i + 1] ?? ''
    if (/^[A-Z]$/.test(p) && /^[123]$/.test(next)) {
      tokens.push(p + next)
      i++
    } else {
      tokens.push(p)
    }
  }
  const items: OutcomeReplyItem[] = []
  for (const t of tokens) {
    const m = ITEM_RE.exec(t)
    if (!m) return null
    items.push({ letter: m[1] ?? null, status: OUTCOME_BY_CODE[m[2]] })
  }
  return items.length ? items : null
}

export type OutcomeResolution<T> = {
  marks: { appt: T; status: OutcomeStatus }[]
  /** Items that matched nothing, as typed ("B2", "1"). */
  unknown: string[]
  /** A bare digit that could mean several calls: list these and ask again. */
  ambiguous: T[] | null
}

const byTime = <T extends Pick<OutcomeAppointment, 'scheduledAt'>>(rows: T[]): T[] =>
  [...rows].sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())

/**
 * Which bookings the reply marks. Letters address the newest list. A bare
 * digit answers whatever was asked last: the newest prompt, or the newest list
 * when that came later (one entry marks it, more than one asks "Which one?").
 * With nothing asked, a bare digit marks the only unmarked call, else asks.
 */
export function resolveOutcomeReply<T extends OutcomeAppointment>(
  items: OutcomeReplyItem[],
  candidates: T[],
  now: Date
): OutcomeResolution<T> {
  const live = candidates
    .filter(isUnmarked)
    .filter((a) => {
      const since = now.getTime() - callEnd(a).getTime()
      return since >= 0 && since <= REPLY_MAX_AGE_MS
    })
  const listed = live
    .map((a) => ({ a, d: latestDigest(a.notes) }))
    .filter((x): x is { a: T; d: { at: Date; letter: string } } => Boolean(x.d))
  const newestListAt = listed.reduce((m, x) => Math.max(m, x.d.at.getTime()), 0)
  const batch = listed.filter((x) => x.d.at.getTime() === newestListAt)
  const byLetter = new Map(batch.map((x) => [x.d.letter, x.a]))

  const marks: { appt: T; status: OutcomeStatus }[] = []
  const unknown: string[] = []
  const bare = items.filter((i) => !i.letter)
  if (bare.length > 1) return { marks: [], unknown: [], ambiguous: byTime(live) }

  for (const it of items) {
    if (!it.letter) continue
    const a = byLetter.get(it.letter)
    if (a) marks.push({ appt: a, status: it.status })
    else unknown.push(`${it.letter}${OUTCOME_CODE[it.status]}`)
  }

  const it = bare[0]
  if (it) {
    const prompted = live
      .map((a) => ({ a, t: markerTime(a.notes, OUTCOME_PROMPT_SENT_MARKER) }))
      .filter((x): x is { a: T; t: Date } => Boolean(x.t))
      .sort((x, y) => y.t.getTime() - x.t.getTime())
    const lastPrompt = prompted[0] ?? null
    if (newestListAt > 0 && (!lastPrompt || newestListAt > lastPrompt.t.getTime())) {
      if (batch.length === 1) marks.push({ appt: batch[0].a, status: it.status })
      else return { marks: [], unknown: [], ambiguous: byTime(batch.map((x) => x.a)) }
    } else if (lastPrompt) {
      marks.push({ appt: lastPrompt.a, status: it.status })
    } else if (live.length === 1) {
      marks.push({ appt: live[0], status: it.status })
    } else if (live.length > 1) {
      return { marks: [], unknown: [], ambiguous: byTime(live) }
    } else {
      unknown.push(OUTCOME_CODE[it.status])
    }
  }
  return { marks, unknown, ambiguous: null }
}

// -------------------------------------------
// 4. Copy (owner-facing, GSM-7: straight quotes, no dashes, no emoji)
// -------------------------------------------

/** "2:00 PM" in the owner's zone. Some ICU builds put U+202F before AM/PM, which is not GSM-7. */
export function ownerClock(d: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz })
    .format(d)
    .replace(/ /g, ' ')
}

export function firstNameOf(name: string | null | undefined): string {
  const first = (name ?? '').trim().split(/\s+/)[0] ?? ''
  return first && !/\d/.test(first) ? first : 'the caller'
}

export const REPLY_HINT = 'Reply 1 yes, 2 no-show, 3 moved.'

export function outcomePromptText(appt: Pick<OutcomeAppointment, 'customerName' | 'scheduledAt'>, tz: string): string {
  return `Did ${firstNameOf(appt.customerName)} (${ownerClock(appt.scheduledAt, tz)}) show? ${REPLY_HINT}`
}

export type ListedBooking<T> = { appt: T; letter: string }

function listLine<T extends Pick<OutcomeAppointment, 'customerName' | 'scheduledAt'>>(items: ListedBooking<T>[], tz: string): string {
  return items.map((i) => `${i.letter} ${firstNameOf(i.appt.customerName)} ${ownerClock(i.appt.scheduledAt, tz)}`).join(', ')
}

export function outcomeDigestText<T extends Pick<OutcomeAppointment, 'customerName' | 'scheduledAt'>>(
  items: ListedBooking<T>[],
  tz: string
): string {
  if (items.length === 1) {
    const only = items[0].appt
    return `Still unmarked: ${firstNameOf(only.customerName)} (${ownerClock(only.scheduledAt, tz)}). ${REPLY_HINT}`
  }
  const a = items[0].letter
  const b = items[1].letter
  return `Still unmarked: ${listLine(items, tz)}. Reply like ${a}1 ${b}2 (1 yes, 2 no-show, 3 moved).`
}

export function outcomeAmbiguousText<T extends Pick<OutcomeAppointment, 'customerName' | 'scheduledAt'>>(
  items: ListedBooking<T>[],
  tz: string
): string {
  return `Which one? ${listLine(items, tz)}. Reply like ${items[0].letter}1.`
}

export const OUTCOME_NO_MATCH_TEXT = 'No unmarked call matches that. Reply like A1 to a list, or wait for the 6 PM list.'

export function outcomeAckText<T extends Pick<OutcomeAppointment, 'customerName'>>(
  marks: { appt: T; status: OutcomeStatus }[],
  unknown: string[]
): string {
  const done = marks.map((m) => `${firstNameOf(m.appt.customerName)}: ${OUTCOME_LABELS[m.status]}`).join(', ')
  if (!done) return unknown.length ? `No unmarked call matches ${unknown.join(' ')}. Reply like A1 to a list, or wait for the 6 PM list.` : OUTCOME_NO_MATCH_TEXT
  return unknown.length ? `Marked ${done}. Nothing matched ${unknown.join(' ')}.` : `Marked ${done}.`
}
