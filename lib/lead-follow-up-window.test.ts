import { test } from 'node:test'
import assert from 'node:assert/strict'
import { earliestFollowUpAt, followUpDue, isInFollowUpWindow } from './lead-follow-up-window'

// All instants in September 2026, EDT (UTC-4).
const et = (iso: string) => new Date(`${iso}-04:00`)

test('the window is 11:00 AM to 7:00 PM Eastern, end exclusive', () => {
  assert.equal(isInFollowUpWindow(et('2026-09-22T10:59:00')), false)
  assert.equal(isInFollowUpWindow(et('2026-09-22T11:00:00')), true)
  assert.equal(isInFollowUpWindow(et('2026-09-22T18:59:00')), true)
  assert.equal(isInFollowUpWindow(et('2026-09-22T19:00:00')), false)
})

test('OTP verified at 11:00 PM ET goes out at 11:00 AM ET two days later, not at the 24h mark', () => {
  const otp = et('2026-09-21T23:00:00')
  // The 24h mark, 11:00 PM: outside the window.
  assert.equal(followUpDue(otp, et('2026-09-22T23:00:00')), false)
  // Every hourly run overnight and through the morning: still nothing.
  for (const h of ['00', '03', '07', '09', '10']) {
    assert.equal(followUpDue(otp, et(`2026-09-23T${h}:00:00`)), false, `${h}:00`)
  }
  // First run inside the window.
  assert.equal(followUpDue(otp, et('2026-09-23T11:00:00')), true)
  assert.deepEqual(earliestFollowUpAt(otp), et('2026-09-23T11:00:00'))
  // 36 hours after OTP, well inside the 72h cap.
  assert.equal((earliestFollowUpAt(otp)!.getTime() - otp.getTime()) / 3_600_000, 36)
})

test('a 24h mark inside the window sends at the mark', () => {
  const otp = et('2026-09-21T14:30:00')
  assert.deepEqual(earliestFollowUpAt(otp), et('2026-09-22T14:30:00'))
  assert.equal(followUpDue(otp, et('2026-09-22T14:00:00')), false, 'not 24h yet')
  assert.equal(followUpDue(otp, et('2026-09-22T15:00:00')), true)
})

test('a 24h mark before 11:00 AM waits for 11:00 the same day', () => {
  assert.deepEqual(earliestFollowUpAt(et('2026-09-21T08:15:00')), et('2026-09-22T11:00:00'))
})

test('never past the 72h cap, even inside the window', () => {
  const otp = et('2026-09-21T12:00:00')
  assert.equal(followUpDue(otp, et('2026-09-24T12:00:00')), true, 'exactly 72h')
  assert.equal(followUpDue(otp, et('2026-09-24T13:00:00')), false, '73h')
})
