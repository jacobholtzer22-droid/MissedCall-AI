// ===========================================
// Ops HQ: the weekly ads review's data gates
// ===========================================
// Pure functions, no DB and no Google: what the weekly review (ads-review.ts)
// may change on its own, what it may only propose, and what it may not touch
// this week. Tested in ads-gates.test.ts.
//
//   Structural (bidding strategy, budget, pausing or enabling a campaign or an
//   ad group, adding or removing keywords): only when the campaign is 14+ days
//   old, has 100+ clicks and 7+ days since its last change, and is not in
//   Google's learning period. Never on its own: always a proposal for Push,
//   and at most one per campaign per week.
//   Non-structural, any week, made by the run itself: campaign negatives from
//   wasted or off-intent search terms, lowering an ad group CPC that is over 2x
//   the trade median with zero conversions on 30+ clicks, fixing a disapproved
//   RSA.
//   Tracking unverified: no bid or budget change at all, made or proposed.

export const STRUCTURAL_MIN_AGE_DAYS = 14
export const STRUCTURAL_MIN_CLICKS = 100
export const STRUCTURAL_MIN_DAYS_SINCE_CHANGE = 7
export const CPC_CUT_MIN_CLICKS = 30
export const CPC_CUT_MEDIAN_MULTIPLE = 2
export const NO_DATA_CLICKS = 50
export const DAYS_PER_MONTH = 30.4

/** Tools whose change is structural: they reset Google's learning or move spend. */
export const STRUCTURAL_TOOLS = [
  'set_bidding_strategy',
  'set_campaign_budget',
  'pause_campaign',
  'enable_campaign',
  'pause_ad_group',
  'enable_ad_group',
  'add_keywords',
  'remove_campaign_criterion',
  'create_ad_group',
  'create_search_campaign',
]
/** The three changes a review makes itself, any week. */
export const REVIEW_AUTO_TOOLS = ['add_campaign_negatives', 'set_ad_group_cpc', 'upsert_rsa']
/** Changes to bids, budgets or bidding: none at all while tracking is unverified. */
export const BID_BUDGET_TOOLS = ['set_ad_group_cpc', 'set_campaign_budget', 'set_bidding_strategy']
/** Work tools a review may PROPOSE (applied only from a review's own pushed approval). */
export const REVIEW_PROPOSABLE = ['pause_campaign', 'pause_ad_group', 'enable_ad_group', 'add_keywords', 'add_campaign_negatives', 'exclude_conversion_goal']

export const isStructural = (tool: string) => STRUCTURAL_TOOLS.includes(tool)
/** Google's bidding_strategy_system_status: every LEARNING_* value is the learning period. */
export const isLearning = (status: string | null | undefined) => /^LEARNING/i.test(String(status ?? ''))

export type StructuralFacts = {
  campaignAgeDays: number | null
  clicksSinceLastChange: number | null
  daysSinceLastChange: number | null
  biddingStatus: string | null
}

/** Why a structural change is not allowed this week; empty when it is. Unknown numbers count as not enough. */
export function structuralBlockers(f: StructuralFacts): string[] {
  const out: string[] = []
  if (f.campaignAgeDays === null || f.campaignAgeDays < STRUCTURAL_MIN_AGE_DAYS) out.push(`campaign is ${f.campaignAgeDays ?? 'an unknown number of'} days old (needs ${STRUCTURAL_MIN_AGE_DAYS})`)
  if (f.clicksSinceLastChange === null || f.clicksSinceLastChange < STRUCTURAL_MIN_CLICKS) out.push(`${f.clicksSinceLastChange ?? 'unknown'} clicks since the last change (needs ${STRUCTURAL_MIN_CLICKS})`)
  if (f.daysSinceLastChange === null || f.daysSinceLastChange < STRUCTURAL_MIN_DAYS_SINCE_CHANGE) out.push(`${f.daysSinceLastChange ?? 'unknown'} days since the last change (needs ${STRUCTURAL_MIN_DAYS_SINCE_CHANGE})`)
  if (isLearning(f.biddingStatus)) out.push(`bidding is ${f.biddingStatus} (Google's learning period)`)
  return out
}

export const canStructuralChange = (f: StructuralFacts) => structuralBlockers(f).length === 0

/** An ad group bid the review may lower itself: over 2x the trade median CPC, zero conversions on 30+ clicks (30 days). */
export function cpcCutAllowed(g: { avgCpc: number | null; tradeMedianCpc: number | null; conversions30d: number; clicks30d: number }): boolean {
  if (g.avgCpc === null || g.tradeMedianCpc === null || !(g.tradeMedianCpc > 0)) return false
  return g.avgCpc > CPC_CUT_MEDIAN_MULTIPLE * g.tradeMedianCpc && g.conversions30d === 0 && g.clicks30d >= CPC_CUT_MIN_CLICKS
}

// ── Tracking ────────────────────────────────────────────────────────────────

export type TrackingState = 'unverified' | 'no_data' | 'recording'

export type ConversionActionFacts = {
  name: string
  type: string | null
  status: string | null
  /** Counted in Conversions (a primary action): only those can steer bidding. */
  primary: boolean
  allConversions90d: number
  /** The Google tag on the client's site (Ops evidence); null when unknown. */
  tagLive: boolean | null
}

/**
 * Types Google records with no tag on the site: calls from an ad (call reporting) and
 * offline imports. Google-hosted local actions (directions, menu views) do not count:
 * they say nothing about leads.
 */
const GOOGLE_RECORDED = /^(AD_CALL|UPLOAD)/i

/**
 * A conversion action Google has seen working: enabled, primary, and either it
 * recorded something in the last 90 days, or Google records it itself (calls
 * from ads), or it is a website action and the site carries the Google tag.
 */
export function isVerifiedAction(a: ConversionActionFacts): boolean {
  if (a.status !== 'ENABLED' || !a.primary) return false
  if (a.allConversions90d > 0) return true
  if (GOOGLE_RECORDED.test(a.type ?? '')) return true
  return a.tagLive === true
}

/** 'unverified': no verified action. 'no_data': verified, zero conversions on under 50 clicks (30 days). 'recording' otherwise. */
export function trackingState(t: { conversionActions: { verified: boolean }[]; conversions30d: number; clicks30d: number }): TrackingState {
  if (!t.conversionActions.some((a) => a.verified)) return 'unverified'
  if (t.conversions30d === 0 && t.clicks30d < NO_DATA_CLICKS) return 'no_data'
  return 'recording'
}

// ── Recorded decisions ──────────────────────────────────────────────────────

export type DecisionCap = { text: string; dailyCap: number }

const CAP_WORDS = /\b(cap|caps|capped|max|maximum|never (exceed|go over|go above|spend more)|no more than|not more than|limit|at most|keep (it )?under|under|budget)\b/i

/**
 * Spend caps in the client's recorded decisions ("never exceed $400/month",
 * "budget cap $15 a day"). Monthly caps become daily at 30.4 days a month.
 * A decision with no dollar amount, or no cap wording, is not a cap.
 */
export function decisionCaps(decisions: string[]): DecisionCap[] {
  const out: DecisionCap[] = []
  for (const text of decisions) {
    if (!CAP_WORDS.test(text)) continue
    const m = text.match(/\$\s?(\d[\d,]*(?:\.\d+)?)\s*(?:\/|per |a |an |each )?\s*(day|daily|month|monthly|mo|week|weekly|wk)?/i)
    if (!m) continue
    const amount = Number(m[1].replace(/,/g, ''))
    if (!(amount > 0)) continue
    const unit = (m[2] ?? (/\b(month|monthly)\b/i.test(text) ? 'month' : /\bweek/i.test(text) ? 'week' : 'day')).toLowerCase()
    const daily = /^(month|monthly|mo)$/.test(unit) ? amount / DAYS_PER_MONTH : /^(week|weekly|wk)$/.test(unit) ? amount / 7 : amount
    out.push({ text, dailyCap: Math.round(daily * 100) / 100 })
  }
  return out
}

/**
 * The decision text a proposal would break, or null. A budget proposal is held
 * when its new daily budget is over the lowest cap; any other proposal that
 * adds spend is held when today's daily spend plus its monthly cost change
 * would pass it.
 */
export function capHold(p: { action: string; args: Record<string, unknown>; monthlyCostChange: number }, caps: DecisionCap[], currentDaily: number | null): string | null {
  if (!caps.length) return null
  const cap = caps.reduce((a, b) => (b.dailyCap < a.dailyCap ? b : a))
  if (p.action === 'set_campaign_budget') {
    const next = Number(p.args.dailyBudget)
    return Number.isFinite(next) && next > cap.dailyCap ? cap.text : null
  }
  if (p.monthlyCostChange > 0 && currentDaily !== null && currentDaily + p.monthlyCostChange / DAYS_PER_MONTH > cap.dailyCap) return cap.text
  return null
}

// ── Proposals ───────────────────────────────────────────────────────────────

export type GatedProposal = { title: string; action: string; campaignId: string; args: Record<string, unknown> }

/**
 * Which proposals a review may file. Dropped: bid and budget changes while
 * tracking is unverified; structural changes on a campaign whose gate fails;
 * a second structural change for the same campaign (the first one stays).
 */
export function filterReviewProposals<P extends GatedProposal>(
  proposals: P[],
  opts: { tracking: TrackingState; factsFor: (campaignId: string) => StructuralFacts | null }
): { kept: P[]; dropped: { title: string; reason: string }[] } {
  const kept: P[] = []
  const dropped: { title: string; reason: string }[] = []
  const structuralFor = new Set<string>()
  for (const p of proposals) {
    const campaignId = String(p.args.campaignId ?? p.campaignId ?? '')
    if (opts.tracking === 'unverified' && BID_BUDGET_TOOLS.includes(p.action)) {
      dropped.push({ title: p.title, reason: 'tracking is unverified: no bid or budget change' })
      continue
    }
    if (isStructural(p.action)) {
      const facts = campaignId ? opts.factsFor(campaignId) : null
      const blockers = facts ? structuralBlockers(facts) : ['the campaign is unknown to this review']
      if (blockers.length) {
        dropped.push({ title: p.title, reason: `structural change not allowed this week: ${blockers.join('; ')}` })
        continue
      }
      if (structuralFor.has(campaignId)) {
        dropped.push({ title: p.title, reason: `already one structural proposal for campaign ${campaignId} this week` })
        continue
      }
      structuralFor.add(campaignId)
    }
    kept.push(p)
  }
  return { kept, dropped }
}

// ── The change ledger ───────────────────────────────────────────────────────

export type LedgerEntry = { at: Date; tool: string; campaignId: string | null }

/**
 * The newest structural or bid change on one campaign from the platform's own
 * records (review changes and applied approvals). An entry with no campaign
 * (e.g. an ad group bid) counts for every campaign: the review cannot tell.
 */
export function lastChangeAt(ledger: LedgerEntry[], campaignId: string): Date | null {
  let best: Date | null = null
  for (const e of ledger) {
    if (!isStructural(e.tool) && !BID_BUDGET_TOOLS.includes(e.tool)) continue
    if (e.campaignId && e.campaignId !== campaignId) continue
    if (!best || e.at > best) best = e.at
  }
  return best
}

export const daysBetween = (from: Date, to: Date) => Math.floor((to.getTime() - from.getTime()) / 86_400_000)
