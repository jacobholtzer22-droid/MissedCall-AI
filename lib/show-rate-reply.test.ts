import { test } from 'node:test'
import assert from 'node:assert/strict'
import { recordYesReply, type ReplyDeps, type ReplyRow } from './show-rate-reply'
import {
  CONFIRMED_BY_REPLY_MARKER,
  appendMarker,
  hasMarker,
  isYesReply,
  needsConfirmFlag,
  pickConfirmTarget,
  showRateFlags,
} from './show-rate'

const et = (iso: string) => new Date(`${iso}-04:00`)
const CONSENT = 'SMS consent: yes (captured at booking)'
const NOW = et('2026-09-21T18:40:00') // 10 minutes after the night-before text

function fakes(rows: ReplyRow[], opts: { contend?: number } = {}) {
  const store = new Map(rows.map((r) => [r.id, { ...r }]))
  let contend = opts.contend ?? 0
  const deps: ReplyDeps = {
    findForPhone: async (_phone, since, until) =>
      Array.from(store.values())
        .filter((r) => r.scheduledAt > since && r.scheduledAt <= until)
        .map((r) => ({ ...r })),
    claim: async (id, expected, next) => {
      const r = store.get(id)!
      if (contend > 0) {
        contend--
        r.notes = `${r.notes}\nsomething else wrote here`
        return 0
      }
      if (r.notes !== expected) return 0
      r.notes = next
      return 1
    },
  }
  return { deps, store }
}

const row = (p: Partial<ReplyRow> = {}): ReplyRow => ({
  id: 'a1',
  scheduledAt: et('2026-09-22T13:00:00'),
  status: 'confirmed',
  notes: CONSENT,
  ...p,
})

test('CONFIRM_TRACKING is off unless exactly "true"', () => {
  assert.equal(showRateFlags({}).confirmTracking, false)
  assert.equal(showRateFlags({ CONFIRM_TRACKING: 'yes' }).confirmTracking, false)
  assert.equal(showRateFlags({ CONFIRM_TRACKING: 'true' }).confirmTracking, true)
})

test('YES matching: whole message, case-insensitive, punctuation and emoji stripped', () => {
  for (const t of ['yes', 'YES', ' Yes! ', 'y', 'Yep.', 'yeah', 'Confirmed', 'ok', 'OK!!', 'yes \u{1F44D}']) {
    assert.ok(isYesReply(t), t)
  }
  for (const t of ['\u{1F44D}', 'no', 'yes but can we move it', 'okay maybe', 'not yet', '', null, 'yess', 'STOP']) {
    assert.ok(!isYesReply(t), String(t))
  }
})

test('a YES records the timestamp on the upcoming booking, once', async () => {
  const f = fakes([row()])
  assert.deepEqual(await recordYesReply(f.deps, '(616) 555-1234', 'Yes!', NOW), { recorded: true, appointmentId: 'a1' })
  const notes = f.store.get('a1')!.notes!
  assert.equal(notes, `${CONSENT}\nConfirmed by reply: ${NOW.toISOString()}`)
  // A second YES does not stack a second line.
  assert.deepEqual(await recordYesReply(f.deps, '+16165551234', 'yes', NOW), { recorded: false, reason: 'no_booking' })
  assert.equal(f.store.get('a1')!.notes, notes)
})

test('not a YES, no booking in 36h, or a cancelled one: nothing is written', async () => {
  let f = fakes([row()])
  assert.equal((await recordYesReply(f.deps, '+16165551234', 'can we do 3 instead', NOW)).recorded, false)
  assert.equal(f.store.get('a1')!.notes, CONSENT)

  f = fakes([row({ scheduledAt: et('2026-09-24T13:00:00') })])
  assert.deepEqual(await recordYesReply(f.deps, '+16165551234', 'yes', NOW), { recorded: false, reason: 'no_booking' })

  f = fakes([row({ status: 'cancelled' })])
  assert.deepEqual(await recordYesReply(f.deps, '+16165551234', 'yes', NOW), { recorded: false, reason: 'no_booking' })
})

test('a concurrent notes write is never clobbered: re-read and retry', async () => {
  const f = fakes([row()], { contend: 1 })
  assert.equal((await recordYesReply(f.deps, '+16165551234', 'yes', NOW)).recorded, true)
  const notes = f.store.get('a1')!.notes!
  assert.match(notes, /something else wrote here/)
  assert.ok(hasMarker(notes, CONFIRMED_BY_REPLY_MARKER))
})

test('the soonest booking is the one confirmed', () => {
  const a = row({ id: 'later', scheduledAt: et('2026-09-22T15:00:00') })
  const b = row({ id: 'sooner', scheduledAt: et('2026-09-22T09:00:00') })
  assert.equal(pickConfirmTarget([a, b], NOW)?.id, 'sooner')
})

test('Ops HQ flag: after 9:00 AM booker-local with no YES, only if the night-before went out', () => {
  const appt = {
    scheduledAt: et('2026-09-22T13:00:00'),
    status: 'confirmed',
    showStatus: 'pending',
    notes: CONSENT,
    customerTimezone: 'America/Chicago',
    reminderNightBeforeSentAt: et('2026-09-21T19:30:00'),
  }
  // 9:30 AM ET is 8:30 AM Central: not yet.
  assert.equal(needsConfirmFlag(appt, et('2026-09-22T09:30:00')), false)
  assert.equal(needsConfirmFlag(appt, et('2026-09-22T10:00:00')), true)
  const replied = { ...appt, notes: appendMarker(CONSENT, CONFIRMED_BY_REPLY_MARKER, NOW) }
  assert.equal(needsConfirmFlag(replied, et('2026-09-22T10:00:00')), false)
  assert.equal(needsConfirmFlag({ ...appt, reminderNightBeforeSentAt: null }, et('2026-09-22T10:00:00')), false)
  assert.equal(needsConfirmFlag({ ...appt, showStatus: 'showed' }, et('2026-09-22T10:00:00')), false)
  assert.equal(needsConfirmFlag({ ...appt, status: 'cancelled' }, et('2026-09-22T10:00:00')), false)
})
