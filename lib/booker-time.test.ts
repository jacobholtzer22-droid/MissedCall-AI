import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  OWNER_TIMEZONE,
  bookerWhen,
  bookerZoneNote,
  normalizeTimeZone,
  resolveBookerZone,
  slotClock,
  slotTimeWithZone,
} from './booker-time'
import { confirmationText, hourBeforeText, nightBeforeText } from './marketing-sms-copy'

// 4:00 PM EDT on Friday Sep 18 2026.
const FOUR_PM_ET = new Date('2026-09-18T20:00:00Z')
// 8:30 PM EDT, the last slot of the day. 00:30 UTC the NEXT day.
const LAST_SLOT_ET = new Date('2026-09-19T00:30:00Z')
// 4:00 PM EST in January, for the standard-time abbreviations.
const FOUR_PM_EST = new Date('2027-01-15T21:00:00Z')

const GSM7 = /^[A-Za-z0-9 \n\r@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà]*$/

test('OWNER_TIMEZONE matches TIMEZONE in lib/marketing-slots', () => {
  const src = readFileSync(join(__dirname, 'marketing-slots.ts'), 'utf8')
  const m = src.match(/export const TIMEZONE = '([^']+)'/)
  assert.equal(m?.[1], OWNER_TIMEZONE)
})

test('a known zone renders in that zone with its abbreviation', () => {
  const cases: [string, string][] = [
    ['America/Los_Angeles', '1:00 PM PDT'],
    ['America/Denver', '2:00 PM MDT'],
    ['America/Phoenix', '1:00 PM MST'],
    ['America/Chicago', '3:00 PM CDT'],
    ['America/New_York', '4:00 PM EDT'],
    ['America/Detroit', '4:00 PM EDT'],
    ['America/Anchorage', '12:00 PM AKDT'],
    ['Pacific/Honolulu', '10:00 AM HST'],
  ]
  for (const [tz, expected] of cases) {
    const w = bookerWhen(FOUR_PM_ET, { timeZone: tz, source: 'browser' })
    assert.equal(w.time, expected, tz)
    assert.equal(w.confident, true)
  }
})

test('standard time uses the standard abbreviations', () => {
  assert.equal(bookerWhen(FOUR_PM_EST, { timeZone: 'America/Los_Angeles', source: 'widget' }).time, '1:00 PM PST')
  assert.equal(bookerWhen(FOUR_PM_EST, { timeZone: 'America/Chicago', source: 'widget' }).time, '3:00 PM CST')
  assert.equal(bookerWhen(FOUR_PM_EST, { timeZone: 'America/Denver', source: 'widget' }).time, '2:00 PM MST')
})

test('day and date follow the booker, not the server or ET', () => {
  // 8:30 PM ET Friday is 00:30 UTC Saturday. Pacific is still Friday.
  const w = bookerWhen(LAST_SLOT_ET, { timeZone: 'America/Los_Angeles', source: 'browser' })
  assert.equal(w.day, 'Friday')
  assert.equal(w.date, 'Sep 18')
  assert.equal(w.time, '5:30 PM PDT')
})

test('an IP guess is never shown alone: their time AND ET', () => {
  const w = bookerWhen(FOUR_PM_ET, { timeZone: 'America/Los_Angeles', source: 'ip' })
  assert.equal(w.time, '1:00 PM PDT (4:00 PM EDT)')
  assert.equal(w.confident, false)
})

test('an IP guess that renders as ET collapses to one time', () => {
  const w = bookerWhen(FOUR_PM_ET, { timeZone: 'America/Detroit', source: 'ip' })
  assert.equal(w.time, '4:00 PM EDT')
})

test('no zone renders ET with its abbreviation, flagged not confident', () => {
  const w = bookerWhen(FOUR_PM_ET, null)
  assert.equal(w.time, '4:00 PM EDT')
  assert.equal(w.day, 'Friday')
  assert.equal(w.confident, false)
})

test('garbage zones are rejected, not thrown on', () => {
  for (const bad of ['', 'Mars/Olympus', '<script>', 'a'.repeat(80), 42, null, undefined]) {
    assert.equal(normalizeTimeZone(bad), null, String(bad))
  }
  assert.equal(bookerWhen(FOUR_PM_ET, { timeZone: 'Mars/Olympus', source: 'widget' }).time, '4:00 PM EDT')
})

test('zone priority: widget, then browser, then IP', () => {
  assert.deepEqual(
    resolveBookerZone({ widget: 'America/Chicago', browser: 'America/Denver', ip: 'America/New_York' }),
    { timeZone: 'America/Chicago', source: 'widget' }
  )
  assert.deepEqual(
    resolveBookerZone({ widget: 'nope', browser: 'America/Denver', ip: 'America/New_York' }),
    { timeZone: 'America/Denver', source: 'browser' }
  )
  assert.deepEqual(resolveBookerZone({ ip: 'America/Los_Angeles' }), {
    timeZone: 'America/Los_Angeles',
    source: 'ip',
  })
  assert.equal(resolveBookerZone({}), null)
})

test('slot helpers for the browser calendars', () => {
  assert.equal(slotTimeWithZone(FOUR_PM_ET.toISOString(), 'America/Los_Angeles'), '1:00 PM PDT')
  assert.equal(slotClock(FOUR_PM_ET.toISOString(), 'America/Los_Angeles'), '1:00 PM')
  assert.equal(slotClock(FOUR_PM_ET.toISOString(), null), '4:00 PM')
})

test('owner note says where they are, and says so when unknown', () => {
  assert.equal(
    bookerZoneNote(FOUR_PM_ET, { timeZone: 'America/Los_Angeles', source: 'browser' }),
    'Their time: 1:00 PM PDT (America/Los_Angeles)'
  )
  assert.match(bookerZoneNote(FOUR_PM_ET, { timeZone: 'America/Los_Angeles', source: 'ip' }), /guessed from IP/)
  assert.match(bookerZoneNote(FOUR_PM_ET, null), /not captured/)
})

const params = {
  scheduledAt: FOUR_PM_ET,
  meetLink: 'https://meet.google.com/abc-defg-hij',
  ownerPhone: '+15175809709',
}

test('all three texts render in the booker zone and never say bare ET', () => {
  const pt = { ...params, timeZone: 'America/Los_Angeles', timeZoneSource: 'browser' }
  const c = confirmationText(pt)
  assert.match(c, /Friday Sep 18 at 1:00 PM PDT\./)
  assert.match(nightBeforeText(pt), /tomorrow at 1:00 PM PDT\./)
  assert.match(hourBeforeText(pt), /at 1:00 PM PDT, about an hour from now\./)
  for (const t of [c, nightBeforeText(pt), hourBeforeText(pt)]) {
    assert.doesNotMatch(t, / ET\b/, t)
    assert.match(t, GSM7, `not GSM-7: ${t}`)
  }
})

test('texts for a booking with no captured zone read ET with its abbreviation', () => {
  assert.match(confirmationText(params), /at 4:00 PM EDT\./)
})

test('texts for an IP-guessed zone carry both times', () => {
  const ip = { ...params, timeZone: 'America/Chicago', timeZoneSource: 'ip' }
  assert.match(confirmationText(ip), /at 3:00 PM CDT \(4:00 PM EDT\)\./)
})
