import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  canStructuralChange,
  capHold,
  cpcCutAllowed,
  decisionCaps,
  filterReviewProposals,
  isVerifiedAction,
  lastChangeAt,
  structuralBlockers,
  trackingState,
  type StructuralFacts,
} from './hq/ads-gates'

const ok: StructuralFacts = { campaignAgeDays: 40, clicksSinceLastChange: 180, daysSinceLastChange: 12, biddingStatus: 'ENABLED' }

test('canStructuralChange: all four gates', () => {
  assert.equal(canStructuralChange(ok), true)
  assert.equal(canStructuralChange({ ...ok, campaignAgeDays: 13 }), false)
  assert.equal(canStructuralChange({ ...ok, campaignAgeDays: 14 }), true)
  assert.equal(canStructuralChange({ ...ok, clicksSinceLastChange: 99 }), false)
  assert.equal(canStructuralChange({ ...ok, clicksSinceLastChange: 100 }), true)
  assert.equal(canStructuralChange({ ...ok, daysSinceLastChange: 6 }), false)
  assert.equal(canStructuralChange({ ...ok, daysSinceLastChange: 7 }), true)
  for (const s of ['LEARNING_NEW', 'LEARNING_SETTING_CHANGE', 'LEARNING_BUDGET_CHANGE', 'LEARNING_COMPOSITION_CHANGE']) assert.equal(canStructuralChange({ ...ok, biddingStatus: s }), false, s)
  assert.equal(canStructuralChange({ ...ok, biddingStatus: 'LIMITED_BY_BUDGET' }), true)
})

test('canStructuralChange: unknown numbers block, with the reason', () => {
  const b = structuralBlockers({ campaignAgeDays: null, clicksSinceLastChange: null, daysSinceLastChange: null, biddingStatus: null })
  assert.equal(b.length, 3)
  assert.ok(b[0].includes('unknown'))
})

test('cpcCutAllowed: over 2x the trade median, zero conversions, 30+ clicks', () => {
  const g = { avgCpc: 13, tradeMedianCpc: 6, conversions30d: 0, clicks30d: 30 }
  assert.equal(cpcCutAllowed(g), true)
  assert.equal(cpcCutAllowed({ ...g, avgCpc: 12 }), false)
  assert.equal(cpcCutAllowed({ ...g, conversions30d: 1 }), false)
  assert.equal(cpcCutAllowed({ ...g, clicks30d: 29 }), false)
  assert.equal(cpcCutAllowed({ ...g, tradeMedianCpc: null }), false)
  assert.equal(cpcCutAllowed({ ...g, avgCpc: null }), false)
})

const action = (over = {}) => ({ name: 'Lead form', type: 'WEBPAGE', status: 'ENABLED', primary: true, allConversions90d: 0, tagLive: false, ...over })

test('isVerifiedAction: enabled + primary + (recorded, Google-recorded, or tag live)', () => {
  assert.equal(isVerifiedAction(action()), false)
  assert.equal(isVerifiedAction(action({ allConversions90d: 2 })), true)
  assert.equal(isVerifiedAction(action({ tagLive: true })), true)
  assert.equal(isVerifiedAction(action({ type: 'AD_CALL' })), true)
  assert.equal(isVerifiedAction(action({ type: 'AD_CALL', primary: false })), false)
  assert.equal(isVerifiedAction(action({ allConversions90d: 5, status: 'HIDDEN' })), false)
})

test('trackingState: unverified, no_data, recording', () => {
  assert.equal(trackingState({ conversionActions: [], conversions30d: 0, clicks30d: 400 }), 'unverified')
  assert.equal(trackingState({ conversionActions: [{ verified: false }], conversions30d: 3, clicks30d: 400 }), 'unverified')
  assert.equal(trackingState({ conversionActions: [{ verified: true }], conversions30d: 0, clicks30d: 49 }), 'no_data')
  assert.equal(trackingState({ conversionActions: [{ verified: true }], conversions30d: 0, clicks30d: 50 }), 'recording')
  assert.equal(trackingState({ conversionActions: [{ verified: true }], conversions30d: 2, clicks30d: 10 }), 'recording')
})

test('decisionCaps: daily, monthly and weekly caps; no dollar amount is no cap', () => {
  const caps = decisionCaps(['Never exceed $400/month on ads', 'Budget cap $15 a day', 'Client wants calls only', 'Max $70 per week', 'Paid $500 setup'])
  assert.deepEqual(caps, [
    { text: 'Never exceed $400/month on ads', dailyCap: 13.16 },
    { text: 'Budget cap $15 a day', dailyCap: 15 },
    { text: 'Max $70 per week', dailyCap: 10 },
  ])
})

test('capHold: a budget over the lowest cap, or added spend that passes it, is held with the decision text', () => {
  const caps = decisionCaps(['Never exceed $400/month on ads'])
  assert.equal(capHold({ action: 'set_campaign_budget', args: { campaignId: '1', dailyBudget: 15 }, monthlyCostChange: 60 }, caps, 12), 'Never exceed $400/month on ads')
  assert.equal(capHold({ action: 'set_campaign_budget', args: { campaignId: '1', dailyBudget: 13 }, monthlyCostChange: 30 }, caps, 12), null)
  assert.equal(capHold({ action: 'set_ad_group_cpc', args: { adGroupId: '2', cpc: 9 }, monthlyCostChange: 60 }, caps, 12), 'Never exceed $400/month on ads')
  assert.equal(capHold({ action: 'set_ad_group_cpc', args: { adGroupId: '2', cpc: 9 }, monthlyCostChange: 10 }, caps, 12), null)
  assert.equal(capHold({ action: 'set_campaign_budget', args: { dailyBudget: 99 }, monthlyCostChange: 0 }, [], 12), null)
})

test('filterReviewProposals: unverified tracking drops bids and budgets; gates and one structural per campaign', () => {
  const p = (title: string, action: string, campaignId = '1', args: Record<string, unknown> = {}) => ({ title, action, campaignId, args: { campaignId, ...args } })
  const facts = new Map<string, StructuralFacts>([
    ['1', ok],
    ['2', { ...ok, daysSinceLastChange: 3 }],
  ])
  const list = [p('budget', 'set_campaign_budget'), p('negatives', 'add_campaign_negatives'), p('pause group', 'pause_ad_group'), p('young', 'set_bidding_strategy', '2'), p('raise cpc', 'set_ad_group_cpc')]
  const un = filterReviewProposals(list, { tracking: 'unverified', factsFor: (id) => facts.get(id) ?? null })
  assert.deepEqual(un.kept.map((x) => x.title), ['negatives', 'pause group'])
  assert.equal(un.dropped.length, 3)
  const rec = filterReviewProposals(list, { tracking: 'recording', factsFor: (id) => facts.get(id) ?? null })
  assert.deepEqual(rec.kept.map((x) => x.title), ['budget', 'negatives', 'raise cpc'])
  assert.ok(rec.dropped.find((d) => d.title === 'pause group')?.reason.includes('already one structural'))
  assert.ok(rec.dropped.find((d) => d.title === 'young')?.reason.includes('3 days since the last change'))
  const unknown = filterReviewProposals([p('x', 'pause_campaign', '9')], { tracking: 'recording', factsFor: () => null })
  assert.equal(unknown.kept.length, 0)
})

test('lastChangeAt: newest structural or bid change for the campaign; negatives do not count', () => {
  const d = (s: string) => new Date(s)
  const ledger = [
    { at: d('2026-10-20'), tool: 'set_campaign_budget', campaignId: '1' },
    { at: d('2026-10-28'), tool: 'add_campaign_negatives', campaignId: '1' },
    { at: d('2026-10-25'), tool: 'pause_ad_group', campaignId: '2' },
    { at: d('2026-10-22'), tool: 'set_ad_group_cpc', campaignId: null },
  ]
  assert.equal(lastChangeAt(ledger, '1')?.toISOString().slice(0, 10), '2026-10-22')
  assert.equal(lastChangeAt(ledger, '2')?.toISOString().slice(0, 10), '2026-10-25')
  assert.equal(lastChangeAt([], '1'), null)
})

test('isVerifiedAction: Google-hosted local actions do not verify tracking', () => {
  assert.equal(isVerifiedAction(action({ type: 'GOOGLE_HOSTED' })), false)
  assert.equal(isVerifiedAction(action({ type: 'UPLOAD_CLICKS' })), true)
})
