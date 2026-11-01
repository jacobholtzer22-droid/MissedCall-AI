import { test } from 'node:test'
import assert from 'node:assert/strict'
import { leadTouch3Enabled, runLeadTouch3, touch3Due, type LeadTouch3Deps, type Touch3Lead } from './lead-touch-3'
import {
  LEAD_TOUCH_3_MAX_CHARS,
  LEAD_TOUCH_3_RESULT,
  LEAD_TOUCH_3_RESULT_MAX_CHARS,
  followUpBody,
  isLeadTouch3Placeholder,
  leadTouch3Body,
} from './lead-sms'

const GSM7 = /^[A-Za-z0-9 \n\r@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà]*$/
const et = (iso: string) => new Date(`${iso}-04:00`)
const NOW = et('2026-09-25T13:00:00')
const RESULT = 'A Grand Rapids roofer booked 9 jobs in his first month from calls he used to miss.'
const TOKEN = 'Ab3dEf6hIj9kLm2n'

const lead = (p: Partial<Touch3Lead> = {}): Touch3Lead => ({
  id: 'l1',
  phone: '+16165551234',
  name: '+16165551234',
  message: 'Gate lead from /book (step wizard).\n\nFirst name: Marcus\nCompany: Vandenberg Roofing',
  calendarToken: TOKEN,
  otpVerifiedAt: et('2026-09-21T12:00:00'), // ~97h before NOW
  followUpSentAt: et('2026-09-22T12:00:00'),
  ...p,
})

function fakes(rows: Touch3Lead[], o: { booked?: boolean; optedOut?: boolean; sendThrows?: boolean } = {}) {
  const claims = new Set<string>()
  const sent: { to: string; body: string }[] = []
  const calls: string[] = []
  const deps: LeadTouch3Deps = {
    findCandidates: async (since, until) => {
      calls.push('find')
      return rows.filter((r) => r.otpVerifiedAt && r.otpVerifiedAt >= since && r.otpVerifiedAt <= until)
    },
    isBooked: async () => Boolean(o.booked),
    isOptedOut: async () => Boolean(o.optedOut),
    claim: async (l) => {
      if (claims.has(l.id)) return false
      claims.add(l.id)
      return true
    },
    release: async (id) => {
      claims.delete(id)
    },
    send: async (to, body) => {
      calls.push('send')
      if (o.sendThrows) throw new Error('telnyx 500')
      sent.push({ to, body })
      return 'msg_1'
    },
    recordSent: async () => {},
    log: () => {},
  }
  return { deps, sent, claims, calls }
}

test('LEAD_TOUCH_3_SMS is off unless exactly "true"', () => {
  assert.equal(leadTouch3Enabled({}), false)
  assert.equal(leadTouch3Enabled({ LEAD_TOUCH_3_SMS: '1' }), false)
  assert.equal(leadTouch3Enabled({ LEAD_TOUCH_3_SMS: 'true' }), true)
})

test('placeholder result: the step refuses, reads nothing and sends nothing', async () => {
  assert.ok(isLeadTouch3Placeholder(LEAD_TOUCH_3_RESULT))
  assert.ok(isLeadTouch3Placeholder('  '))
  assert.ok(!isLeadTouch3Placeholder(RESULT))
  const f = fakes([lead()])
  const lines: string[] = []
  f.deps.log = (l) => lines.push(l)
  const r = await runLeadTouch3(f.deps, NOW)
  assert.equal(r.refused, 'result_placeholder')
  assert.deepEqual(lines, ['[lead-touch-3] SKIP reason=result_placeholder'])
  assert.deepEqual(f.calls, [])
})

test('touch 3 sends once with the result line and the signed /calendar link', async () => {
  const f = fakes([lead()])
  const r = await runLeadTouch3(f.deps, NOW, RESULT)
  assert.equal(r.sent, 1)
  assert.equal(
    f.sent[0].body,
    `Hey Marcus, Jacob from Align and Acquire. ${RESULT} Book: ` +
      `https://www.alignandacquire.com/calendar?l=${TOKEN}&utm_source=sms&utm_medium=funnel_return\n\nReply STOP to opt out.`
  )
  const again = await runLeadTouch3(f.deps, new Date(NOW.getTime() + 3_600_000), RESULT)
  assert.equal(again.sent, 0)
  assert.equal(f.sent.length, 1)
})

test('guards: booked, STOP, test allowlist, touch 2 not sent, outside day 4 to 7', async () => {
  for (const [opts, row, why] of [
    [{ booked: true }, lead(), 'booked'],
    [{ optedOut: true }, lead(), 'stop'],
    [{}, lead({ followUpSentAt: null }), 'no touch 2'],
    [{}, lead({ otpVerifiedAt: et('2026-09-23T13:00:00') }), 'day 3'],
    [{}, lead({ otpVerifiedAt: et('2026-09-18T12:00:00') }), 'day 8'],
    [{}, lead({ followUpSentAt: et('2026-09-25T00:00:00') }), 'touch 2 too recent'],
  ] as const) {
    const f = fakes([row], opts)
    await runLeadTouch3(f.deps, NOW, RESULT)
    assert.equal(f.sent.length, 0, why)
  }
  const prev = process.env.TEST_PHONE_ALLOWLIST
  process.env.TEST_PHONE_ALLOWLIST = '+16165551234'
  try {
    const f = fakes([lead()])
    await runLeadTouch3(f.deps, NOW, RESULT)
    assert.equal(f.sent.length, 0)
  } finally {
    if (prev === undefined) delete process.env.TEST_PHONE_ALLOWLIST
    else process.env.TEST_PHONE_ALLOWLIST = prev
  }
})

test('a failed send releases the claim, so a later run can retry', async () => {
  const f = fakes([lead()], { sendThrows: true })
  const r = await runLeadTouch3(f.deps, NOW, RESULT)
  assert.equal(r.errors.length, 1)
  assert.equal(f.claims.size, 0)
})

test('touch3Due: day 4 to 7 after OTP, 24h after touch 2', () => {
  const l = lead()
  assert.equal(touch3Due(l, NOW), true)
  assert.equal(touch3Due({ ...l, otpVerifiedAt: null }, NOW), false)
  assert.equal(touch3Due(l, et('2026-09-24T11:00:00')), false) // 71h
  assert.equal(touch3Due(l, et('2026-09-28T13:00:00')), false) // 169h
})

test('worst case fits two GSM-7 segments: 12-letter name, 120-char result', () => {
  const result = `${'A roofer in Grand Rapids booked nine more jobs a month from missed calls '.padEnd(119, 'x')}.`
  assert.equal(result.length, LEAD_TOUCH_3_RESULT_MAX_CHARS)
  const t = leadTouch3Body({ firstName: 'Maximilianus', calendarToken: TOKEN }, result)
  assert.match(t, /^Hey Maximilianus, Jacob from Align and Acquire\. /)
  assert.match(t, GSM7)
  assert.ok(t.length <= LEAD_TOUCH_3_MAX_CHARS, `length ${t.length}`)
  // No company in the copy, so a long company cannot push it over either.
  assert.ok(!t.includes('your business'))
})

test('touch 3 copy is GSM-7 and touch 2 is unchanged', () => {
  assert.match(leadTouch3Body({ firstName: null, calendarToken: null }, RESULT), /^Hey, Jacob from Align and Acquire\./)
  assert.match(leadTouch3Body({ firstName: 'Marcus', calendarToken: TOKEN }, RESULT), GSM7)
  assert.match(followUpBody({ firstName: 'Marcus', calendarToken: TOKEN }), /^Hey Marcus, Jacob from Align and Acquire again\./)
})
