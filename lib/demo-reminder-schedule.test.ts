import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decideReminder, type ReminderAppointment } from './demo-reminder-schedule'

const et = (iso: string) => new Date(`${iso}-04:00`)

function appt(p: Partial<ReminderAppointment> & { scheduledAt: Date; createdAt: Date }): ReminderAppointment {
  return { customerTimezone: null, reminderNightBeforeSentAt: null, reminderHourBeforeSentAt: null, ...p }
}

test('night-before fires at 6:30 PM in the booker zone, not Eastern', () => {
  const a = appt({
    scheduledAt: et('2026-09-22T16:00:00'),
    createdAt: et('2026-09-20T12:00:00'),
    customerTimezone: 'America/Los_Angeles',
  })
  // 6:30 PM ET is 3:30 PM PT: not yet.
  assert.equal(decideReminder(a, et('2026-09-21T18:30:00')).kind, null)
  // 6:30 PM PT is 9:30 PM ET.
  assert.equal(decideReminder(a, et('2026-09-21T21:30:00')).kind, 'night_before')
})

test('hour-before fires once inside the last hour', () => {
  const a = appt({ scheduledAt: et('2026-09-22T16:00:00'), createdAt: et('2026-09-20T12:00:00') })
  assert.equal(decideReminder(a, et('2026-09-22T14:45:00')).kind, null)
  assert.equal(decideReminder(a, et('2026-09-22T15:00:00')).kind, 'hour_before')
  assert.equal(decideReminder({ ...a, reminderHourBeforeSentAt: new Date() }, et('2026-09-22T15:15:00')).kind, null)
})

test('same-day booking made 80 minutes out: no night-before, no hour-before', () => {
  const a = appt({ scheduledAt: et('2026-09-22T16:00:00'), createdAt: et('2026-09-22T14:40:00') })
  const early = decideReminder(a, et('2026-09-22T14:45:00'))
  assert.equal(early.kind, null)
  assert.equal(early.skip, 'booked same day, night-before not applicable')
  const late = decideReminder(a, et('2026-09-22T15:00:00'))
  assert.equal(late.kind, null)
  assert.equal(late.skip, 'booked 80 min before the meeting, confirmation covers it')
})

test('hour-before is skipped when the call starts before 8:00 AM booker-local', () => {
  // 10:30 AM ET call for a Pacific booker is 7:30 AM PT; its hour mark 6:30 AM PT.
  // It starts before 8:00 AM local, so the hour-before is skipped outright.
  const a = appt({
    scheduledAt: et('2026-09-22T10:30:00'),
    createdAt: et('2026-09-20T12:00:00'),
    customerTimezone: 'America/Los_Angeles',
  })
  assert.match(decideReminder(a, et('2026-09-22T09:30:00')).skip ?? '', /before 8:00 local/)
})
