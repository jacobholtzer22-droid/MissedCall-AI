import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runShowRateSteps, showRateCalendarLink, type ShowRateDeps, type LeadLinkRow } from './show-rate-cron'
import { REBOOK_SENT_MARKER, hasMarker, showRateFlags, type ShowRateAppointment, type ShowRateFlags } from './show-rate'

const et = (iso: string) => new Date(`${iso}-04:00`)
const CONSENT = 'Trade: Roofing\nSMS consent: yes (captured at booking)'
const OFF: ShowRateFlags = { noshowRebook: false, startNudge: false, confirmTracking: false, rescheduleLink: false }
const LEAD: LeadLinkRow = {
  calendarToken: 'Ab3dEf6hIj9kLm2n',
  otpVerifiedAt: et('2026-09-20T12:00:00'),
  createdAt: et('2026-09-20T12:00:00'),
  funnelVariant: 'A',
}

function appt(p: Partial<ShowRateAppointment> = {}): ShowRateAppointment {
  return {
    id: 'a1',
    // Tue Sep 22, 1:00 PM ET, 30 minutes.
    scheduledAt: et('2026-09-22T13:00:00'),
    duration: 30,
    createdAt: et('2026-09-20T12:00:00'),
    customerName: 'Marcus Vandenberg',
    customerPhone: '+16165551234',
    customerTimezone: 'America/New_York',
    customerTimezoneSource: 'widget',
    notes: CONSENT,
    status: 'confirmed',
    showStatus: 'no_show',
    googleMeetLink: 'https://meet.google.com/abc-defg-hij',
    googleCalendarEventId: null,
    reminderNightBeforeSentAt: et('2026-09-21T18:30:00'),
    ...p,
  }
}

/** In-memory fakes. `sent` collects every text; nothing reaches a network. */
function fakes(rows: ShowRateAppointment[], opts: { optedOut?: boolean; newer?: boolean; sendThrows?: boolean } = {}) {
  const store = new Map(rows.map((r) => [r.id, { ...r }]))
  const sent: { to: string; text: string }[] = []
  const calls: string[] = []
  const deps: ShowRateDeps = {
    findNoShows: async (since, until) => {
      calls.push('findNoShows')
      // Copies, like rows off the database: a later write does not change them.
      return Array.from(store.values())
        .filter((r) => r.showStatus === 'no_show' && r.scheduledAt >= since && r.scheduledAt <= until)
        .map((r) => ({ ...r }))
    },
    claim: async (id, expected, next) => {
      calls.push('claim')
      const r = store.get(id)
      if (!r || r.notes !== expected) return 0
      r.notes = next
      return 1
    },
    reread: async (id) => (store.has(id) ? { ...store.get(id)! } : null),
    hasOptedOut: async () => Boolean(opts.optedOut),
    hasNewerBooking: async () => Boolean(opts.newer),
    calendarState: async () => 'active',
    leadForPhone: async () => LEAD,
    send: async (to, text) => {
      calls.push('send')
      if (opts.sendThrows) throw new Error('telnyx 500')
      sent.push({ to, text })
      return 'msg_1'
    },
    logOutbound: async () => {},
    log: () => {},
  }
  return { deps, store, sent, calls }
}

const ON: ShowRateFlags = { ...OFF, noshowRebook: true }
// 1:30 PM end + 3h = 4:30 PM ET, inside the window.
const DUE = et('2026-09-22T16:30:00')

test('flags are off unless exactly "true"', () => {
  assert.deepEqual(showRateFlags({}), OFF)
  assert.equal(showRateFlags({ NOSHOW_REBOOK_SMS: '1' }).noshowRebook, false)
  assert.equal(showRateFlags({ NOSHOW_REBOOK_SMS: 'TRUE' }).noshowRebook, false)
  assert.equal(showRateFlags({ NOSHOW_REBOOK_SMS: 'true' }).noshowRebook, true)
})

test('all flags off: nothing is read, claimed or sent', async () => {
  const f = fakes([appt()])
  const r = await runShowRateSteps(OFF, f.deps, DUE)
  assert.deepEqual(r, { sent: [], skipped: [], failed: [] })
  assert.deepEqual(f.calls, [])
})

test('rebook: sends one text with the signed /calendar link, then never again', async () => {
  const f = fakes([appt()])
  const r = await runShowRateSteps(ON, f.deps, DUE)
  assert.deepEqual(r.sent, [{ id: 'a1', kind: 'noshow_rebook' }])
  assert.equal(f.sent.length, 1)
  assert.equal(f.sent[0].to, '+16165551234')
  assert.equal(
    f.sent[0].text,
    'Hey Marcus, Jacob from Align and Acquire. Sorry we missed each other today. Grab a new time that works for you here: ' +
      'https://www.alignandacquire.com/calendar?l=Ab3dEf6hIj9kLm2n&utm_source=sms&utm_medium=funnel_return&utm_campaign=a'
  )
  assert.ok(hasMarker(f.store.get('a1')!.notes, REBOOK_SENT_MARKER))
  // The consent line and everything else in notes survive the claim.
  assert.ok(f.store.get('a1')!.notes!.startsWith(CONSENT))

  const again = await runShowRateSteps(ON, f.deps, new Date(DUE.getTime() + 15 * 60 * 1000))
  assert.equal(again.sent.length, 0)
  assert.equal(f.sent.length, 1)
})

test('rebook: two overlapping runs reading the same row send once', async () => {
  const f = fakes([appt()])
  const [a, b] = await Promise.all([runShowRateSteps(ON, f.deps, DUE), runShowRateSteps(ON, f.deps, DUE)])
  assert.equal(a.sent.length + b.sent.length, 1)
  assert.equal(f.sent.length, 1)
})

test('rebook guards: no consent, STOP, rebooked already, not a no-show', async () => {
  let f = fakes([appt({ notes: 'Trade: Roofing' })])
  assert.equal((await runShowRateSteps(ON, f.deps, DUE)).skipped[0].reason, 'no sms consent recorded')
  assert.equal(f.sent.length, 0)

  f = fakes([appt()], { optedOut: true })
  assert.equal((await runShowRateSteps(ON, f.deps, DUE)).skipped[0].reason, 'opted out (STOP)')
  assert.equal(f.sent.length, 0)
  assert.ok(!hasMarker(f.store.get('a1')!.notes, REBOOK_SENT_MARKER))

  f = fakes([appt()], { newer: true })
  assert.equal((await runShowRateSteps(ON, f.deps, DUE)).skipped[0].reason, 'already booked again')
  assert.equal(f.sent.length, 0)

  f = fakes([appt({ showStatus: 'showed' })])
  await runShowRateSteps(ON, f.deps, DUE)
  assert.equal(f.sent.length, 0)
})

test('rebook: outside the 10 AM to 7 PM booker window nothing goes out', async () => {
  // 9:30 PM ET the same night (marked late): outside the window.
  const f = fakes([appt()])
  const late = await runShowRateSteps(ON, f.deps, et('2026-09-22T21:30:00'))
  assert.equal(f.sent.length, 0)
  assert.match(late.skipped[0].reason, /outside 10:00 AM to 7:00 PM local/)
  // 6:00 AM Pacific is quiet hours for a Pacific booker even though it is 9 AM ET.
  const g = fakes([appt({ customerTimezone: 'America/Los_Angeles' })])
  await runShowRateSteps(ON, g.deps, et('2026-09-23T09:00:00'))
  assert.equal(g.sent.length, 0)
  // Next morning at 10:00 AM ET it goes, and says "yesterday".
  await runShowRateSteps(ON, f.deps, et('2026-09-23T10:00:00'))
  assert.equal(f.sent.length, 1)
  assert.match(f.sent[0].text, /missed each other yesterday\./)
})

test('rebook: a send failure is logged, the marker stays, no retry', async () => {
  const f = fakes([appt()], { sendThrows: true })
  const r = await runShowRateSteps(ON, f.deps, DUE)
  assert.equal(r.failed.length, 1)
  assert.ok(hasMarker(f.store.get('a1')!.notes, REBOOK_SENT_MARKER))
  const again = await runShowRateSteps(ON, f.deps, new Date(DUE.getTime() + 15 * 60 * 1000))
  assert.equal(again.failed.length, 0)
  assert.equal(f.calls.filter((c) => c === 'send').length, 1)
})

test('rebook link: expired or missing token falls back to the bare /calendar page', () => {
  const now = et('2026-09-22T16:30:00')
  assert.match(showRateCalendarLink(LEAD, now), /\/calendar\?l=Ab3dEf6hIj9kLm2n&/)
  assert.match(showRateCalendarLink(null, now), /\/calendar\?utm_source=sms/)
  const old = { ...LEAD, otpVerifiedAt: et('2026-08-01T12:00:00') }
  assert.match(showRateCalendarLink(old, now), /\/calendar\?utm_source=sms/)
})
