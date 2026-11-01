// ===========================================
// DOMAIN_MAIL_GUARD tests: mail records on the connect_domain card
// ===========================================
// Run: npm test. Pure; no DNS, no database.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { domainMailGuardEnabled, KEEP_RULE, mailCardText, providerFor, storedMailSnapshot, type MailSnapshot } from './mail-guard'

const snap = (over: Partial<MailSnapshot> = {}): MailSnapshot => ({ mx: [], spf: null, dkim: [], dmarc: null, checkedAt: '2026-10-30T12:00:00.000Z', source: 'live', ...over })

test('flag is off unless exactly "true"', () => {
  assert.equal(domainMailGuardEnabled({}), false)
  assert.equal(domainMailGuardEnabled({ DOMAIN_MAIL_GUARD: '1' }), false)
  assert.equal(domainMailGuardEnabled({ DOMAIN_MAIL_GUARD: 'true' }), true)
})

test('Google Workspace: records listed, keep rule, no provider warning', () => {
  const t = mailCardText('example.com', snap({ mx: ['aspmx.l.google.com', 'alt1.aspmx.l.google.com'], spf: 'v=spf1 include:_spf.google.com ~all', dkim: ['google'], dmarc: 'v=DMARC1; p=none' }))
  assert.match(t, /MX: aspmx\.l\.google\.com, alt1\.aspmx\.l\.google\.com/)
  assert.match(t, /SPF: v=spf1 include:_spf\.google\.com ~all/)
  assert.match(t, /DKIM: found at google\._domainkey/)
  assert.match(t, /DMARC: v=DMARC1; p=none/)
  assert.ok(t.includes(KEEP_RULE))
  assert.doesNotMatch(t, /make sure the MX stays/)
  assert.equal(providerFor(['ASPMX.L.GOOGLE.COM.'])?.google, true)
})

test('Microsoft 365 is flagged by name', () => {
  const t = mailCardText('example.com', snap({ mx: ['example-com.mail.protection.outlook.com'], spf: 'v=spf1 include:spf.protection.outlook.com -all', dkim: ['selector1', 'selector2'] }))
  assert.match(t, /This client's email is with Microsoft 365; make sure the MX stays\./)
  assert.match(t, /DKIM: found at selector1\._domainkey, selector2\._domainkey/)
  assert.ok(t.includes(KEEP_RULE))
})

test('other named providers', () => {
  assert.equal(providerFor(['mx.zoho.com'])?.name, 'Zoho Mail')
  assert.equal(providerFor(['smtp.secureserver.net'])?.name, 'GoDaddy email')
  assert.equal(providerFor(['mx1.titan.email'])?.name, 'Titan email (GoDaddy, Hostinger)')
  assert.equal(providerFor(['mx.squarespacemail.com'])?.name, 'Squarespace')
})

test('no MX: says so, still carries the keep rule, no provider line', () => {
  const t = mailCardText('example.com', snap())
  assert.match(t, /MX: none/)
  assert.match(t, /DKIM: none at the common selectors/)
  assert.ok(t.includes(KEEP_RULE))
  assert.doesNotMatch(t, /email is with/)
  assert.equal(providerFor([]), null)
})

test('unknown provider: named by its MX host', () => {
  const t = mailCardText('example.com', snap({ mx: ['mail.some-host.net.'] }))
  assert.match(t, /This client's email is with mail\.some-host\.net; make sure the MX stays\./)
})

test('not checked yet when there is no data', () => {
  const t = mailCardText('example.com', null, 'DNS lookup failed: timeout')
  assert.match(t, /Mail records on example\.com: not checked yet \(DNS lookup failed: timeout\)/)
  assert.match(t, /change only A and CNAME/)
  assert.match(mailCardText('example.com', null), /not checked yet\. /)
})

test('stored domain checks become a snapshot; missing or errored checks do not', () => {
  const at = new Date('2026-10-28T08:00:00Z')
  const s = storedMailSnapshot([
    { key: 'dns.mx_present', passed: true, detail: 'example-com.mail.protection.outlook.com', lastRunAt: at },
    { key: 'dns.txt_spf', passed: true, detail: 'v=spf1 -all', lastRunAt: at },
    { key: 'dns.txt_dmarc', passed: false, detail: 'no DMARC', lastRunAt: at },
  ])
  assert.deepEqual(s?.mx, ['example-com.mail.protection.outlook.com'])
  assert.equal(s?.spf, 'v=spf1 -all')
  assert.equal(s?.dmarc, null)
  const t = mailCardText('example.com', s)
  assert.match(t, /last checked 2026-10-28/)
  assert.match(t, /DKIM: not checked/)
  assert.match(t, /Microsoft 365/)
  assert.equal(storedMailSnapshot([]), null)
  assert.equal(storedMailSnapshot([{ key: 'dns.mx_present', passed: null, detail: 'resolver error: x', lastRunAt: at }]), null)
  assert.deepEqual(storedMailSnapshot([{ key: 'dns.mx_present', passed: false, detail: 'no MX', lastRunAt: at }])?.mx, [])
})

test('flag off: connect_domain card is unchanged (no read, nothing appended)', () => {
  const src = readFileSync(new URL('./hq/web.ts', import.meta.url), 'utf8')
  assert.match(src, /const mail = domainMailGuardEnabled\(\) \? await mailOnCard\(domain, w\.domain\.id\) : null/)
  assert.match(src, /\.\.\.\(mail \? \{ mail: mail\.snapshot \} : \{\}\)/)
  assert.match(src, /\$\{mail \? `\\n\\n\$\{mail\.text\}` : ''\}`/)
  // The read and the fallback live only inside mailOnCard.
  assert.equal(src.match(/readMailSnapshot\(/g)?.length, 1)
})

test('autodiscover CNAME and SRV are on the card, above the keep rule', () => {
  const t = mailCardText('example.com', snap({ mx: ['example-com.mail.protection.outlook.com'], autodiscover: { cname: 'autodiscover.outlook.com', srv: 'autodiscover.example-host.net:443' } }))
  assert.match(t, /Autodiscover CNAME: autodiscover\.example\.com -> autodiscover\.outlook\.com/)
  assert.match(t, /Autodiscover SRV: _autodiscover\._tcp\.example\.com -> autodiscover\.example-host\.net:443/)
  assert.ok(t.indexOf('Autodiscover CNAME') < t.indexOf(KEEP_RULE))
})

test('autodiscover: none when read and absent, not checked when not read', () => {
  const none = mailCardText('example.com', snap({ autodiscover: { cname: null, srv: null } }))
  assert.match(none, /Autodiscover CNAME: none/)
  assert.match(none, /Autodiscover SRV: none/)
  assert.match(mailCardText('example.com', snap()), /Autodiscover: not checked/)
  const stored = storedMailSnapshot([{ key: 'dns.mx_present', passed: true, detail: 'aspmx.l.google.com', lastRunAt: new Date('2026-10-28T08:00:00Z') }])
  assert.equal(stored?.autodiscover, undefined)
  assert.match(mailCardText('example.com', stored), /Autodiscover: not checked/)
})
