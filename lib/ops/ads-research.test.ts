import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'fs'
import { join } from 'path'
import { BRIEF_SECTIONS, aggregateLearnings, briefSections, budgetCheck, learningWindow, median, monthlyFromDaily, parseBrief } from './ads-research'
import { ADS_APPLY_TOOLS, ADS_READ_TOOLS, ADS_WORK_TOOLS, RESEARCH_MAX_CALLS, researchSearch, type AdsToolContext } from './hq/ads-tools'
import { RESEARCH_TOOL_NAMES } from './hq/research-tools'

const body = (over: Partial<Record<(typeof BRIEF_SECTIONS)[number], string>> = {}) =>
  BRIEF_SECTIONS.map((h) => {
    const text =
      over[h] ??
      (h === 'Target keywords'
        ? '| Term | Match type | Monthly volume | Bid range | Source |\n|---|---|---|---|---|\n| junk removal katy | PHRASE | 320 | $4.10 to $11.80 | planner |'
        : `${h}: 3 lines (intake q2).`)
    return `## ${h}\n${text}`
  }).join('\n\n')

const data = (over: Record<string, unknown> = {}) => ({
  terms: [{ term: 'junk removal katy', matchType: 'PHRASE', monthlyVolume: 320, bidLow: 4.1, bidHigh: 11.8, source: 'planner' }],
  negatives: [{ term: 'jobs', source: 'playbook' }, 'free'].map((n) => (typeof n === 'string' ? { term: n, source: 'playbook' } : n)),
  geo: { cities: ['Katy, TX'], radiusMiles: null, presence: true },
  schedule: { summary: 'Mon to Sat 8 AM to 6 PM', source: 'intake hours' },
  budget: { dailyRecommended: 13, monthly: 395.2, basis: 'intake q18 $400 / 30.4, rounded down' },
  siblings: [{ customerId: '646-798-4739', name: 'Just Junk It', convertingTerms: ['junk removal near me'], cpc: 6.2, costPerConv: 41 }],
  ...over,
})

test('parseBrief: a complete brief passes and is cleaned', () => {
  const r = parseBrief(body(), data())
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.equal(r.data.siblings[0].customerId, '6467984739')
  assert.equal(r.data.terms[0].matchType, 'PHRASE')
  assert.equal(r.data.geo.presence, true)
})

test('parseBrief: "none found" sections pass, empty ones do not', () => {
  assert.equal(parseBrief(body({ 'Siblings in this trade': 'none found', 'Target keywords': 'none found' }), data({ terms: [], siblings: [] })).ok, true)
  const r = parseBrief(body({ 'Questions for Jacob': '' }), data())
  assert.equal(r.ok, false)
  if (!r.ok) assert.ok(r.problems.some((p) => p.includes('Questions for Jacob') && p.includes('empty')))
})

test('parseBrief: missing and out-of-order sections are named', () => {
  const missing = body().replace(/## Geo\n[^\n]*\n\n/, '')
  const r1 = parseBrief(missing, data())
  assert.equal(r1.ok, false)
  if (!r1.ok) assert.ok(r1.problems.includes('section "## Geo" is missing'))
  const swapped = body().replace('## Negatives', '## TMP').replace('## Target keywords', '## Negatives').replace('## TMP', '## Target keywords')
  const r2 = parseBrief(swapped, data())
  assert.equal(r2.ok, false)
  if (!r2.ok) assert.ok(r2.problems.some((p) => p.includes('out of order')))
})

test('parseBrief: keywords must be a table, no em dashes', () => {
  const r = parseBrief(body({ 'Target keywords': '- junk removal katy, phrase' }), data())
  assert.equal(r.ok, false)
  if (!r.ok) assert.ok(r.problems.some((p) => p.includes('markdown table')))
  const dash = parseBrief(body({ Geo: 'Katy \u2014 Presence only' }), data())
  assert.equal(dash.ok, false)
  if (!dash.ok) assert.ok(dash.problems.some((p) => p.includes('em dash')))
})

test('parseBrief: every term and negative needs a source; budget math is checked', () => {
  const r = parseBrief(
    body(),
    data({
      terms: [{ term: 'junk removal', matchType: 'exactish', monthlyVolume: '320', bidLow: null, bidHigh: null, source: '' }],
      negatives: [{ term: 'jobs' }],
      budget: { dailyRecommended: 13, monthly: 400, basis: '' },
      geo: { cities: 'Katy', presence: 'yes' },
    })
  )
  assert.equal(r.ok, false)
  if (r.ok) return
  const all = r.problems.join('\n')
  for (const want of ['matchType', 'monthlyVolume', 'terms[0].source', 'negatives[0].source', 'x 30.4', 'basis', 'geo.cities', 'presence']) assert.ok(all.includes(want), want)
})

test('parseBrief: non-object data reports every missing piece', () => {
  const r = parseBrief(body(), null)
  assert.equal(r.ok, false)
  if (!r.ok) assert.ok(r.problems.length >= 5)
})

test('briefSections splits on ## headings', () => {
  const s = briefSections('intro\n## A\none\n## B\n\ntwo\n')
  assert.deepEqual(s, [{ heading: 'A', text: 'one' }, { heading: 'B', text: 'two' }])
})

test('budget: monthly is daily x 30.4, clicks a day at the median CPC', () => {
  assert.equal(monthlyFromDaily(13), 395.2)
  assert.deepEqual(budgetCheck(13, 6.5), { daily: 13, monthly: 395.2, inNorm: true, clicksPerDay: 2 })
  assert.equal(budgetCheck(20, null).inNorm, false)
  assert.equal(budgetCheck(20, null).clicksPerDay, null)
  assert.equal(median([8, 2, 5]), 5)
  assert.equal(median([2, 5, 8, 9]), 6.5)
  assert.equal(median([]), null)
})

test('aggregateLearnings: sums terms across accounts, splits converting and wasted', () => {
  const agg = aggregateLearnings([
    {
      customerId: '1',
      name: 'A',
      campaigns: [{ cost: 300, conversions: 6, clicks: 50 }],
      terms: [
        { term: 'Junk Removal Near Me', cost: 120, conversions: 4, clicks: 20 },
        { term: 'junk removal jobs', cost: 30, conversions: 0, clicks: 6 },
        { term: 'cheap dumpster', cost: 4, conversions: 0, clicks: 1 },
      ],
      negatives: ['jobs', 'free'],
    },
    {
      customerId: '2',
      name: 'B',
      campaigns: [{ cost: 100, conversions: 0, clicks: 25 }],
      terms: [
        { term: 'junk removal near me ', cost: 60, conversions: 1, clicks: 10 },
        { term: 'junk removal jobs', cost: 15, conversions: 0, clicks: 3 },
      ],
      negatives: ['Jobs'],
    },
  ])
  assert.deepEqual(agg.accounts, [
    { customerId: '1', name: 'A', cost: 300, conversions: 6, costPerConv: 50, cpc: 6 },
    { customerId: '2', name: 'B', cost: 100, conversions: 0, costPerConv: null, cpc: 4 },
  ])
  assert.deepEqual(agg.convertingTerms, [{ term: 'junk removal near me', conversions: 5, cost: 180, clicks: 30, accounts: 2 }])
  // "cheap dumpster" cost $4, under the $10 waste floor.
  assert.deepEqual(agg.wastedTerms, [{ term: 'junk removal jobs', conversions: 0, cost: 45, clicks: 9, accounts: 2 }])
  assert.deepEqual(agg.negativesInUse, [{ term: 'jobs', accounts: 2 }, { term: 'free', accounts: 1 }])
  assert.deepEqual(agg.totals, { cost: 400, conversions: 6, clicks: 75, costPerConv: 66.67, cpc: 5.33 })
})

test('learningWindow: the 30 days ending yesterday', () => {
  const w = learningWindow(new Date('2026-11-02T09:17:00Z'))
  assert.equal(w.endDay, '2026-11-01')
  assert.equal(w.startDay, '2026-10-03')
  assert.equal(w.start.toISOString(), '2026-10-03T00:00:00.000Z')
})

// ── The Research desk never writes to Google Ads ────────────────────────────

const src = (p: string) => readFileSync(join(__dirname, p), 'utf8')
const WRITES = /\bmutate\b|mutateResources|validate_only|validateOnly|\.create\(\s*\[|\.update\(\s*\[|\.remove\(\s*\[/

test('no-write check: no research tool is a write tool by name', () => {
  const writes = new Set([...ADS_WORK_TOOLS, ...ADS_APPLY_TOOLS, 'set_ads_step', 'bind_account'])
  for (const n of RESEARCH_TOOL_NAMES) {
    assert.ok(!writes.has(n), `${n} is an ads write tool`)
    assert.ok(!/mutate|add_|set_|create|pause|enable|remove|upsert|bind/.test(n), `${n} reads like a write`)
  }
  // The research tools are not the ads specialist's reads either: they cannot be swapped in by name.
  for (const n of RESEARCH_TOOL_NAMES) assert.ok(!ADS_READ_TOOLS.includes(n) || n === 'read_spec', n)
})

test('no-write check: research code never calls a write path', () => {
  for (const f of ['hq/research-tools.ts', 'hq/research.ts', 'hq/learnings.ts']) assert.ok(!WRITES.test(src(f)), `${f} mentions a Google Ads write`)
  // The read helpers in ads-tools.ts, from their marker to the end of the file.
  const ads = src('hq/ads-tools.ts')
  const at = ads.indexOf('// ── Read-only access for the Research desk')
  assert.ok(at > 0, 'marker missing in ads-tools.ts')
  assert.ok(!WRITES.test(ads.slice(at)), 'a research read helper mentions a write')
})

test('no-write check: research files import only the read helpers from ads-tools', () => {
  const allowed = new Set(['enumName', 'isNeverTouch', 'microsToUsd', 'researchKeywordIdeas', 'researchSearch', 'researchSuggestGeo', 'RESEARCH_MAX_CALLS', 'missingAdsEnv', 'type AdsToolContext'])
  for (const f of ['hq/research-tools.ts', 'hq/research.ts', 'hq/learnings.ts']) {
    const m = src(f).match(/import \{([^}]*)\} from '\.\/ads-tools'/)
    assert.ok(m, `${f} imports ads-tools`)
    for (const name of m![1].split(',').map((s) => s.trim()).filter(Boolean)) assert.ok(allowed.has(name), `${f} imports ${name} from ads-tools`)
  }
})

test('research calls: capped at RESEARCH_MAX_CALLS where the ads specialist counts its 150; never-touch and non-SELECT refused', async () => {
  assert.equal(RESEARCH_MAX_CALLS, 60)
  const ctx: AdsToolContext = { runId: '', customerId: '', client: 'X', engagementId: null, mode: 'work', dry: true, calls: RESEARCH_MAX_CALLS, writes: [], maxCalls: RESEARCH_MAX_CALLS }
  await assert.rejects(researchSearch(ctx, '1234567890', 'Just Junk It', 'SELECT campaign.id FROM campaign'), /used its 60 Google Ads calls/)
  await assert.rejects(researchSearch(ctx, '1234567890', 'MK2 Auto Spa', 'SELECT campaign.id FROM campaign'), /never-touch/)
  await assert.rejects(researchSearch({ ...ctx, calls: 0 }, '1234567890', 'Just Junk It', 'DELETE campaign'), /GAQL SELECT/)
})
