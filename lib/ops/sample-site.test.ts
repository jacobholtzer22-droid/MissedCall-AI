// ===========================================
// SAMPLE_SITE_GUARD tests: production is not AA-Template's sample site
// ===========================================
// Run: npm test. fetch is stubbed; no network, no database.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { connectDomainRefusal, isSamplePage, sampleMarkersIn, sampleOnProductionWith, sampleSiteGuardEnabled, SAMPLE_SITE_TEXT } from './sample-site'
import { websiteChecks } from './checks/web'
import { goLiveGate, type GateClient } from './launch-gate'

const SAMPLE_HTML = `<html><head><title>Sample Lawn Care</title><meta name="robots" content="noindex"></head><body>
<h1>Reliable lawn care for homes across the Springfield area.</h1><a href="tel:+15555550123">(555) 555-0123</a>
<a href="mailto:hello@sample-lawn-care.com">Email</a><p>100 Sample Street</p></body></html>`
const REAL_HTML = `<html><head><title>Ridgeline Painting</title></head><body><h1>Interior and exterior painting</h1>
<a href="tel:+18015550100">(801) 555-0100</a><p>We are not a sample lawn care outfit.</p></body></html>`

function withEnv<T>(vars: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const old: Record<string, string | undefined> = {}
  for (const k of Object.keys(vars)) {
    old[k] = process.env[k]
    if (vars[k] === undefined) delete process.env[k]
    else process.env[k] = vars[k]
  }
  return fn().finally(() => {
    for (const k of Object.keys(old)) {
      if (old[k] === undefined) delete process.env[k]
      else process.env[k] = old[k]
    }
  })
}

function stubFetch(html: string) {
  const real = globalThis.fetch
  const calls: string[] = []
  globalThis.fetch = (async (url: string | URL) => {
    calls.push(String(url))
    return new Response(html, { status: 200, headers: { 'content-type': 'text/html' } })
  }) as typeof fetch
  return { calls, restore: () => (globalThis.fetch = real) }
}

const W = { step: 'approved', businessSlug: 'ridgeline-painting', repo: null, project: null, productionUrl: 'https://ridgeline-painting.vercel.app', googleAdsId: null }

test('flag is off unless exactly "true"', () => {
  assert.equal(sampleSiteGuardEnabled({}), false)
  assert.equal(sampleSiteGuardEnabled({ SAMPLE_SITE_GUARD: 'yes' }), false)
  assert.equal(sampleSiteGuardEnabled({ SAMPLE_SITE_GUARD: 'true' }), true)
})

test('detection: the sample page is red, a real page is not, one stray phrase is not', () => {
  assert.ok(isSamplePage(sampleMarkersIn(SAMPLE_HTML)))
  assert.ok(sampleMarkersIn(SAMPLE_HTML).length >= 5)
  assert.equal(isSamplePage(sampleMarkersIn(REAL_HTML)), false)
  assert.equal(isSamplePage(sampleMarkersIn('<p>Call (555) 555-0123</p>')), false)
})

test('web check with the flag on: http.not_sample red on the sample, green on a real site', async () => {
  await withEnv({ SAMPLE_SITE_GUARD: 'true' }, async () => {
    let f = stubFetch(SAMPLE_HTML)
    try {
      const red = (await websiteChecks(W)).results.find((x) => x.key === 'http.not_sample')
      assert.equal(red?.passed, false)
      assert.match(red?.detail ?? '', /production is still the template's sample site \(Sample Lawn Care\), not this client's site/)
      assert.match(red?.detail ?? '', /Merge the first build PR/)
    } finally {
      f.restore()
    }
    f = stubFetch(REAL_HTML)
    try {
      const green = (await websiteChecks(W)).results.find((x) => x.key === 'http.not_sample')
      assert.equal(green?.passed, true)
    } finally {
      f.restore()
    }
  })
})

test('flag off: no http.not_sample, probe results unchanged', async () => {
  await withEnv({ SAMPLE_SITE_GUARD: undefined }, async () => {
    const f = stubFetch(SAMPLE_HTML)
    try {
      const out = await websiteChecks(W)
      assert.equal(out.results.some((x) => x.key === 'http.not_sample'), false)
      assert.equal('sampleMarkers' in (out.probe ?? {}), false)
      assert.deepEqual(out.results.map((x) => x.key), ['vercel.project_found', 'vercel.git_linked', 'vercel.prod_ready', 'slug.matches_db', 'repo.has_workflow', 'http.indexing_matches_step', 'http.homepage_200', 'http.inner_page_200', 'http.google_tag'])
    } finally {
      f.restore()
    }
  })
})

test('connect_domain refusal: live read sees the sample', async () => {
  const probe = async () => ({ error: null, sampleMarkers: sampleMarkersIn(SAMPLE_HTML) })
  const detail = await sampleOnProductionWith('e1', 'https://x.vercel.app', probe, async () => null)
  assert.ok(detail)
  const msg = connectDomainRefusal('Ridgeline Painting', 'ridgeline-painting.com', detail)
  assert.match(msg, /^Not connecting ridgeline-painting\.com to Ridgeline Painting's site: production is still the template's sample site/)
  assert.match(msg, /Merge the first build PR so production is the client's site, then connect the domain\./)
})

test('connect_domain: a real site passes; a failed read falls back to the last check', async () => {
  const real = async () => ({ error: null, sampleMarkers: sampleMarkersIn(REAL_HTML) })
  assert.equal(await sampleOnProductionWith('e1', 'https://x.vercel.app', real, async () => ({ sampleSite: true })), null)
  const down = async () => ({ error: 'timeout' })
  assert.equal(await sampleOnProductionWith('e1', 'https://x.vercel.app', down, async () => ({ sampleSite: true, sampleSiteDetail: 'seen Oct 30' })), 'seen Oct 30')
  assert.equal(await sampleOnProductionWith('e1', null, down, async () => ({ sampleSite: false })), null)
  assert.equal(await sampleOnProductionWith('e1', null, down, async () => null), null)
})

const client = (sampleSite: boolean): GateClient => ({
  services: ['website'],
  website: { step: 'approved', evidence: { siteIndexableFlag: false, sampleSite } },
  domain: { step: 'live', manualStatus: null, computedStatus: 'live', evidence: {} },
  ads: null,
  owner: { email: 'o@example.com', phone: '+18015550100' },
  notes: [],
})

test('go-live gate: refuses on the sample with the flag on, and "skip" does not waive it', async () => {
  await withEnv({ SAMPLE_SITE_GUARD: 'true' }, async () => {
    const items = goLiveGate(client(true), 'go live, skip sample, skip sample site')
    assert.deepEqual(items.map((i) => i.key), ['sample_site'])
    assert.equal(items[0].text, `${SAMPLE_SITE_TEXT} (merge the first build PR; this one cannot be skipped)`)
    assert.deepEqual(goLiveGate(client(false)), [])
  })
})

test('go-live gate: flag off ignores the evidence', async () => {
  await withEnv({ SAMPLE_SITE_GUARD: undefined }, async () => {
    assert.deepEqual(goLiveGate(client(true)), [])
  })
})
