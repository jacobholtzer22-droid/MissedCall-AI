import { test } from 'node:test'
import assert from 'node:assert/strict'
import { claimDigestLetters, runOutcomeCapture, type OutcomeDeps } from './outcome-capture-cron'
import { recordOutcomeReply, type OutcomeReplyDeps } from './outcome-capture-reply'
import {
  OUTCOME_BY_REPLY_MARKER,
  OUTCOME_DIGEST_SENT_MARKER,
  OUTCOME_PROMPT_SENT_MARKER,
  type OutcomeAppointment,
} from './outcome-capture'
import { appendMarker, hasMarker } from './show-rate'

const TZ = 'America/New_York'
const et = (iso: string) => new Date(`${iso}-05:00`)

function appt(p: Partial<OutcomeAppointment> = {}): OutcomeAppointment {
  return {
    id: 'a1',
    scheduledAt: et('2026-11-05T14:00:00'),
    duration: 30,
    customerName: 'Cole Mejia',
    notes: 'SMS consent: yes (captured at booking)',
    status: 'confirmed',
    showStatus: 'pending',
    ...p,
  }
}

/** In-memory fakes. `sent` collects every owner text; nothing reaches a network. */
function fakes(rows: OutcomeAppointment[], opts: { claimFails?: boolean; sendThrows?: boolean } = {}) {
  const store = new Map(rows.map((r) => [r.id, { ...r }]))
  const sent: string[] = []
  const deps: OutcomeReplyDeps = {
    ownerTimeZone: TZ,
    findRecent: async (since, until) =>
      Array.from(store.values())
        .filter((r) => r.scheduledAt >= since && r.scheduledAt <= until)
        .map((r) => ({ ...r })),
    claim: async (id, expected, next) => {
      if (opts.claimFails) return 0
      const r = store.get(id)
      if (!r || r.notes !== expected) return 0
      r.notes = next
      return 1
    },
    mark: async (id, expected, next, status) => {
      const r = store.get(id)
      if (!r || r.notes !== expected) return 0
      r.notes = next
      r.showStatus = status
      return 1
    },
    sendOwner: async (text) => {
      if (opts.sendThrows) throw new Error('telnyx 500')
      sent.push(text)
      return 'msg_1'
    },
  }
  const cron: OutcomeDeps = { ...deps, log: () => {} }
  return { deps, cron, store, sent }
}

// -------------------------------------------
// Cron: the prompt
// -------------------------------------------

test('cron: one prompt per call, 30 minutes after it ends, never twice', async () => {
  const f = fakes([appt()])
  const early = await runOutcomeCapture(f.cron, et('2026-11-05T14:45:00'))
  assert.deepEqual(early.prompted, [])
  assert.deepEqual(f.sent, [])

  const due = await runOutcomeCapture(f.cron, et('2026-11-05T15:00:00'))
  assert.deepEqual(due.prompted, ['a1'])
  assert.deepEqual(f.sent, ['Did Cole (2:00 PM) show? Reply 1 yes, 2 no-show, 3 moved.'])
  assert.ok(hasMarker(f.store.get('a1')!.notes, OUTCOME_PROMPT_SENT_MARKER))

  const again = await runOutcomeCapture(f.cron, et('2026-11-05T15:15:00'))
  assert.deepEqual(again.prompted, [])
  assert.equal(f.sent.length, 1)
})

test('cron: a lost claim sends nothing; a failed send burns the marker and is not retried', async () => {
  const lost = fakes([appt()], { claimFails: true })
  const r1 = await runOutcomeCapture(lost.cron, et('2026-11-05T15:00:00'))
  assert.deepEqual(r1.prompted, [])
  assert.deepEqual(r1.skipped, [{ id: 'a1', reason: 'already claimed by another run' }])
  assert.deepEqual(lost.sent, [])

  const broken = fakes([appt()], { sendThrows: true })
  const r2 = await runOutcomeCapture(broken.cron, et('2026-11-05T15:00:00'))
  assert.deepEqual(r2.prompted, [])
  assert.equal(r2.failed.length, 1)
  assert.ok(hasMarker(broken.store.get('a1')!.notes, OUTCOME_PROMPT_SENT_MARKER))
  const r3 = await runOutcomeCapture(broken.cron, et('2026-11-05T15:15:00'))
  assert.equal(r3.failed.length, 0)
  assert.equal(r3.prompted.length, 0)
})

// -------------------------------------------
// Cron: the 6 PM list
// -------------------------------------------

test('cron: the list goes once at 6 PM with letters, and names only calls not just prompted', async () => {
  const noon = appt({ id: 'noon', scheduledAt: et('2026-11-05T12:00:00') })
  const one = appt({ id: 'one', customerName: 'Tony Oliveira', scheduledAt: et('2026-11-05T13:00:00') })
  const late = appt({ id: 'late', customerName: 'Enio Alex', scheduledAt: et('2026-11-05T17:15:00') }) // ends 17:45, prompt due 18:15
  const f = fakes([noon, one, late])
  // Prompts for noon and one went out earlier in the afternoon.
  await runOutcomeCapture(f.cron, et('2026-11-05T13:00:00'))
  await runOutcomeCapture(f.cron, et('2026-11-05T14:00:00'))
  assert.equal(f.sent.length, 2)

  const quiet = await runOutcomeCapture(f.cron, et('2026-11-05T17:45:00'))
  assert.equal(quiet.digest, null)

  const six = await runOutcomeCapture(f.cron, et('2026-11-05T18:15:00'))
  assert.deepEqual(six.prompted, ['late'])
  assert.deepEqual(six.digest, { ids: ['noon', 'one'], letters: ['A', 'B'] })
  assert.equal(f.sent.at(-1), 'Still unmarked: A Cole 12:00 PM, B Tony 1:00 PM. Reply like A1 B2 (1 yes, 2 no-show, 3 moved).')
  assert.ok(hasMarker(f.store.get('noon')!.notes, OUTCOME_DIGEST_SENT_MARKER))
  assert.ok(hasMarker(f.store.get('one')!.notes, OUTCOME_DIGEST_SENT_MARKER))
  assert.equal(hasMarker(f.store.get('late')!.notes, OUTCOME_DIGEST_SENT_MARKER), false)

  const later = await runOutcomeCapture(f.cron, et('2026-11-05T18:30:00'))
  assert.equal(later.digest, null)
  assert.equal(f.sent.length, 4)
})

test('cron: the list is skipped when every claim is lost, and a one-entry list reads as a prompt', async () => {
  // Prompted at 1:00 PM, still unmarked at 6:00 PM.
  const askedAtOne = appt({ scheduledAt: et('2026-11-05T12:00:00') })
  askedAtOne.notes = appendMarker(askedAtOne.notes, OUTCOME_PROMPT_SENT_MARKER, et('2026-11-05T13:00:00'))
  const lost = fakes([askedAtOne], { claimFails: true })
  const r = await runOutcomeCapture(lost.cron, et('2026-11-05T18:00:00'))
  assert.equal(r.digest, null)
  assert.deepEqual(lost.sent, [])

  const f = fakes([askedAtOne])
  const r2 = await runOutcomeCapture(f.cron, et('2026-11-05T18:00:00'))
  assert.deepEqual(r2.digest, { ids: ['a1'], letters: ['A'] })
  assert.deepEqual(f.sent, ['Still unmarked: Cole (12:00 PM). Reply 1 yes, 2 no-show, 3 moved.'])
})

test('claimDigestLetters: letters follow claim order so the text and the markers agree', async () => {
  const a = appt({ id: 'a', scheduledAt: et('2026-11-05T12:00:00') })
  const b = appt({ id: 'b', scheduledAt: et('2026-11-05T13:00:00') })
  const c = appt({ id: 'c', scheduledAt: et('2026-11-05T14:00:00') })
  const f = fakes([a, c]) // b is gone from the store: its claim fails
  const listed = await claimDigestLetters(f.deps.claim, [a, b, c], et('2026-11-05T18:00:00'))
  assert.deepEqual(listed.map((l) => [l.appt.id, l.letter]), [['a', 'A'], ['c', 'B']])
  assert.match(f.store.get('c')!.notes ?? '', /Outcome digest sent: 2026-11-05T23:00:00.000Z B$/)
})

// -------------------------------------------
// The reply
// -------------------------------------------

test('reply: a digit after the prompt marks the booking, stamps the marker and acks', async () => {
  const f = fakes([appt()])
  await runOutcomeCapture(f.cron, et('2026-11-05T15:00:00'))
  const r = await recordOutcomeReply(f.deps, '2', et('2026-11-05T15:03:00'))
  assert.deepEqual(r, { handled: true, marked: [{ id: 'a1', status: 'no_show' }], unknown: [], ambiguous: [] })
  const row = f.store.get('a1')!
  assert.equal(row.showStatus, 'no_show')
  assert.match(row.notes ?? '', /Outcome by reply: no_show 2026-11-05T20:03:00.000Z$/)
  assert.equal(f.sent.at(-1), 'Marked Cole: no-show.')
})

test('reply: letters answer the list; a bare digit after a list of two asks which one, then the letter lands', async () => {
  const noon = appt({ id: 'noon', scheduledAt: et('2026-11-05T12:00:00') })
  const one = appt({ id: 'one', customerName: 'Tony Oliveira', scheduledAt: et('2026-11-05T13:00:00') })
  const f = fakes([noon, one])
  // The afternoon prompts went unanswered; at 6 PM the list goes out.
  await runOutcomeCapture(f.cron, et('2026-11-05T13:00:00'))
  await runOutcomeCapture(f.cron, et('2026-11-05T14:00:00'))
  await runOutcomeCapture(f.cron, et('2026-11-05T18:00:00'))
  assert.match(f.sent.at(-1)!, /^Still unmarked: A Cole/)

  const bare = await recordOutcomeReply(f.deps, '1', et('2026-11-05T18:05:00'))
  assert.equal(bare.handled, true)
  assert.deepEqual(bare.handled && bare.marked, [])
  assert.deepEqual(bare.handled && bare.ambiguous, ['noon', 'one'])
  assert.equal(f.sent.at(-1), 'Which one? A Cole 12:00 PM, B Tony 1:00 PM. Reply like A1.')
  assert.equal(f.store.get('noon')!.showStatus, 'pending')

  const letters = await recordOutcomeReply(f.deps, 'a1 B3', et('2026-11-05T18:06:00'))
  assert.deepEqual(letters.handled && letters.marked, [
    { id: 'noon', status: 'showed' },
    { id: 'one', status: 'cancelled' },
  ])
  assert.equal(f.store.get('noon')!.showStatus, 'showed')
  assert.equal(f.store.get('one')!.showStatus, 'cancelled')
  assert.equal(f.sent.at(-1), 'Marked Cole: showed, Tony: moved.')
  assert.ok(hasMarker(f.store.get('one')!.notes, OUTCOME_BY_REPLY_MARKER))
})

test('reply: text that is not an outcome is not handled and sends nothing', async () => {
  const f = fakes([appt()])
  const r = await recordOutcomeReply(f.deps, 'Running 5 late, start without me', et('2026-11-05T15:03:00'))
  assert.deepEqual(r, { handled: false })
  assert.deepEqual(f.sent, [])
})

test('reply: nothing to mark is still handled, with a no-match ack; a row changed meanwhile is reported, not overwritten', async () => {
  const empty = fakes([])
  const r = await recordOutcomeReply(empty.deps, '1', et('2026-11-05T15:03:00'))
  assert.equal(r.handled, true)
  assert.equal(empty.sent.at(-1), 'No unmarked call matches 1. Reply like A1 to a list, or wait for the 6 PM list.')

  const f = fakes([appt()])
  await runOutcomeCapture(f.cron, et('2026-11-05T15:00:00'))
  const raced: OutcomeReplyDeps = {
    ...f.deps,
    mark: async () => 0, // someone wrote the row between the read and the mark
  }
  const r2 = await recordOutcomeReply(raced, '1', et('2026-11-05T15:03:00'))
  assert.deepEqual(r2.handled && r2.marked, [])
  assert.equal(f.store.get('a1')!.showStatus, 'pending')
  assert.equal(f.sent.at(-1), 'No unmarked call matches Cole (changed meanwhile). Reply like A1 to a list, or wait for the 6 PM list.')
})
