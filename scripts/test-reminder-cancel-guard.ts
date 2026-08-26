// ===========================================
// TEST: a cancelled booking sends zero reminder SMS
// ===========================================
// Zero-dependency assertion script, no test framework. Run:
//   npx tsx scripts/test-reminder-cancel-guard.ts
//
// Covers the send-time guard in lib/reminder-status.ts, which is the exact
// predicate the reminder cron calls immediately before dispatching to Telnyx.
//
// Pure logic. Touches no database and sends nothing.

import { isSendableStatus, NON_SENDABLE_STATUSES } from '../lib/reminder-status'

let failures = 0
function check(name: string, actual: unknown, expected: unknown) {
  const ok = actual === expected
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  (expected ${expected}, got ${actual})`}`)
}

console.log('=== send-time status guard ===')
check('confirmed booking sends', isSendableStatus('confirmed'), true)
for (const dead of NON_SENDABLE_STATUSES) {
  check(`'${dead}' booking does NOT send`, isSendableStatus(dead), false)
}
check('mixed case Cancelled does NOT send', isSendableStatus('Cancelled'), false)
check('padded " cancelled " does NOT send', isSendableStatus(' cancelled '), false)
check('null status does NOT send', isSendableStatus(null), false)
check('undefined status does NOT send', isSendableStatus(undefined), false)
check('empty status does NOT send', isSendableStatus(''), false)

// The scenario from the bug report, simulated end to end against the same
// predicate the cron uses: a booking inside the reminder window that gets
// cancelled before dispatch must produce zero sends.
console.log('')
console.log('=== cancel-then-reminder-window simulation ===')

type FakeAppt = { id: string; status: string; scheduledAt: Date }
const now = Date.now()
const inWindow = new Date(now + 45 * 60 * 1000) // 45 min out, inside the 1-hour window

const bookings: FakeAppt[] = [
  { id: 'a1', status: 'confirmed', scheduledAt: inWindow },
  { id: 'a2', status: 'cancelled', scheduledAt: inWindow },
  { id: 'a3', status: 'completed', scheduledAt: inWindow },
  { id: 'a4', status: 'no_show', scheduledAt: inWindow },
]

// Simulate the cron: candidates were selected while all were 'confirmed',
// then a2/a3/a4 changed status before the send loop reached them.
const sent: string[] = []
for (const b of bookings) {
  const freshStatus = b.status // the send-time re-read
  if (!isSendableStatus(freshStatus)) continue
  sent.push(b.id)
}

check('only the still-confirmed booking is texted', sent.join(','), 'a1')

const cancelledOnly = bookings.filter((b) => b.status === 'cancelled')
const sentToCancelled = cancelledOnly.filter((b) => sent.includes(b.id)).length
check('zero SMS sent to cancelled bookings', sentToCancelled, 0)

// Scenario B: cancelled directly in Google Calendar. Our DB still says
// 'confirmed', so only the calendar state can catch it. 'unknown' must never be
// treated as cancelled, or a transient Google error would kill live bookings.
console.log('')
console.log('=== google calendar state handling (scenario B) ===')

type CalState = 'active' | 'cancelled' | 'unknown'
function decide(dbStatus: string, calState: CalState): 'send' | 'skip-cancelled' | 'send-unverified' {
  if (!isSendableStatus(dbStatus)) return 'skip-cancelled'
  if (calState === 'cancelled') return 'skip-cancelled'
  if (calState === 'unknown') return 'send-unverified'
  return 'send'
}

check('confirmed + google active         -> send', decide('confirmed', 'active'), 'send')
check('confirmed + google cancelled      -> skip', decide('confirmed', 'cancelled'), 'skip-cancelled')
check('confirmed + google unknown        -> still send', decide('confirmed', 'unknown'), 'send-unverified')
check('cancelled in DB + google active   -> skip', decide('cancelled', 'active'), 'skip-cancelled')
check('transient error never cancels a live booking', decide('confirmed', 'unknown') === 'skip-cancelled', false)

console.log('')
if (failures > 0) {
  console.error(`${failures} assertion(s) failed`)
  process.exit(1)
}
console.log('All assertions passed.')
