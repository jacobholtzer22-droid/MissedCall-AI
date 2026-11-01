import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CALL_PROMPT_CAP, callPromptList, leadCallPromptEnabled, type CallPromptLead } from './call-prompt'

const NOW = new Date('2026-09-25T16:00:00Z')
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000)

const lead = (p: Partial<CallPromptLead> = {}): CallPromptLead => ({
  id: 'l1',
  name: 'Marcus Vandenberg',
  phone: '+16165551234',
  message: 'First name: Marcus\nCompany: Vandenberg Roofing',
  businessName: null,
  status: 'partial',
  junk: false,
  otpVerifiedAt: hoursAgo(30),
  ...p,
})

test('LEAD_CALL_PROMPT is off unless exactly "true"', () => {
  assert.equal(leadCallPromptEnabled({}), false)
  assert.equal(leadCallPromptEnabled({ LEAD_CALL_PROMPT: 'yes' }), false)
  assert.equal(leadCallPromptEnabled({ LEAD_CALL_PROMPT: 'true' }), true)
})

test('an eligible lead: name, company, phone, hours since OTP', () => {
  assert.deepEqual(callPromptList([lead()], new Set(), NOW), [
    { leadId: 'l1', name: 'Marcus', company: 'Vandenberg Roofing', phone: '+16165551234', hoursSinceOtp: 30 },
  ])
  // The businessName column wins over the message block.
  assert.equal(callPromptList([lead({ businessName: 'VR LLC' })], new Set(), NOW)[0].company, 'VR LLC')
  // The banked-lead phone placeholder is never shown as a name.
  assert.equal(callPromptList([lead({ message: null, name: '+16165551234' })], new Set(), NOW)[0].name, '')
})

test('eligibility: under 24h, over 14 days, booked, spam, deleted, junk, unverified, test number', () => {
  const out = (l: CallPromptLead, booked = new Set<string>()) => callPromptList([l], booked, NOW).length
  assert.equal(out(lead({ otpVerifiedAt: hoursAgo(23) })), 0)
  assert.equal(out(lead({ otpVerifiedAt: hoursAgo(15 * 24) })), 0)
  assert.equal(out(lead(), new Set(['+16165551234'])), 0)
  assert.equal(out(lead({ status: 'spam' })), 0)
  assert.equal(out(lead({ status: 'deleted' })), 0)
  assert.equal(out(lead({ junk: true })), 0)
  assert.equal(out(lead({ otpVerifiedAt: null })), 0)
  const prev = process.env.TEST_PHONE_ALLOWLIST
  process.env.TEST_PHONE_ALLOWLIST = '6165551234'
  try {
    assert.equal(out(lead()), 0)
  } finally {
    if (prev === undefined) delete process.env.TEST_PHONE_ALLOWLIST
    else process.env.TEST_PHONE_ALLOWLIST = prev
  }
})

test('newest first, one row per phone, capped at 20', () => {
  const many = Array.from({ length: 30 }, (_, i) =>
    lead({ id: `l${i}`, phone: `+1616555${String(1000 + i)}`, otpVerifiedAt: hoursAgo(25 + i) })
  )
  const out = callPromptList(many, new Set(), NOW)
  assert.equal(out.length, CALL_PROMPT_CAP)
  assert.equal(out[0].leadId, 'l0')
  assert.equal(out[19].leadId, 'l19')
  const dupes = callPromptList(
    [lead({ id: 'old', otpVerifiedAt: hoursAgo(80) }), lead({ id: 'new', otpVerifiedAt: hoursAgo(26) })],
    new Set(),
    NOW
  )
  assert.deepEqual(dupes.map((d) => d.leadId), ['new'])
})
