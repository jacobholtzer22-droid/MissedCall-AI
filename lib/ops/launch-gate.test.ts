// ===========================================
// /admin/ops go-live and enable gate tests
// ===========================================
// Run: npm test.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { enableGate, enableHold, goLiveGate, reportGaps, skipsIn, type GateClient } from './launch-gate'

const client = (over: Partial<GateClient> = {}): GateClient => ({
  services: ['website', 'ads'],
  website: { step: 'approved', evidence: { trackingInstalled: true, siteIndexableFlag: false } },
  domain: { step: 'live', manualStatus: null, computedStatus: 'live', evidence: { primaryDomain: 'example-painting.com' } },
  ads: { step: 'enable', evidence: { callAssetId: 'customers/1/assets/2', conversionActions: { formId: '1', callId: '2' } } },
  owner: { email: 'owner@example-painting.com', phone: '+18015550100' },
  notes: ['DECISION: billing_confirmed in Google Ads Oct 20'],
  ...over,
})

const keys = (items: { key: string }[]) => items.map((i) => i.key).sort()

test('a ready client goes live and enables with nothing unmet', () => {
  assert.deepEqual(goLiveGate(client()), [])
  assert.deepEqual(enableGate(client(), { callAsset: true, finalUrls: ['https://www.example-painting.com/contact'], conversionActions: 3 }), [])
})

test('go_live with no tag and no domain names both in plain words', () => {
  const c = client({
    website: { step: 'approved', evidence: {} },
    domain: { step: 'dns_by_client', manualStatus: null, computedStatus: 'in_progress', evidence: {} },
  })
  const items = goLiveGate(c, 'take Enio live')
  assert.deepEqual(keys(items), ['domain_live', 'tracking'])
  assert.deepEqual(items.map((i) => i.text).sort(), ['Google tag is not on the site', 'domain is not live'])
})

test('"go live, skip tag" passes with the domain live', () => {
  const c = client({ website: { step: 'approved', evidence: {} } })
  assert.deepEqual(keys(goLiveGate(c, 'take it')), ['tracking'])
  assert.deepEqual(goLiveGate(c, 'go live, skip tag'), [])
})

test('"go live on vercel.app" waives the domain only', () => {
  const c = client({ domain: null })
  assert.deepEqual(keys(goLiveGate(c)), ['domain_live'])
  assert.deepEqual(goLiveGate(c, 'go live on vercel.app'), [])
  assert.deepEqual(goLiveGate(c, 'go live on aa-yualexpainting.vercel.app'), [])
})

test('missing owner contact and an unapproved site are named', () => {
  const c = client({ owner: { email: null, phone: ' ' }, website: { step: 'client_review', evidence: { trackingInstalled: true } } })
  const items = goLiveGate(c)
  assert.deepEqual(keys(items), ['owner_email', 'owner_phone', 'website_approved'])
  assert.ok(items.some((i) => i.text === 'no owner email for lead alerts'))
  assert.ok(items.some((i) => i.text === 'website is not approved (step client_review)'))
})

test('a client without ads is not held for the tag', () => {
  const c = client({ services: ['website'], website: { step: 'approved', evidence: {} } })
  assert.deepEqual(goLiveGate(c), [])
})

test('the tag seen on production counts as installed', () => {
  const c = client({ website: { step: 'approved', evidence: { googleTagLive: true } } })
  assert.deepEqual(goLiveGate(c), [])
})

test('skipsIn reads several items and ignores text without skip', () => {
  assert.deepEqual(Array.from(skipsIn('go live, skip the domain and billing; thanks')).sort(), ['billing', 'domain_live'])
  assert.deepEqual(Array.from(skipsIn('Skip tag')), ['tracking'])
  assert.equal(skipsIn('the tag is fine').size, 0)
})

test('enable gate lists every given and becomes a hold', () => {
  const c = client({
    website: { step: 'approved', evidence: {} },
    ads: { step: 'enable', evidence: {} },
    notes: [],
  })
  const items = enableGate(c, { callAsset: false, finalUrls: ['https://aa-x.vercel.app/'], conversionActions: 0 })
  assert.deepEqual(keys(items), ['billing', 'call_asset', 'conversion_actions', 'final_urls', 'tracking'])
  assert.match(items.find((i) => i.key === 'final_urls')!.text, /vercel\.app/)
  assert.match(enableHold(items)!, /^Not done: /)
  assert.equal(enableHold([]), null)
})

test('enable gate: final URLs off the live domain are named; evidence fills unknown facts', () => {
  const c = client()
  const items = enableGate(c, { finalUrls: ['https://other-site.com/'] })
  assert.deepEqual(keys(items), ['final_urls'])
  assert.match(items[0].text, /other-site\.com.*example-painting\.com/)
  assert.deepEqual(enableGate(c, {}), [])
})

test('enable gate: skip waives an item', () => {
  const c = client({ notes: [] })
  assert.deepEqual(keys(enableGate(c, {})), ['billing'])
  assert.deepEqual(enableGate(c, {}, 'enable it, skip billing'), [])
})

test('reportGaps names omissions only', () => {
  assert.deepEqual(reportGaps(client()), [])
  const building = client({ website: { step: 'build', evidence: {} }, domain: null, ads: { step: 'campaign_build', evidence: {} }, notes: [] })
  // Mid-build: no domain or ads items yet, but the tag and owner contact are givens.
  assert.deepEqual(reportGaps(building), ['Google tag is not on the site'])
  const built = client({ ads: { step: 'enable', evidence: {} }, notes: [] })
  assert.deepEqual(reportGaps(built), ['no call asset recorded', 'billing is not confirmed', 'no conversion actions recorded'])
})
