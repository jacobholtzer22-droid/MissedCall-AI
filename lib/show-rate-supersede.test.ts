import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SUPERSEDED_MARKER, supersedeEarlierBookings, type SupersedeDeps, type SupersedeRow } from './show-rate-supersede'
import { decideReminder } from './demo-reminder-schedule'
import { hasMarker, showRateFlags } from './show-rate'

const et = (iso: string) => new Date(`${iso}-04:00`)
const NOW = et('2026-09-20T15:00:00')
const CONSENT = 'SMS consent: yes (captured at booking)'

type Row = SupersedeRow & { scheduledAt: Date; createdAt: Date; phone: string }

function world(opts: { deleteThrows?: boolean; gone?: boolean; contend?: number } = {}) {
  const rows = new Map<string, Row>([
    ['old', { id: 'old', notes: CONSENT, status: 'confirmed', googleCalendarEventId: 'evt_old', scheduledAt: et('2026-09-22T13:00:00'), createdAt: et('2026-09-18T12:00:00'), phone: '+16165551234' }],
    ['new', { id: 'new', notes: CONSENT, status: 'confirmed', googleCalendarEventId: 'evt_new', scheduledAt: et('2026-09-23T15:00:00'), createdAt: NOW, phone: '+16165551234' }],
  ])
  const deleted: string[] = []
  let contend = opts.contend ?? 0
  const deps: SupersedeDeps = {
    // What the server wiring asks the DB for: same phone, confirmed, upcoming, created earlier.
    findEarlierLive: async () =>
      Array.from(rows.values())
        .filter((r) => r.id !== 'new' && r.status === 'confirmed' && r.scheduledAt > NOW && r.createdAt < NOW)
        .map((r) => ({ id: r.id, notes: r.notes, status: r.status, googleCalendarEventId: r.googleCalendarEventId })),
    reread: async (id) => {
      const r = rows.get(id)
      return r ? { id: r.id, notes: r.notes, status: r.status, googleCalendarEventId: r.googleCalendarEventId } : null
    },
    cancel: async (id, expected, next) => {
      const r = rows.get(id)!
      if (contend > 0) {
        contend--
        r.notes = `${r.notes}\nConfirmed by reply: ${NOW.toISOString()}`
        return 0
      }
      if (r.status !== 'confirmed' || r.notes !== expected) return 0
      r.status = 'cancelled'
      r.notes = next
      return 1
    },
    deleteEvent: async (eventId) => {
      if (opts.deleteThrows) throw new Error('Google 500')
      if (opts.gone) return 'gone'
      deleted.push(eventId)
      return 'deleted'
    },
    log: () => {},
  }
  return { rows, deleted, deps }
}

/** The reminder cron's own rule: status 'confirmed' candidates only, then decideReminder. */
function reminderTargets(rows: Map<string, Row>, now: Date): string[] {
  return Array.from(rows.values())
    .filter((r) => r.status === 'confirmed' && r.scheduledAt > now)
    .filter((r) =>
      decideReminder(
        { scheduledAt: r.scheduledAt, createdAt: r.createdAt, customerTimezone: null, reminderNightBeforeSentAt: null, reminderHourBeforeSentAt: null },
        now
      ).kind
    )
    .map((r) => r.id)
}

test('RESCHEDULE_LINK is off unless exactly "true" (demo-book only calls this when it is on)', () => {
  assert.equal(showRateFlags({}).rescheduleLink, false)
  assert.equal(showRateFlags({ RESCHEDULE_LINK: 'on' }).rescheduleLink, false)
  assert.equal(showRateFlags({ RESCHEDULE_LINK: 'true' }).rescheduleLink, true)
})

test('rebook: the old booking is cancelled with the marker and its event deleted; the new one is untouched', async () => {
  const w = world()
  const out = await supersedeEarlierBookings(w.deps, 'new', NOW)
  assert.deepEqual(out, [{ id: 'old', row: 'cancelled', event: 'deleted' }])
  const old = w.rows.get('old')!
  assert.equal(old.status, 'cancelled')
  assert.equal(old.notes, `${CONSENT}\n${SUPERSEDED_MARKER} new ${NOW.toISOString()}`)
  assert.ok(hasMarker(old.notes, SUPERSEDED_MARKER))
  assert.deepEqual(w.deleted, ['evt_old'])
  assert.equal(w.rows.get('new')!.status, 'confirmed')
  assert.equal(w.rows.get('new')!.notes, CONSENT)
})

test('rebook: reminders go only to the new booking', async () => {
  const w = world()
  // Night before the OLD call: before the rebook, the old one is due.
  const nightBeforeOld = et('2026-09-21T18:30:00')
  assert.deepEqual(reminderTargets(w.rows, nightBeforeOld), ['old'])
  await supersedeEarlierBookings(w.deps, 'new', NOW)
  assert.deepEqual(reminderTargets(w.rows, nightBeforeOld), [])
  assert.deepEqual(reminderTargets(w.rows, et('2026-09-22T18:30:00')), ['new'])
})

test('calendar failure: logged, old row still cancelled, new booking stands', async () => {
  const w = world({ deleteThrows: true })
  const out = await supersedeEarlierBookings(w.deps, 'new', NOW)
  assert.deepEqual(out, [{ id: 'old', row: 'cancelled', event: 'failed', error: 'Google 500' }])
  assert.equal(w.rows.get('old')!.status, 'cancelled')
  assert.equal(w.rows.get('new')!.status, 'confirmed')
})

test('an event Google already removed counts as done', async () => {
  const w = world({ gone: true })
  assert.deepEqual(await supersedeEarlierBookings(w.deps, 'new', NOW), [{ id: 'old', row: 'cancelled', event: 'gone' }])
})

test('a concurrent notes write is kept: re-read, then cancel', async () => {
  const w = world({ contend: 1 })
  const out = await supersedeEarlierBookings(w.deps, 'new', NOW)
  assert.equal(out[0].row, 'cancelled')
  assert.match(w.rows.get('old')!.notes!, /Confirmed by reply: .*\nSuperseded by rebook: new /)
})

test('nothing earlier and live: nothing happens; a second run is a no-op', async () => {
  const w = world()
  await supersedeEarlierBookings(w.deps, 'new', NOW)
  const again = await supersedeEarlierBookings(w.deps, 'new', NOW)
  assert.deepEqual(again, [])
  assert.deepEqual(w.deleted, ['evt_old'])
})
