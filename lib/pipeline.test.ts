// ===========================================
// /admin/pipeline logic tests
// ===========================================
// Run: npm test

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  effectiveShow,
  followUpState,
  primaryBooking,
  resolveCompany,
  resolveUtmTerm,
  rollupRoi,
  sortNewest,
  sortPipeline,
  stageOf,
  termFromNotes,
  NO_SURFACE,
  UNKNOWN_SURFACE,
  NO_TERM,
  type PipelineBooking,
  type PipelinePerson,
} from './pipeline'

const NOW = Date.parse('2026-09-18T16:00:00Z')
const days = (n: number) => new Date(NOW - n * 86_400_000).toISOString()
const inDays = (n: number) => new Date(NOW + n * 86_400_000).toISOString()

let seq = 0
const booking = (o: Partial<PipelineBooking> = {}): PipelineBooking => ({
  id: `b${seq++}`,
  scheduledAt: days(1),
  createdAt: days(2),
  calendarStatus: 'completed',
  showStatus: 'pending',
  bookingSurface: 'landing',
  ...o,
})

const person = (o: Partial<PipelinePerson> = {}): PipelinePerson => ({
  key: `+1517555${String(seq++).padStart(4, '0')}`,
  name: 'Pat',
  company: '',
  phone: null,
  email: null,
  leadCreatedAt: days(5),
  verifiedAt: null,
  arm: 'A',
  utmTerm: 'ad_a',
  agencyFlagTerm: null,
  leadJunk: false,
  isTest: false,
  bookings: [],
  status: 'pending',
  lostReason: null,
  closedAt: null,
  mrr: null,
  setupFee: null,
  lastContactedAt: null,
  nextFollowUpAt: null,
  notes: [],
  ...o,
})

// ---- stage ----

test('stage: no bookings is lead only', () => {
  assert.equal(stageOf(person()), 'lead_only')
})

test('stage: unmarked booking is booked; marks map through', () => {
  assert.equal(stageOf(person({ bookings: [booking()] })), 'booked')
  assert.equal(stageOf(person({ bookings: [booking({ showStatus: 'no_show' })] })), 'no_show')
  assert.equal(stageOf(person({ bookings: [booking({ showStatus: 'cancelled' })] })), 'cancelled')
})

test('stage: a calendar-cancelled slot reads as cancelled without a backfill', () => {
  assert.equal(effectiveShow({ showStatus: 'pending', calendarStatus: 'cancelled' }), 'cancelled')
  assert.equal(effectiveShow({ showStatus: 'showed', calendarStatus: 'cancelled' }), 'showed')
  assert.equal(stageOf(person({ bookings: [booking({ calendarStatus: 'cancelled' })] })), 'cancelled')
})

test('stage: a rebook after a cancel is the live booking', () => {
  const live = booking({ scheduledAt: days(1) })
  const cancelled = booking({ scheduledAt: inDays(2), calendarStatus: 'cancelled' })
  assert.equal(primaryBooking([cancelled, live])?.id, live.id)
  assert.equal(stageOf(person({ bookings: [cancelled, live] })), 'booked')
})

test('stage: showed on any booking wins over a later no-show', () => {
  const p = person({ bookings: [booking({ scheduledAt: days(1), showStatus: 'no_show' }), booking({ scheduledAt: days(5), showStatus: 'showed' })] })
  assert.equal(stageOf(p), 'showed')
})

// ---- utm_term / company ----

test('utm_term: any first touch beats any last touch', () => {
  assert.equal(
    resolveUtmTerm({ firstTouches: [{ source: 'facebook' }, { term: 'first_b' }], lastTouches: [{ term: 'last_a' }], notes: [] }),
    'first_b'
  )
})

test('utm_term: falls back to the notes block, ignoring the "direct" placeholder', () => {
  assert.equal(termFromNotes('Attribution:\n  utm_source: facebook\n  utm_term: ad_x\n  fbclid: yes'), 'ad_x')
  assert.equal(termFromNotes('Attribution:\n  utm_term: direct'), null)
  assert.equal(resolveUtmTerm({ firstTouches: [], lastTouches: [], notes: ['  utm_term: direct', '  utm_term: ad_y'] }), 'ad_y')
})

test('company: lead column first, then Company / Business lines', () => {
  assert.equal(resolveCompany({ leadBusinessNames: [null, 'Acme'], notes: ['Company: Other'] }), 'Acme')
  assert.equal(resolveCompany({ leadBusinessNames: [], notes: ['Trade: x', 'Company: From Notes'] }), 'From Notes')
  assert.equal(resolveCompany({ leadBusinessNames: [], notes: ['Business: WEMOVE\nx'] }), 'WEMOVE')
  assert.equal(resolveCompany({ leadBusinessNames: [], notes: [] }), '')
})

// ---- follow-up ----

test('follow-up: verified lead who never booked goes due 3 days after verifying', () => {
  assert.equal(followUpState(person({ verifiedAt: days(3) }), NOW).due, true)
  assert.equal(followUpState(person({ verifiedAt: days(1) }), NOW).due, false)
})

test('follow-up: an unverified lead is never auto-flagged, but an explicit date still counts', () => {
  assert.equal(followUpState(person({ verifiedAt: null, leadCreatedAt: days(20) }), NOW).due, false)
  assert.equal(followUpState(person({ verifiedAt: null, nextFollowUpAt: days(0.1) }), NOW).due, true)
})

test('follow-up: booked person goes due 3 days after the call', () => {
  assert.equal(followUpState(person({ bookings: [booking({ scheduledAt: days(3) })] }), NOW).due, true)
  assert.equal(followUpState(person({ bookings: [booking({ scheduledAt: days(1) })] }), NOW).due, false)
})

test('follow-up: an upcoming call is never stale, however long ago it was booked', () => {
  assert.equal(followUpState(person({ bookings: [booking({ scheduledAt: inDays(1), createdAt: days(0) })] }), NOW).due, false)
  assert.equal(followUpState(person({ verifiedAt: days(9), bookings: [booking({ scheduledAt: inDays(2), createdAt: days(6) })] }), NOW).due, false)
})

test('follow-up: contact before the call does not hide a call that went unfollowed', () => {
  // Called them 5 days ago to confirm, call happened 3 days ago, nothing since.
  const p = person({ lastContactedAt: days(5), bookings: [booking({ scheduledAt: days(3) })] })
  assert.equal(followUpState(p, NOW).due, true)
})

test('follow-up: someone whose only booking was cancelled is chased like a lead', () => {
  const p = person({ verifiedAt: days(6), bookings: [booking({ scheduledAt: inDays(1), calendarStatus: 'cancelled' })] })
  assert.equal(followUpState(p, NOW).due, true)
})

test('follow-up: working counts as open; decided statuses never go stale', () => {
  assert.equal(followUpState(person({ status: 'working', verifiedAt: days(4) }), NOW).due, true)
  assert.equal(followUpState(person({ status: 'lost', verifiedAt: days(40) }), NOW).due, false)
})

test('follow-up: past nextFollowUpAt is due even when won; a future one suppresses the stale rule', () => {
  const f = followUpState(person({ status: 'won', nextFollowUpAt: days(0.5) }), NOW)
  assert.equal(f.due && f.reason, 'overdue')
  assert.equal(followUpState(person({ verifiedAt: days(10), nextFollowUpAt: inDays(2) }), NOW).due, false)
})

test('sort: due (longest waiting) → scheduled (soonest) → rest (most recent)', () => {
  const rows = [
    person({ key: 'recent', leadCreatedAt: days(0.5) }),
    person({ key: 'due5', verifiedAt: days(5) }),
    person({ key: 'later3', nextFollowUpAt: inDays(3) }),
    person({ key: 'due9', verifiedAt: days(9) }),
    person({ key: 'later1', nextFollowUpAt: inDays(1) }),
    person({ key: 'old', leadCreatedAt: days(30) }),
  ]
  assert.deepEqual(sortPipeline(rows, NOW).map((r) => r.key), ['due9', 'due5', 'later1', 'later3', 'recent', 'old'])
})

test('sort newest: latest booking time if booked, else when the lead came in', () => {
  const rows = [
    person({ key: 'lead2d', leadCreatedAt: days(2) }),
    person({ key: 'call5d', leadCreatedAt: days(0.1), bookings: [booking({ scheduledAt: days(5) })] }),
    person({ key: 'upcoming', leadCreatedAt: days(9), bookings: [booking({ scheduledAt: inDays(1) })] }),
    person({ key: 'rebooked', bookings: [booking({ scheduledAt: days(8) }), booking({ scheduledAt: days(1) })] }),
    person({ key: 'noDates', leadCreatedAt: null }),
  ]
  // call5d sorts by its call, not by its fresh lead row.
  assert.deepEqual(sortNewest(rows).map((r) => r.key), ['upcoming', 'rebooked', 'lead2d', 'call5d', 'noDates'])
})

// ---- ROI ----

test('roi: cancelled is counted and shown, but stays out of the show rate', () => {
  const { groups, total } = rollupRoi(
    [
      person({ verifiedAt: days(2), bookings: [booking({ showStatus: 'showed' })], status: 'won', mrr: 300, setupFee: 400 }),
      person({ bookings: [booking({ showStatus: 'showed' })], status: 'lost', mrr: 999 }),
      person({ bookings: [booking({ showStatus: 'no_show' })] }),
      person({ bookings: [booking({ calendarStatus: 'cancelled' })] }),
      person({ bookings: [booking()] }),
      person({ verifiedAt: days(1) }),
      person({}),
      person({ utmTerm: null }),
    ],
    'utmTerm'
  )
  const a = groups.find((g) => g.key === 'ad_a')!
  assert.equal(a.leads, 7)
  assert.equal(a.verified, 6) // 5 booked + 1 verified-only
  assert.equal(a.bookings, 5)
  assert.equal(a.showed, 2)
  assert.equal(a.noShow, 1)
  assert.equal(a.cancelled, 1)
  assert.equal(a.notMarked, 1)
  assert.equal(a.showRate, 2 / 3)
  assert.equal(a.won, 1)
  assert.equal(a.closeRate, 0.5)
  assert.equal(a.mrr, 300)
  assert.equal(a.setup, 400)
  assert.ok(groups.some((g) => g.key === NO_TERM && g.leads === 1))
  assert.equal(total.leads, 8)
})

test('roi: only test numbers are excluded; junk counts', () => {
  const { total } = rollupRoi([person({ isTest: true, bookings: [booking()] }), person({ status: 'junk', bookings: [booking()] })], 'surface')
  assert.equal(total.leads, 1)
  assert.equal(total.bookings, 1)
})

test('roi: by surface keeps never-booked and surface-not-recorded apart', () => {
  const { groups } = rollupRoi(
    [person(), person({ bookings: [booking({ bookingSurface: 'watch' })] }), person({ bookings: [booking({ bookingSurface: null })] })],
    'surface'
  )
  assert.deepEqual(groups.map((g) => g.key).sort(), [NO_SURFACE, UNKNOWN_SURFACE, 'watch'].sort())
})

test('roi: rates are null, not zero, when nothing is decided', () => {
  const { total } = rollupRoi([person({ bookings: [booking()] })], 'surface')
  assert.equal(total.showRate, null)
  assert.equal(total.closeRate, null)
})
