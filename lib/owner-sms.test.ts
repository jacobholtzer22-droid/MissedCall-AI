import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildOwnerSms, OWNER_SMS_MAX } from './owner-sms'

const base = {
  name: 'Dale',
  company: 'Dale Pressure Washing',
  trade: 'Other home service',
  tradeOther: 'pressure washing',
  phone: '+15175809709',
  arm: 'A',
  checkLink: 'https://www.google.com/search?q=Dale%20Pressure%20Washing',
  leadLink: 'https://www.alignandacquire.com/dashboard/leads?tab=website&lead=cmt123456789',
}

test('a normal alert carries name, company, trade, work, phone, arm, check and lead link', () => {
  const sms = buildOwnerSms(base)
  assert.match(sms, /Call now: Dale \(Dale Pressure Washing\)/)
  assert.match(sms, /Trade: Other home service — pressure washing/)
  assert.match(sms, /\+15175809709/)
  assert.match(sms, /Arm A/)
  assert.match(sms, /Check: https:\/\/www\.google\.com\/search/)
  assert.match(sms, /dashboard\/leads/)
  assert.ok(sms.length <= OWNER_SMS_MAX, `length ${sms.length}`)
})

test('the check link is on its own line and labelled', () => {
  assert.ok(buildOwnerSms(base).split('\n').includes(`Check: ${base.checkLink}`))
})

test('when it runs long the LEAD LINK is dropped, never the company or the check', () => {
  const long = {
    ...base,
    company: 'Kooistra Brothers Industrial Pressure Washing and Surface Restoration LLC',
    tradeOther: 'industrial pressure washing and surface restoration for commercial sites',
    checkLink: `https://www.google.com/search?q=${encodeURIComponent(
      'Kooistra Brothers Industrial Pressure Washing and Surface Restoration LLC'
    )}`,
  }
  const sms = buildOwnerSms(long)
  assert.ok(sms.length <= OWNER_SMS_MAX, `length ${sms.length}`)
  assert.ok(!sms.includes('dashboard/leads'), 'lead link should be the first thing dropped')
  assert.match(sms, /Kooistra Brothers/, 'company must survive')
  assert.match(sms, /Check: /, 'check link must survive')
})

test('no company means no check line, and nothing renders as "undefined"', () => {
  const sms = buildOwnerSms({ ...base, company: '', checkLink: '' })
  assert.ok(!sms.includes('Check:'))
  assert.ok(!/undefined|null/.test(sms))
  assert.match(sms, /Call now: Dale/)
})

test('a trade with no free text shows no dash', () => {
  const sms = buildOwnerSms({ ...base, trade: 'Landscaping', tradeOther: '' })
  assert.match(sms, /Trade: Landscaping/)
  assert.ok(!sms.includes('—'))
})

test('never exceeds the cap even when every field is absurd', () => {
  const sms = buildOwnerSms({
    name: 'x'.repeat(120),
    company: 'y'.repeat(200),
    trade: 'z'.repeat(120),
    tradeOther: 'w'.repeat(120),
    phone: '+15175809709',
    arm: 'A',
    checkLink: `https://www.google.com/search?q=${'y'.repeat(200)}`,
    leadLink: base.leadLink,
  })
  assert.ok(sms.length <= OWNER_SMS_MAX, `length ${sms.length}`)
})
