import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  REBOOK_SENT_MARKER,
  appendMarker,
  decideRebook,
  hasMarker,
  markerTime,
  rebookDueAt,
  type ShowRateAppointment,
} from './show-rate'

const et = (iso: string) => new Date(`${iso}-04:00`)

function appt(p: Partial<ShowRateAppointment> = {}): ShowRateAppointment {
  return {
    id: 'a1',
    scheduledAt: et('2026-09-22T13:00:00'),
    duration: 30,
    createdAt: et('2026-09-20T12:00:00'),
    customerName: 'Marcus',
    customerPhone: '+16165551234',
    customerTimezone: null,
    customerTimezoneSource: null,
    notes: 'SMS consent: yes (captured at booking)',
    status: 'confirmed',
    showStatus: 'no_show',
    googleMeetLink: null,
    googleCalendarEventId: null,
    reminderNightBeforeSentAt: null,
    ...p,
  }
}

test('markers append a line and never rewrite what is there', () => {
  const at = new Date('2026-09-22T20:30:00Z')
  const notes = appendMarker('Trade: Roofing\nSMS consent: yes', REBOOK_SENT_MARKER, at)
  assert.equal(notes, 'Trade: Roofing\nSMS consent: yes\nRebook text sent: 2026-09-22T20:30:00.000Z')
  assert.ok(hasMarker(notes, REBOOK_SENT_MARKER))
  assert.equal(markerTime(notes, REBOOK_SENT_MARKER)?.getTime(), at.getTime())
  assert.equal(appendMarker(null, REBOOK_SENT_MARKER, at), 'Rebook text sent: 2026-09-22T20:30:00.000Z')
  assert.ok(!hasMarker('see Rebook text sent: in the middle', REBOOK_SENT_MARKER))
})

test('rebook due: 3h after the call ends when that is daytime', () => {
  // 1:00 PM call, 1:30 PM end, 4:30 PM due.
  assert.equal(rebookDueAt(appt()).getTime(), et('2026-09-22T16:30:00').getTime())
})

test('rebook due: an evening call waits for 10:00 AM next day, an early one for 10:00 AM', () => {
  // 6:00 PM call ends 6:30 PM, +3h is 9:30 PM: next day 10:00 AM.
  assert.equal(rebookDueAt(appt({ scheduledAt: et('2026-09-22T18:00:00') })).getTime(), et('2026-09-23T10:00:00').getTime())
  // 4:00 AM Pacific call (7:00 AM ET), +3h30 is 7:30 AM Pacific: 10:00 AM Pacific.
  const pt = appt({ scheduledAt: et('2026-09-22T07:00:00'), customerTimezone: 'America/Los_Angeles' })
  assert.equal(rebookDueAt(pt).getTime(), et('2026-09-22T13:00:00').getTime())
})

test('rebook decision: not before due, not after 72h, not twice, not for cancelled', () => {
  const a = appt()
  assert.equal(decideRebook(a, et('2026-09-22T16:15:00')).send, false)
  assert.equal(decideRebook(a, et('2026-09-22T16:30:00')).send, true)
  assert.equal(decideRebook({ ...a, showStatus: 'pending' }, et('2026-09-22T16:30:00')).send, false)
  const sent = { ...a, notes: appendMarker(a.notes, REBOOK_SENT_MARKER, et('2026-09-22T16:30:00')) }
  assert.equal(decideRebook(sent, et('2026-09-22T16:45:00')).send, false)
  assert.equal(decideRebook({ ...a, status: 'cancelled' }, et('2026-09-22T16:30:00')).send, false)
  const old = decideRebook(a, et('2026-09-25T14:00:00'))
  assert.equal(old.send, false)
  assert.equal(old.skip, 'call ended more than 72h ago')
})
