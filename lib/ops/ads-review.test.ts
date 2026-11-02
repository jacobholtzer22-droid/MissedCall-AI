import { test } from 'node:test'
import assert from 'node:assert/strict'
import { adsReviewAlerts, computeEngagementAlerts, type AdsReviewAlertInput } from './alerts'
import { campaignRowsFrom, outcomeLine, parseReviewReport, rankOutcomes, reviewSummary, sumMetrics, type ReviewOutcome } from './hq/ads-review-report'
import { adsWeekLine } from './client-status'
import { checkProposal } from './hq/ads-tools'

const NOW = new Date('2026-11-09T15:00:00Z')
const review = (over: Partial<AdsReviewAlertInput> & { m?: Record<string, unknown> } = {}): AdsReviewAlertInput => ({
  trackingState: 'recording',
  createdAt: '2026-11-09T14:05:00Z',
  ...over,
  metrics: {
    d7: { cost: 84.2, clicks: 15, conversions: 1, lostToBudget: 0.05 },
    d30: { cost: 350, clicks: 60, conversions: 3 },
    enabledCampaigns: 1,
    disapprovedAds: 0,
    ...(over.m ?? {}),
  },
})
const codes = (r: AdsReviewAlertInput) => adsReviewAlerts(r, NOW).map((a) => `${a.code}:${a.severity}`)

test('ads alerts: a healthy review raises none', () => {
  assert.deepEqual(codes(review()), [])
})

test('ads_tag_unverified: red, enabled campaign and tracking unverified, with the spend', () => {
  const a = adsReviewAlerts(review({ trackingState: 'unverified' }), NOW)
  assert.deepEqual(a.map((x) => `${x.code}:${x.severity}`), ['ads_tag_unverified:red'])
  assert.equal(a[0].message, 'Conversion tracking unverified, 1 campaign running, $84 spent in 7 days')
  assert.deepEqual(codes(review({ trackingState: 'unverified', m: { enabledCampaigns: 0, d7: { cost: 0 } } })), [])
})

test('ads_no_conversions: yellow, 30d cost >= 100, zero conversions, only while tracking records', () => {
  const r = review({ m: { d30: { cost: 100, clicks: 40, conversions: 0 } } })
  assert.deepEqual(codes(r), ['ads_no_conversions:yellow'])
  assert.equal(adsReviewAlerts(r, NOW)[0].message, '$100 in 30 days, 40 clicks, 0 conversions')
  assert.deepEqual(codes(review({ m: { d30: { cost: 99, clicks: 40, conversions: 0 } } })), [])
  assert.deepEqual(codes(review({ trackingState: 'no_data', m: { d30: { cost: 300, clicks: 40, conversions: 0 } } })), [])
})

test('ads_budget_limited: yellow, over 20% lost to budget in 7 days', () => {
  const r = review({ m: { d7: { cost: 70, clicks: 10, conversions: 1, lostToBudget: 0.34 } } })
  assert.deepEqual(codes(r), ['ads_budget_limited:yellow'])
  assert.equal(adsReviewAlerts(r, NOW)[0].message, 'Lost 34% of search impressions to budget in 7 days')
  assert.deepEqual(codes(review({ m: { d7: { cost: 70, clicks: 10, conversions: 1, lostToBudget: 0.2 } } })), [])
})

test('ads_disapproved: red, with the count', () => {
  const r = review({ m: { disapprovedAds: 2 } })
  assert.deepEqual(codes(r), ['ads_disapproved:red'])
  assert.equal(adsReviewAlerts(r, NOW)[0].message, '2 ads disapproved')
})

test('ads_zero_spend: yellow, enabled campaign and $0 in 7 days', () => {
  const r = review({ m: { enabledCampaigns: 2, d7: { cost: 0, clicks: 0, conversions: 0 } } })
  assert.deepEqual(codes(r), ['ads_zero_spend:yellow'])
  assert.equal(adsReviewAlerts(r, NOW)[0].message, '2 campaigns enabled, $0 spent in 7 days')
})

test('ads alerts: a review older than 14 days, or no review, raises none', () => {
  assert.deepEqual(codes(review({ trackingState: 'unverified', createdAt: '2026-10-25T00:00:00Z' })), [])
  assert.deepEqual(adsReviewAlerts(null, NOW), [])
})

test('computeEngagementAlerts: ads alerts only for a client buying ads; they set health', () => {
  const e = { stage: 'active', services: ['ads'], businessId: null, stripeCustomerId: 'cus_1', stripeSubscriptionStatus: 'active', upfrontPaidAt: null, nextFollowUpAt: null, createdAt: '2026-09-01' }
  const r = computeEngagementAlerts(e, [], null, NOW, review({ trackingState: 'unverified' }))
  assert.equal(r.health, 'red')
  assert.ok(r.alerts.some((a) => a.code === 'ads_tag_unverified'))
  const web = computeEngagementAlerts({ ...e, services: ['website'] }, [], null, NOW, review({ trackingState: 'unverified' }))
  assert.equal(web.alerts.length, 0)
  assert.equal(computeEngagementAlerts(e, [], null, NOW).health, 'green')
})

test('sumMetrics: totals, CPC, cost per conversion, impression share weighted by eligible impressions', () => {
  const rows = campaignRowsFrom([
    { campaign: { id: 1, name: 'A' }, metrics: { impressions: 500, clicks: 20, cost_micros: 120_000_000, conversions: 2, search_impression_share: 0.5, search_budget_lost_impression_share: 0.3, search_rank_lost_impression_share: 0.2 } },
    { campaign: { id: 2, name: 'B' }, metrics: { impressions: 100, clicks: 5, cost_micros: 30_000_000, conversions: 0, search_impression_share: 0.1, search_budget_lost_impression_share: 0, search_rank_lost_impression_share: 0.9 } },
  ])
  const m = sumMetrics(rows)
  assert.equal(m.cost, 150)
  assert.equal(m.clicks, 25)
  assert.equal(m.cpc, 6)
  assert.equal(m.costPerConversion, 75)
  // eligible: 1000 + 1000; share 600/2000; budget (300 + 0)/2000; rank (200 + 900)/2000
  assert.equal(m.searchImpressionShare, 0.3)
  assert.equal(m.lostToBudget, 0.15)
  assert.equal(m.lostToRank, 0.55)
  assert.equal(sumMetrics([]).cpc, null)
})

test('parseReviewReport: the last json fence, proposals cleaned', () => {
  const text = 'notes\n```json\n{"x":1}\n```\nfinal\n```json\n{"metrics7d":{},"metrics30d":{},"trackingState":"recording","changes":[{"tool":"add_campaign_negatives","campaignId":"1","change":"added 4 negatives"}],"proposals":[{"title":"Raise budget","action":"set_campaign_budget","campaignId":"1","args":{"campaignId":"1","dailyBudget":20},"monthlyCostChange":152,"why":"lost 34% to budget"},{"title":""}],"flags":["ads_budget_limited"],"nextCheck":"CPC","summary":"a\\nb"}\n```'
  const { report, error } = parseReviewReport(text)
  assert.equal(error, null)
  assert.equal(report!.trackingState, 'recording')
  assert.equal(report!.proposals.length, 1)
  assert.equal(report!.proposals[0].monthlyCostChange, 152)
  assert.equal(report!.changes[0].change, 'added 4 negatives')
  assert.equal(parseReviewReport('no json here').error, 'no JSON block in the output')
})

test('reviewSummary: keeps a 5 to 12 line model summary, else writes one from the numbers', () => {
  const m = sumMetrics([])
  const f = { client: 'X', tracking: 'unverified' as const, d7: m, d30: m, changes: 0, proposals: 1, flags: ['ads_tag_unverified'] }
  const five = '1\n2\n3\n4\n5'
  assert.equal(reviewSummary(five, f), five)
  const code = reviewSummary('too short', f)
  assert.ok(code.split('\n').length >= 5 && code.split('\n').length <= 12)
  assert.ok(code.startsWith('- X: tracking unverified'))
})

test('rankOutcomes: failures, then tracking problems, then wasted money, then proposals', () => {
  const m = (cost: number, conversions: number) => ({ ...sumMetrics([]), cost, conversions })
  const list: ReviewOutcome[] = [
    { client: 'Fine', engagementId: '1', trackingState: 'recording', d30: m(200, 4), proposals: 0 },
    { client: 'Waste', engagementId: '2', trackingState: 'recording', d30: m(300, 0), proposals: 0 },
    { client: 'Untracked', engagementId: '3', trackingState: 'unverified', d30: m(10, 0), proposals: 0 },
    { client: 'Broken', engagementId: '4', failed: 'Google said no' },
    { client: 'Busy', engagementId: '5', trackingState: 'recording', d30: m(200, 4), proposals: 3 },
    { client: 'NoData', engagementId: '6', trackingState: 'no_data', d30: m(40, 0), proposals: 0 },
  ]
  assert.deepEqual(rankOutcomes(list).map((o) => o.client), ['Broken', 'Untracked', 'NoData', 'Waste', 'Busy', 'Fine'])
  const line = outcomeLine({ client: 'Waste', engagementId: '2', trackingState: 'recording', d7: m(70, 0), d30: m(300, 0), changes: 1, proposals: 0, flags: ['ads_no_conversions'] })
  assert.equal(line, '- **Waste**: tracking recording; 7d $70.00, 0 clicks, no conversions; $300.00 in 30d with no conversion; 1 change, 0 proposals; flags: no conversions')
})

test('adsWeekLine: 7d cost per conversion, or no conversions while recording', () => {
  assert.equal(adsWeekLine({ trackingState: 'recording', d7: { conversions: 3, costPerConversion: 41.6 } }), '$42/conv (7d)')
  assert.equal(adsWeekLine({ trackingState: 'recording', d7: { conversions: 0, costPerConversion: null } }), 'no conversions')
  assert.equal(adsWeekLine({ trackingState: 'unverified', d7: { conversions: 0, costPerConversion: null } }), null)
  assert.equal(adsWeekLine(null), null)
})

test('checkProposal: review proposals may name the structural work tools; others may not', () => {
  assert.equal(checkProposal('pause_ad_group', { campaignId: '1', adGroupId: '2' }, { review: true }), null)
  assert.ok(checkProposal('pause_ad_group', { campaignId: '1', adGroupId: '2' })?.includes('is not one of'))
  assert.equal(checkProposal('set_campaign_budget', { campaignId: '1', dailyBudget: 20 }, { review: true }), null)
})

test('review runs: only the three review writes are handed out, and each is gated before Google', async () => {
  const { adsTools } = await import('./hq/ads-tools')
  const ctx = {
    runId: '',
    customerId: '1234567890',
    client: 'Just Junk It',
    engagementId: null,
    mode: 'work' as const,
    dry: true,
    calls: 0,
    writes: [],
    review: { tracking: 'unverified' as const, tradeKey: 'junk_removal', tradeMedianCpc: 6, disapprovedAdGroups: ['55'] },
  }
  const tools = adsTools(ctx)
  const names = tools.map((t) => t.name)
  for (const w of ['add_campaign_negatives', 'set_ad_group_cpc', 'upsert_rsa', 'read_learnings']) assert.ok(names.includes(w), w)
  for (const w of ['pause_campaign', 'pause_ad_group', 'add_keywords', 'create_search_campaign', 'set_campaign_budget', 'set_bidding_strategy', 'enable_campaign', 'set_ads_step', 'bind_account']) assert.ok(!names.includes(w), w)
  const run = (name: string, input: Record<string, unknown>) => tools.find((t) => t.name === name)!.run({ customerId: '1234567890', ...input })
  await assert.rejects(run('set_ad_group_cpc', { adGroupId: '55', cpc: 3 }), /tracking is unverified/)
  await assert.rejects(run('upsert_rsa', { adGroupId: '77', finalUrl: 'https://x.com', headlines: ['a', 'b', 'c'], descriptions: ['d', 'e'] }), /no disapproved ad/)
  assert.equal(ctx.calls, 0)
})
