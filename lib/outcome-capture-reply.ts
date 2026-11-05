// ===========================================
// /book SHOW-RATE: OUTCOME CAPTURE, JACOB'S REPLY (OUTCOME_PROMPT_SMS)
// ===========================================
// Called by the marketing-line branch of the SMS webhook BEFORE the inbound is
// saved and forwarded, only when OUTCOME_PROMPT_SMS is 'true' and the text
// comes from the owner's own number. A reply that reads as an outcome ("1",
// "A2", "no show") marks the booking, texts back what was marked, and is
// handled here; anything else from his number falls through to the normal
// forward, unchanged. Never throws to its caller.
//
// The mark is one conditional update: showStatus and the
// "Outcome by reply: <status> <ISO>" marker land together, only where notes
// still equal the value read, so a reply never overwrites a newer change.

import Telnyx from 'telnyx'
import { db } from '@/lib/db'
import { OWNER_TIMEZONE } from '@/lib/booker-time'
import { normalizeToE164, phonesMatch } from '@/lib/phone-utils'
import {
  OUTCOME_BY_REPLY_MARKER,
  OUTCOME_NO_MATCH_TEXT,
  REPLY_MAX_AGE_MS,
  appendLine,
  firstNameOf,
  outcomeAckText,
  outcomeAmbiguousText,
  parseOutcomeReply,
  resolveOutcomeReply,
  type OutcomeAppointment,
  type OutcomeStatus,
} from '@/lib/outcome-capture'
import { claimDigestLetters, type OutcomeDeps } from '@/lib/outcome-capture-cron'

export type OutcomeReplyDeps = Pick<OutcomeDeps, 'findRecent' | 'claim' | 'sendOwner' | 'ownerTimeZone'> & {
  /** Set showStatus and notes together, only where notes still equals `expected`. Returns the row count. */
  mark(id: string, expected: string | null, next: string, status: OutcomeStatus): Promise<number>
}

export type OutcomeReplyResult =
  | { handled: false }
  | { handled: true; marked: { id: string; status: OutcomeStatus }[]; unknown: string[]; ambiguous: string[] }

export async function recordOutcomeReply(
  deps: OutcomeReplyDeps,
  text: string | null | undefined,
  now: Date
): Promise<OutcomeReplyResult> {
  const items = parseOutcomeReply(text)
  if (!items) return { handled: false }
  try {
    const rows = await deps.findRecent(new Date(now.getTime() - REPLY_MAX_AGE_MS - 2 * 60 * 60 * 1000), now)
    const res = resolveOutcomeReply(items, rows, now)

    if (res.ambiguous) {
      const listed = await claimDigestLetters(deps.claim, res.ambiguous, now)
      await deps.sendOwner(listed.length ? outcomeAmbiguousText(listed, deps.ownerTimeZone) : OUTCOME_NO_MATCH_TEXT)
      return { handled: true, marked: [], unknown: [], ambiguous: listed.map((l) => l.appt.id) }
    }

    const marked: { appt: OutcomeAppointment; status: OutcomeStatus }[] = []
    const unknown = [...res.unknown]
    for (const m of res.marks) {
      const next = appendLine(m.appt.notes, `${OUTCOME_BY_REPLY_MARKER} ${m.status} ${now.toISOString()}`)
      if ((await deps.mark(m.appt.id, m.appt.notes, next, m.status)) > 0) marked.push(m)
      else unknown.push(`${firstNameOf(m.appt.customerName)} (changed meanwhile)`)
    }
    await deps.sendOwner(outcomeAckText(marked, unknown))
    return { handled: true, marked: marked.map((m) => ({ id: m.appt.id, status: m.status })), unknown, ambiguous: [] }
  } catch (err) {
    console.error('[outcome] reply failed:', err)
    // Handled: his digit must not be saved as a lead message or forwarded back to him.
    return { handled: true, marked: [], unknown: [], ambiguous: [] }
  }
}

export const OUTCOME_SELECT = {
  id: true,
  scheduledAt: true,
  duration: true,
  customerName: true,
  notes: true,
  status: true,
  showStatus: true,
} as const

/** The number owner texts go to, the way pingOwnerWithThread resolves it. */
export function ownerNumber(ownerPhone: string | null | undefined): string {
  return normalizeToE164(process.env.OWNER_PHONE || ownerPhone || '')
}

export function isOwnerReply(from: string, ownerPhone: string | null | undefined): boolean {
  const owner = process.env.OWNER_PHONE || ownerPhone || ''
  return Boolean(owner && phonesMatch(from, owner))
}

/** The webhook's entry point: the real database and sender behind recordOutcomeReply. */
export function recordOutcomeReplyForBusiness(
  business: { id: string; ownerPhone: string | null; timezone: string | null },
  from: string,
  text: string | null | undefined
): Promise<OutcomeReplyResult> {
  if (!isOwnerReply(from, business.ownerPhone)) return Promise.resolve({ handled: false })
  const sender = process.env.MARKETING_TELNYX_NUMBER?.trim()
  const to = ownerNumber(business.ownerPhone)
  const apiKey = process.env.TELNYX_API_KEY
  return recordOutcomeReply(
    {
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
      mark: async (id, expected, next, status) =>
        (await db.appointment.updateMany({ where: { id, notes: expected }, data: { notes: next, showStatus: status } })).count,
      sendOwner: async (body) => {
        if (!sender || !to || !apiKey) {
          console.error(`[outcome] ack SKIPPED to=${to ? 'set' : 'MISSING'} from=${sender ? 'set' : 'MISSING'}`)
          return null
        }
        const telnyx = new Telnyx({ apiKey })
        const res = await telnyx.messages.send({ from: sender, to, text: body })
        return (res as { data?: { id?: string } })?.data?.id ?? null
      },
    },
    text,
    new Date()
  )
}
