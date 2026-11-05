import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DIGEST_MAX_AGE_MS,
  LETTERS,
  OUTCOME_PROMPT_SENT_MARKER,
  decideOutcomePrompt,
  digestCandidates,
  digestDue,
  digestMarker,
  digestSentToday,
  firstNameOf,
  latestDigest,
  outcomeAckText,
  outcomeAmbiguousText,
  outcomeDigestText,
  outcomePromptText,
  ownerClock,
  parseOutcomeReply,
  resolveOutcomeReply,
  type OutcomeAppointment,
} from './outcome-capture'
import { appendMarker } from './show-rate'

const TZ = 'America/New_York'
// November 2026 is Eastern Standard Time.
const et = (iso: string) => new Date(`${iso}-05:00`)
const GSM7 = /^[A-Za-z0-9 \n\r@£$¥èéùìòÇØøÅå_ÆæßÉ!"#%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà]*$/

function appt(p: Partial<OutcomeAppointment> = {}): OutcomeAppointment {
  return {
    id: 'a1',
    // Thu Nov 5, 2:00 PM ET, 30 minutes: ends 2:30, prompt due 3:00.
    scheduledAt: et('2026-11-05T14:00:00'),
    duration: 30,
    customerName: 'Cole Mejia',
    notes: 'Trade: Roofing\nSMS consent: yes (captured at booking)',
    status: 'confirmed',
    showStatus: 'pending',
    ...p,
  }
}

const prompted = (a: OutcomeAppointment, at: Date): OutcomeAppointment => ({
  ...a,
  notes: appendMarker(a.notes, OUTCOME_PROMPT_SENT_MARKER, at),
})
const listed = (a: OutcomeAppointment, at: Date, letter: string): OutcomeAppointment => ({
  ...a,
  notes: `${a.notes}\n${digestMarker(at, letter)}`,
})

// -------------------------------------------
// The prompt
// -------------------------------------------

test('prompt: not before 30 minutes after the call ends, then once', () => {
  assert.equal(decideOutcomePrompt(appt(), et('2026-11-05T14:59:00'), TZ).send, false)
  assert.equal(decideOutcomePrompt(appt(), et('2026-11-05T15:00:00'), TZ).send, true)
  assert.equal(decideOutcomePrompt(prompted(appt(), et('2026-11-05T15:00:00')), et('2026-11-05T15:15:00'), TZ).send, false)
})

test('prompt: a call that ended more than 6h ago is left to the list, with a reason', () => {
  const d = decideOutcomePrompt(appt(), et('2026-11-05T20:31:00'), TZ)
  assert.equal(d.send, false)
  assert.match(d.skip ?? '', /6h/)
})

test('prompt: marked, listed, cancelled and deleted bookings never get one; completed does', () => {
  const now = et('2026-11-05T15:00:00')
  assert.equal(decideOutcomePrompt(appt({ showStatus: 'showed' }), now, TZ).send, false)
  assert.equal(decideOutcomePrompt(appt({ showStatus: 'no_show' }), now, TZ).send, false)
  assert.equal(decideOutcomePrompt(listed(appt(), et('2026-11-04T18:00:00'), 'A'), now, TZ).send, false)
  assert.equal(decideOutcomePrompt(appt({ status: 'cancelled' }), now, TZ).send, false)
  assert.equal(decideOutcomePrompt(appt({ status: 'deleted' }), now, TZ).send, false)
  assert.equal(decideOutcomePrompt(appt({ status: 'completed' }), now, TZ).send, true)
})

test('prompt: nothing to the owner before 7 AM or from 10 PM, owner-local', () => {
  // 9:30 PM call ends 10:00 PM; due 10:30 PM: quiet.
  const late = appt({ scheduledAt: et('2026-11-05T21:30:00') })
  const d = decideOutcomePrompt(late, et('2026-11-05T22:30:00'), TZ)
  assert.equal(d.send, false)
  assert.match(d.skip ?? '', /owner-local/)
  // At 7:00 AM the next day it is still inside 6h of the end? No: 9h. The list carries it.
  assert.match(decideOutcomePrompt(late, et('2026-11-06T07:00:00'), TZ).skip ?? '', /6h/)
})

// -------------------------------------------
// The list
// -------------------------------------------

test('list: due from 6:00 PM to 10:00 PM owner-local', () => {
  assert.equal(digestDue(et('2026-11-05T17:59:00'), TZ), false)
  assert.equal(digestDue(et('2026-11-05T18:00:00'), TZ), true)
  assert.equal(digestDue(et('2026-11-05T21:59:00'), TZ), true)
  assert.equal(digestDue(et('2026-11-05T22:00:00'), TZ), false)
})

test('list: one a day, judged by any marker dated today owner-local', () => {
  const now = et('2026-11-05T18:15:00')
  assert.equal(digestSentToday([listed(appt(), et('2026-11-05T18:00:00'), 'A')], now, TZ), true)
  assert.equal(digestSentToday([listed(appt(), et('2026-11-04T18:00:00'), 'A')], now, TZ), false)
  assert.equal(digestSentToday([appt()], now, TZ), false)
})

test('list: unmarked calls ended 30 min to 36h ago, never listed, not prompted in the last hour, oldest first', () => {
  const now = et('2026-11-05T18:00:00')
  const old = appt({ id: 'old', scheduledAt: et('2026-11-04T05:00:00') }) // 37h ago: out
  const yesterday = appt({ id: 'yd', scheduledAt: et('2026-11-04T19:00:00') }) // in
  const noon = appt({ id: 'noon', scheduledAt: et('2026-11-05T12:00:00') })
  const fresh = appt({ id: 'fresh', scheduledAt: et('2026-11-05T17:45:00') }) // ended 18:15: out
  const marked = appt({ id: 'marked', showStatus: 'showed' })
  const onList = listed(appt({ id: 'onList' }), et('2026-11-04T18:00:00'), 'A')
  const justAsked = prompted(appt({ id: 'justAsked', scheduledAt: et('2026-11-05T16:45:00') }), et('2026-11-05T17:45:00'))
  const askedEarlier = prompted(appt({ id: 'askedEarlier' }), et('2026-11-05T15:00:00'))
  const ids = digestCandidates([fresh, askedEarlier, old, marked, onList, justAsked, yesterday, noon], now).map((a) => a.id)
  assert.deepEqual(ids, ['yd', 'noon', 'askedEarlier'])
})

test('list: letters skip I and O; the newest marker wins', () => {
  assert.equal(LETTERS.includes('I'), false)
  assert.equal(LETTERS.includes('O'), false)
  const a = listed(listed(appt(), et('2026-11-04T18:00:00'), 'C'), et('2026-11-05T18:00:00'), 'A')
  assert.deepEqual(latestDigest(a.notes), { at: et('2026-11-05T18:00:00'), letter: 'A' })
  assert.equal(latestDigest('nothing here'), null)
})

// -------------------------------------------
// Reading a reply
// -------------------------------------------

test('parse: digits, letters, words; anything else is not an outcome reply', () => {
  assert.deepEqual(parseOutcomeReply('1'), [{ letter: null, status: 'showed' }])
  assert.deepEqual(parseOutcomeReply(' a2 '), [{ letter: 'A', status: 'no_show' }])
  assert.deepEqual(parseOutcomeReply('A1 B2'), [
    { letter: 'A', status: 'showed' },
    { letter: 'B', status: 'no_show' },
  ])
  assert.deepEqual(parseOutcomeReply('A 1, b 3'), [
    { letter: 'A', status: 'showed' },
    { letter: 'B', status: 'cancelled' },
  ])
  assert.deepEqual(parseOutcomeReply('1 2'), [
    { letter: null, status: 'showed' },
    { letter: null, status: 'no_show' },
  ])
  assert.deepEqual(parseOutcomeReply('Yes'), [{ letter: null, status: 'showed' }])
  assert.deepEqual(parseOutcomeReply('No-show'), [{ letter: null, status: 'no_show' }])
  assert.deepEqual(parseOutcomeReply('no show'), [{ letter: null, status: 'no_show' }])
  assert.deepEqual(parseOutcomeReply('no'), [{ letter: null, status: 'no_show' }])
  assert.deepEqual(parseOutcomeReply('moved'), [{ letter: null, status: 'cancelled' }])
  assert.deepEqual(parseOutcomeReply('rescheduled!'), [{ letter: null, status: 'cancelled' }])
  for (const t of ['thanks', '12', '4', '', '   ', null, undefined, 'yes but late', 'call me', '1 thanks', 'A']) {
    assert.equal(parseOutcomeReply(t), null, `should not parse: ${String(t)}`)
  }
})

test('resolve: a bare digit answers the newest prompt', () => {
  const now = et('2026-11-05T15:40:00')
  const first = prompted(appt({ id: 'first', scheduledAt: et('2026-11-05T13:00:00') }), et('2026-11-05T14:00:00'))
  const second = prompted(appt({ id: 'second', scheduledAt: et('2026-11-05T14:00:00') }), et('2026-11-05T15:00:00'))
  const r = resolveOutcomeReply(parseOutcomeReply('2')!, [first, second], now)
  assert.deepEqual(r.marks.map((m) => [m.appt.id, m.status]), [['second', 'no_show']])
  assert.deepEqual(r.unknown, [])
  assert.equal(r.ambiguous, null)
})

test('resolve: a bare digit after a list of several asks which one; after a list of one, marks it', () => {
  const now = et('2026-11-05T18:10:00')
  const at = et('2026-11-05T18:00:00')
  const a = listed(prompted(appt({ id: 'a', scheduledAt: et('2026-11-05T12:00:00') }), et('2026-11-05T13:00:00')), at, 'A')
  const b = listed(prompted(appt({ id: 'b', scheduledAt: et('2026-11-05T13:00:00') }), et('2026-11-05T14:00:00')), at, 'B')
  const two = resolveOutcomeReply(parseOutcomeReply('1')!, [a, b], now)
  assert.deepEqual(two.marks, [])
  assert.deepEqual(two.ambiguous?.map((x) => x.id), ['a', 'b'])
  const one = resolveOutcomeReply(parseOutcomeReply('1')!, [a], now)
  assert.deepEqual(one.marks.map((m) => m.appt.id), ['a'])
})

test('resolve: letters address the newest list only; unknown letters are reported', () => {
  const now = et('2026-11-05T18:10:00')
  const cole = listed(appt({ id: 'cole', scheduledAt: et('2026-11-05T12:00:00') }), et('2026-11-04T18:00:00'), 'A')
  const tony = listed(appt({ id: 'tony', customerName: 'Tony Oliveira', scheduledAt: et('2026-11-05T13:00:00') }), et('2026-11-05T18:00:00'), 'A')
  const r = resolveOutcomeReply(parseOutcomeReply('A1 C2')!, [cole, tony], now)
  assert.deepEqual(r.marks.map((m) => [m.appt.id, m.status]), [['tony', 'showed']])
  assert.deepEqual(r.unknown, ['C2'])
})

test('resolve: with nothing asked, a bare digit marks the only unmarked call, else asks', () => {
  const now = et('2026-11-05T15:40:00')
  const only = appt({ id: 'only' })
  assert.deepEqual(resolveOutcomeReply(parseOutcomeReply('3')!, [only], now).marks.map((m) => [m.appt.id, m.status]), [['only', 'cancelled']])
  const other = appt({ id: 'other', scheduledAt: et('2026-11-05T13:00:00') })
  assert.deepEqual(resolveOutcomeReply(parseOutcomeReply('1')!, [only, other], now).ambiguous?.map((x) => x.id), ['other', 'only'])
  assert.deepEqual(resolveOutcomeReply(parseOutcomeReply('1')!, [], now).unknown, ['1'])
})

test('resolve: two bare digits are ambiguous; marked and not-yet-ended calls are never candidates', () => {
  const now = et('2026-11-05T15:40:00')
  const done = prompted(appt({ id: 'done', showStatus: 'showed' }), et('2026-11-05T15:00:00'))
  const future = appt({ id: 'future', scheduledAt: et('2026-11-05T16:00:00') })
  assert.deepEqual(resolveOutcomeReply(parseOutcomeReply('1')!, [done, future], now).unknown, ['1'])
  const a = prompted(appt({ id: 'a' }), et('2026-11-05T15:00:00'))
  assert.ok(resolveOutcomeReply(parseOutcomeReply('1 2')!, [a], now).ambiguous)
})

// -------------------------------------------
// Copy
// -------------------------------------------

test('copy: exact texts, owner-local clock, GSM-7 only', () => {
  const cole = appt()
  const tony = appt({ id: 't', customerName: 'Tony Oliveira', scheduledAt: et('2026-11-05T15:30:00') })
  assert.equal(outcomePromptText(cole, TZ), 'Did Cole (2:00 PM) show? Reply 1 yes, 2 no-show, 3 moved.')
  assert.equal(
    outcomeDigestText([{ appt: cole, letter: 'A' }, { appt: tony, letter: 'B' }], TZ),
    'Still unmarked: A Cole 2:00 PM, B Tony 3:30 PM. Reply like A1 B2 (1 yes, 2 no-show, 3 moved).'
  )
  assert.equal(outcomeDigestText([{ appt: tony, letter: 'A' }], TZ), 'Still unmarked: Tony (3:30 PM). Reply 1 yes, 2 no-show, 3 moved.')
  assert.equal(outcomeAmbiguousText([{ appt: cole, letter: 'A' }, { appt: tony, letter: 'B' }], TZ), 'Which one? A Cole 2:00 PM, B Tony 3:30 PM. Reply like A1.')
  assert.equal(outcomeAckText([{ appt: cole, status: 'no_show' }], []), 'Marked Cole: no-show.')
  assert.equal(outcomeAckText([{ appt: cole, status: 'showed' }, { appt: tony, status: 'cancelled' }], ['C2']), 'Marked Cole: showed, Tony: moved. Nothing matched C2.')
  assert.equal(outcomeAckText([], ['B1']), 'No unmarked call matches B1. Reply like A1 to a list, or wait for the 6 PM list.')
  for (const t of [
    outcomePromptText(cole, TZ),
    outcomeDigestText([{ appt: cole, letter: 'A' }, { appt: tony, letter: 'B' }], TZ),
    outcomeAmbiguousText([{ appt: cole, letter: 'A' }, { appt: tony, letter: 'B' }], TZ),
    outcomeAckText([{ appt: cole, status: 'no_show' }], ['Z3']),
    outcomeAckText([], []),
  ]) {
    assert.match(t, GSM7, `not GSM-7: ${t}`)
    assert.ok(t.length <= 160 || t.includes('Still unmarked'), `over one segment: ${t}`)
  }
  assert.equal(ownerClock(et('2026-11-05T09:05:00'), 'America/Los_Angeles'), '6:05 AM')
  assert.equal(ownerClock(et('2026-11-05T14:00:00'), TZ).includes(' '), false)
  assert.equal(firstNameOf('  marie  k '), 'marie')
  assert.equal(firstNameOf(''), 'the caller')
  assert.equal(firstNameOf('+16165551234'), 'the caller')
  assert.equal(firstNameOf(null), 'the caller')
})

test('copy: a list of 24 calls still renders and stays within the letters', () => {
  const many = Array.from({ length: 24 }, (_, i) => ({
    appt: appt({ id: `c${i}`, customerName: `Guest ${LETTERS[i]}`, scheduledAt: new Date(et('2026-11-05T07:00:00').getTime() + i * 30 * 60 * 1000) }),
    letter: LETTERS[i],
  }))
  const t = outcomeDigestText(many, TZ)
  assert.match(t, /^Still unmarked: A Guest 7:00 AM, B Guest 7:30 AM/)
  assert.match(t, GSM7)
  assert.ok(DIGEST_MAX_AGE_MS > 24 * 60 * 60 * 1000)
})
