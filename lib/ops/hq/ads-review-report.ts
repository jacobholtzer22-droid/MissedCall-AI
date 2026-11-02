// ===========================================
// Ops HQ: the weekly ads review's numbers and report (pure)
// ===========================================
// No DB, no Google, no model: summing campaign rows into the 7d and 30d
// metrics, parsing the run's closing JSON, the code-written summary, and the
// job report's one line per client, worst first. Used by ads-review.ts; tested
// in lib/ops/ads-review.test.ts.

import type { TrackingState } from './ads-gates'

/** Every weekly ads review job's prompt starts with this (the chat keys its approval cards on it). */
export const REVIEW_JOB_PREFIX = 'Weekly ads review'

export type CampaignRow = {
  id: string
  name: string
  status: string | null
  impressions: number
  clicks: number
  cost: number
  conversions: number
  /** 0 to 1, null when Google has none (low volume). */
  searchImpressionShare: number | null
  lostToBudget: number | null
  lostToRank: number | null
}

export type ReviewMetrics = {
  cost: number
  clicks: number
  impressions: number
  cpc: number | null
  conversions: number
  costPerConversion: number | null
  /** 0 to 1, weighted by each campaign's eligible impressions; null when no campaign reports it. */
  searchImpressionShare: number | null
  lostToBudget: number | null
  lostToRank: number | null
}

const round2 = (n: number) => Math.round(n * 100) / 100
const n = (v: unknown) => (v === null || v === undefined ? 0 : Number(v) || 0)
const share = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v))

/** Raw campaign metric rows from GAQL (google-ads-api objects) to CampaignRow; cost from micros. */
export function campaignRowsFrom(rows: any[]): CampaignRow[] {
  return rows.map((x) => ({
    id: String(x.campaign?.id ?? ''),
    name: String(x.campaign?.name ?? ''),
    status: x.campaign?.status === undefined || x.campaign?.status === null ? null : String(x.campaign.status),
    impressions: n(x.metrics?.impressions),
    clicks: n(x.metrics?.clicks),
    cost: round2(n(x.metrics?.cost_micros) / 1_000_000),
    conversions: round2(n(x.metrics?.conversions)),
    searchImpressionShare: share(x.metrics?.search_impression_share),
    lostToBudget: share(x.metrics?.search_budget_lost_impression_share),
    lostToRank: share(x.metrics?.search_rank_lost_impression_share),
  }))
}
const round3 = (n: number) => Math.round(n * 1000) / 1000

/**
 * One set of totals across campaigns. Impression share and what lost it are
 * weighted by eligible impressions (impressions / share), the way Google
 * would total them; a campaign with no share is left out of those three.
 */
export function sumMetrics(rows: CampaignRow[]): ReviewMetrics {
  const cost = round2(rows.reduce((n, r) => n + r.cost, 0))
  const clicks = rows.reduce((n, r) => n + r.clicks, 0)
  const impressions = rows.reduce((n, r) => n + r.impressions, 0)
  const conversions = round2(rows.reduce((n, r) => n + r.conversions, 0))
  let eligible = 0
  let budget = 0
  let rank = 0
  for (const r of rows) {
    if (!r.searchImpressionShare || r.searchImpressionShare <= 0 || !r.impressions) continue
    const e = r.impressions / r.searchImpressionShare
    eligible += e
    budget += e * (r.lostToBudget ?? 0)
    rank += e * (r.lostToRank ?? 0)
  }
  return {
    cost,
    clicks,
    impressions,
    cpc: clicks ? round2(cost / clicks) : null,
    conversions,
    costPerConversion: conversions > 0 ? round2(cost / conversions) : null,
    searchImpressionShare: eligible ? round3(impressions / eligible) : null,
    lostToBudget: eligible ? round3(budget / eligible) : null,
    lostToRank: eligible ? round3(rank / eligible) : null,
  }
}

// ── The run's closing JSON ──────────────────────────────────────────────────

export type ReviewProposal = {
  title: string
  account: string
  campaignId: string
  action: string
  args: Record<string, unknown>
  monthlyCostChange: number
  why: string
  expected: string
  hold?: string
}

export type ReviewReport = {
  trackingState: string
  changes: { tool: string; campaignId: string; change: string }[]
  proposals: ReviewProposal[]
  flags: string[]
  nextCheck: string
  summary: string
}

/** The last ```json fence (or the last object holding "trackingState") in the run's final text. */
export function parseReviewReport(text: string, clean: (s: string) => string = (s) => s): { report: ReviewReport | null; error: string | null } {
  const fences = Array.from(text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g), (m) => m[1].trim())
  let raw = fences.reverse().find((f) => f.startsWith('{')) ?? null
  if (!raw) {
    const at = text.lastIndexOf('{"metrics7d"')
    const alt = at === -1 ? text.lastIndexOf('{"trackingState"') : at
    if (alt !== -1) raw = text.slice(alt, text.lastIndexOf('}') + 1)
  }
  if (!raw) return { report: null, error: 'no JSON block in the output' }
  let j: Record<string, unknown>
  try {
    j = JSON.parse(raw)
  } catch (err) {
    return { report: null, error: `JSON did not parse: ${err instanceof Error ? err.message : String(err)}` }
  }
  const s = (v: unknown) => (typeof v === 'string' ? clean(v.trim()) : v == null ? '' : clean(String(v)))
  const arr = (v: unknown) => (Array.isArray(v) ? v : [])
  return {
    error: null,
    report: {
      trackingState: s(j.trackingState),
      changes: arr(j.changes)
        .map((c: Record<string, unknown>) => ({ tool: s(c?.tool), campaignId: s(c?.campaignId), change: s(c?.change ?? c?.result) }))
        .filter((c) => c.tool || c.change),
      proposals: arr(j.proposals)
        .map((p: Record<string, unknown>) => ({
          title: s(p?.title),
          account: s(p?.account),
          campaignId: s(p?.campaignId),
          action: s(p?.action),
          args: p?.args && typeof p.args === 'object' && !Array.isArray(p.args) ? (p.args as Record<string, unknown>) : {},
          monthlyCostChange: Number(p?.monthlyCostChange) || 0,
          why: s(p?.why),
          expected: s(p?.expected),
          ...(s(p?.hold) ? { hold: s(p?.hold) } : {}),
        }))
        .filter((p) => p.title && p.action),
      flags: arr(j.flags).map(s).filter(Boolean),
      nextCheck: s(j.nextCheck),
      summary: s(j.summary),
    },
  }
}

// ── Summary and report lines ────────────────────────────────────────────────

export const SUMMARY_MIN_LINES = 5
export const SUMMARY_MAX_LINES = 12

const money = (n: number | null) => (n === null ? 'n/a' : `$${n.toFixed(2)}`)
const pct = (n: number | null) => (n === null ? 'n/a' : `${Math.round(n * 100)}%`)

export const TRACKING_LABEL: Record<TrackingState, string> = {
  unverified: 'tracking unverified',
  no_data: 'tracking verified, no conversions yet',
  recording: 'tracking recording',
}

/** The model's summary when it has 5 to 12 lines, else one written from the numbers. */
export function reviewSummary(model: string, f: { client: string; tracking: TrackingState; d7: ReviewMetrics; d30: ReviewMetrics; changes: number; proposals: number; flags: string[] }): string {
  const lines = model.split('\n').map((l) => l.trimEnd()).filter((l) => l.trim())
  if (lines.length >= SUMMARY_MIN_LINES && lines.length <= SUMMARY_MAX_LINES) return lines.join('\n')
  return [
    `- ${f.client}: ${TRACKING_LABEL[f.tracking]}`,
    `- Last 7 days: ${money(f.d7.cost)} spent, ${f.d7.clicks} clicks, ${money(f.d7.cpc)} CPC, ${f.d7.conversions} conversions, ${money(f.d7.costPerConversion)} per conversion`,
    `- Last 30 days: ${money(f.d30.cost)} spent, ${f.d30.clicks} clicks, ${f.d30.conversions} conversions, ${money(f.d30.costPerConversion)} per conversion`,
    `- Search impression share ${pct(f.d30.searchImpressionShare)}, lost to budget ${pct(f.d30.lostToBudget)}, lost to rank ${pct(f.d30.lostToRank)}`,
    `- ${f.changes} change${f.changes === 1 ? '' : 's'} made, ${f.proposals} proposal${f.proposals === 1 ? '' : 's'} for Push`,
    ...(f.flags.length ? [`- Flags: ${f.flags.join(', ')}`] : []),
  ].join('\n')
}

/** What one review run left behind, for the job report (run output.review). */
export type ReviewOutcome = {
  client: string
  engagementId: string | null
  failed?: string | null
  trackingState?: TrackingState
  d7?: ReviewMetrics
  d30?: ReviewMetrics
  changes?: number
  proposals?: number
  flags?: string[]
  reviewId?: string | null
}

/** 30-day spend with no conversion: the money a review is most worried about. */
const wasted = (o: ReviewOutcome) => (o.d30 && o.d30.conversions === 0 ? o.d30.cost : 0)
const TRACK_RANK: Record<string, number> = { unverified: 0, no_data: 1, recording: 2 }

/** Worst first: failed runs, then tracking problems, then wasted money, then the most proposals, then name. */
export function rankOutcomes(list: ReviewOutcome[]): ReviewOutcome[] {
  return [...list].sort(
    (a, b) =>
      Number(!a.failed) - Number(!b.failed) ||
      (TRACK_RANK[a.trackingState ?? 'recording'] ?? 2) - (TRACK_RANK[b.trackingState ?? 'recording'] ?? 2) ||
      wasted(b) - wasted(a) ||
      (b.proposals ?? 0) - (a.proposals ?? 0) ||
      a.client.localeCompare(b.client)
  )
}

export const FLAG_LABEL: Record<string, string> = {
  ads_tag_unverified: 'tag unverified',
  ads_no_conversions: 'no conversions',
  ads_budget_limited: 'budget limited',
  ads_disapproved: 'ad disapproved',
  ads_zero_spend: 'no spend in 7 days',
}

/** One line per client, every claim with its number. */
export function outcomeLine(o: ReviewOutcome): string {
  if (o.failed) return `- **${o.client}**: review failed: ${o.failed}`
  const d7 = o.d7
  const parts = [
    TRACKING_LABEL[o.trackingState ?? 'recording'],
    d7 ? `7d ${money(d7.cost)}, ${d7.clicks} clicks, ${d7.conversions > 0 ? `${d7.conversions} conv at ${money(d7.costPerConversion)}` : 'no conversions'}` : '',
    wasted(o) > 0 ? `${money(wasted(o))} in 30d with no conversion` : '',
    `${o.changes ?? 0} change${o.changes === 1 ? '' : 's'}, ${o.proposals ?? 0} proposal${o.proposals === 1 ? '' : 's'}`,
    o.flags?.length ? `flags: ${o.flags.map((f) => FLAG_LABEL[f] ?? f).join(', ')}` : '',
  ].filter(Boolean)
  return `- **${o.client}**: ${parts.join('; ')}`
}
