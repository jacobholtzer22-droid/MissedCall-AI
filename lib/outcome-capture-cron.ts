// ===========================================
// /book SHOW-RATE: OUTCOME CAPTURE, THE CRON STEPS (OUTCOME_PROMPT_SMS)
// ===========================================
// Runs at the end of /api/cron/appointment-reminders, only when
// OUTCOME_PROMPT_SMS is 'true'. With the flag off the route never calls this.
//
// Two steps, both texting the OWNER (never a prospect):
//   1. one prompt per booking, 30 minutes after its end time, inside 6 hours
//   2. one "Still unmarked" list a day, on the first run at or after 6:00 PM
//      owner-local, naming every unmarked call of the last 36 hours by letter
//
// Every side effect comes in through OutcomeDeps, so the tests run the real
// step logic against fakes and nothing can send. Same rules as the show-rate
// steps above it: claim the marker before the send, never retry a failed send
// (the marker stays burned: a missed prompt beats a second one), log loudly.

import {
  DIGEST_MAX_AGE_MS,
  LETTERS,
  OUTCOME_PROMPT_SENT_MARKER,
  appendLine,
  decideOutcomePrompt,
  digestCandidates,
  digestDue,
  digestMarker,
  digestSentToday,
  outcomeDigestText,
  outcomePromptText,
  type ListedBooking,
  type OutcomeAppointment,
} from '@/lib/outcome-capture'
import { appendMarker } from '@/lib/show-rate'

export type OutcomeDeps = {
  /** Marketing-business appointments scheduled in [since, until], every showStatus. */
  findRecent(since: Date, until: Date): Promise<OutcomeAppointment[]>
  /** Conditional update: set notes to `next` only where notes still equals `expected`. Returns the row count. */
  claim(id: string, expected: string | null, next: string): Promise<number>
  /** One text to the owner. Returns the provider message id. Throws on failure. */
  sendOwner(text: string): Promise<string | null>
  ownerTimeZone: string
  log?: (line: string) => void
}

export type OutcomeCronResult = {
  prompted: string[]
  digest: { ids: string[]; letters: string[] } | null
  skipped: { id: string; reason: string }[]
  failed: { id: string; error: string }[]
}

/**
 * Put bookings on a list: claim "Outcome digest sent: <ISO> <letter>" on each,
 * letters in claim order, so the text and the markers always agree. A booking
 * another writer changed meanwhile is left off this list.
 */
export async function claimDigestLetters<T extends OutcomeAppointment>(
  claim: OutcomeDeps['claim'],
  appts: T[],
  now: Date
): Promise<ListedBooking<T>[]> {
  const out: ListedBooking<T>[] = []
  for (const appt of appts) {
    if (out.length >= LETTERS.length) break
    const letter = LETTERS[out.length]
    const next = appendLine(appt.notes, digestMarker(now, letter))
    if ((await claim(appt.id, appt.notes, next)) > 0) out.push({ appt: { ...appt, notes: next }, letter })
  }
  return out
}

export async function runOutcomeCapture(deps: OutcomeDeps, now: Date): Promise<OutcomeCronResult> {
  const result: OutcomeCronResult = { prompted: [], digest: null, skipped: [], failed: [] }
  const log = deps.log ?? ((line: string) => console.log(line))
  const tz = deps.ownerTimeZone

  // Reach back a little past the list's window so an old call is skipped with
  // a reason rather than never read.
  const rows = await deps.findRecent(new Date(now.getTime() - DIGEST_MAX_AGE_MS - 2 * 60 * 60 * 1000), now)

  const promptedNow = new Set<string>()
  for (const appt of rows) {
    const decision = decideOutcomePrompt(appt, now, tz)
    if (!decision.send) {
      if (decision.skip) result.skipped.push({ id: appt.id, reason: decision.skip })
      continue
    }
    const claimed = await deps.claim(appt.id, appt.notes, appendMarker(appt.notes, OUTCOME_PROMPT_SENT_MARKER, now))
    if (claimed === 0) {
      result.skipped.push({ id: appt.id, reason: 'already claimed by another run' })
      continue
    }
    promptedNow.add(appt.id)
    try {
      await deps.sendOwner(outcomePromptText(appt, tz))
      result.prompted.push(appt.id)
      log(`[outcome] PROMPT appointmentId=${appt.id} at=${now.toISOString()}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[outcome] PROMPT FAILED appointmentId=${appt.id} error=${message} (marker left set, will not retry)`)
      result.failed.push({ id: appt.id, error: message })
    }
  }

  if (digestDue(now, tz) && !digestSentToday(rows, now, tz)) {
    const candidates = digestCandidates(rows, now).filter((a) => !promptedNow.has(a.id))
    if (candidates.length > 0) {
      const listed = await claimDigestLetters(deps.claim, candidates, now)
      if (listed.length > 0) {
        try {
          await deps.sendOwner(outcomeDigestText(listed, tz))
          result.digest = { ids: listed.map((l) => l.appt.id), letters: listed.map((l) => l.letter) }
          log(`[outcome] DIGEST count=${listed.length} at=${now.toISOString()}`)
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          console.error(`[outcome] DIGEST FAILED error=${message} (markers left set, will not retry)`)
          result.failed.push({ id: 'digest', error: message })
        }
      }
    }
  }

  return result
}
