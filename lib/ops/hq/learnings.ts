// ===========================================
// Ops HQ: per-trade learnings, once a month
// ===========================================
// runAdsLearnings: for every trade with at least one bound ads account that is
// not never-touch, read each account's last 30 days (at most 5 GAQL calls per
// account: campaign totals, converting terms, wasted terms, campaign and ad
// group negatives), sum the trade with aggregateLearnings, have a sonnet call
// write a 10 to 20 line summary from the numbers (numbers only, no advice),
// and upsert one AdsTradeLearning row per trade on (tradeKey, periodStart).
//
// Read only on Google, through the Research desk's read helpers. Per-account
// try/catch: a dead account is listed in errors and the trade goes on without
// it. dryRun reads Google and returns the rows, writes nothing and skips the
// model call (the summary is the code one).
//
// Called by GET /api/cron/ads-learnings and POST /api/admin/ops/ads/learnings.

import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { aggregateLearnings, learningWindow, type LearningAccountInput } from '@/lib/ops/ads-research'
import { tradeLabel } from '@/lib/ops/trades'
import { AGENT_MODEL_DEFAULT, hqApiKey, streamMessage } from './anthropic'
import { adsClients } from './ads'
import { isNeverTouch, missingAdsEnv, researchSearch, type AdsToolContext } from './ads-tools'
import { noEmDash } from './events'
import { engagementTradeKey } from './research-tools'

/** GAQL calls one account may use in a learnings run. */
export const LEARNING_CALLS_PER_ACCOUNT = 5

const usd = (micros: unknown) => Math.round(Number(micros ?? 0) / 10_000) / 100

type Aggregate = ReturnType<typeof aggregateLearnings>

/** The summary when no model call is made (dry run, or the model failed). */
export function codeSummary(tradeKey: string, window: { startDay: string; endDay: string }, agg: Aggregate): string {
  const t = agg.totals
  const lines = [
    `**${tradeLabel(tradeKey)}**, ${window.startDay} to ${window.endDay}, ${agg.accounts.length} account${agg.accounts.length === 1 ? '' : 's'}.`,
    `- Spend $${t.cost}, ${t.clicks} clicks, ${t.conversions} conversions${t.costPerConv !== null ? `, $${t.costPerConv} per conversion` : ''}${t.cpc !== null ? `, $${t.cpc} average CPC` : ''}.`,
    ...agg.accounts.map((a) => `- ${a.name}: $${a.cost}, ${a.conversions} conversions${a.costPerConv !== null ? `, $${a.costPerConv} each` : ''}${a.cpc !== null ? `, CPC $${a.cpc}` : ''}.`),
    `- Top converting terms: ${agg.convertingTerms.slice(0, 5).map((x) => `"${x.term}" (${x.conversions}, $${x.cost})`).join(', ') || 'none'}.`,
    `- Top wasted terms: ${agg.wastedTerms.slice(0, 5).map((x) => `"${x.term}" ($${x.cost})`).join(', ') || 'none'}.`,
    `- Negatives in use: ${agg.negativesInUse.length}, most shared: ${agg.negativesInUse.slice(0, 5).map((n) => `"${n.term}" (${n.accounts})`).join(', ') || 'none'}.`,
  ]
  return lines.join('\n')
}

async function modelSummary(tradeKey: string, window: { startDay: string; endDay: string }, agg: Aggregate): Promise<string> {
  const res = await streamMessage(
    {
      model: process.env.OPS_RESEARCH_MODEL?.trim() || AGENT_MODEL_DEFAULT,
      system: 'You summarise Google Ads numbers for a local service trade. Write 10 to 20 lines of markdown: a one-line header, then bullet lines. Numbers only: every line states figures from the data given, with dollars and counts. No advice, no recommendations, no adjectives without a number, no em dashes.',
      messages: [{ role: 'user', content: `Trade: ${tradeLabel(tradeKey)} (${tradeKey}). Period ${window.startDay} to ${window.endDay}.\n\n${JSON.stringify({ totals: agg.totals, accounts: agg.accounts, convertingTerms: agg.convertingTerms.slice(0, 25), wastedTerms: agg.wastedTerms.slice(0, 25), negativesInUse: agg.negativesInUse.slice(0, 30) })}` }],
      effort: 'medium',
      maxTokens: 4000,
    },
    () => undefined
  )
  const text = noEmDash(res.content.filter((b) => b.type === 'text').map((b) => String(b.text ?? '')).join('\n').trim())
  if (!text) throw new Error('the model wrote no summary')
  return text.split('\n').slice(0, 20).join('\n')
}

export type LearningsResult = {
  dryRun: boolean
  period: { start: string; end: string }
  trades: { tradeKey: string; accounts: number; cost: number; conversions: number; summaryBy: 'model' | 'code' }[]
  accountsRead: number
  googleCalls: number
  skipped: string[]
  errors: string[]
}

export async function runAdsLearnings(opts: { dryRun?: boolean; now?: Date } = {}): Promise<LearningsResult & { rows?: unknown[] }> {
  const dryRun = Boolean(opts.dryRun)
  const w = learningWindow(opts.now ?? new Date())
  const out: LearningsResult & { rows: unknown[] } = { dryRun, period: { start: w.startDay, end: w.endDay }, trades: [], accountsRead: 0, googleCalls: 0, skipped: [], errors: [], rows: [] }
  const missing = missingAdsEnv()
  if (missing.length) {
    out.errors.push(`offline: Google Ads credentials not set (${missing.join(', ')})`)
    return out
  }

  // Bound ads accounts grouped by trade.
  const byTrade = new Map<string, { id: string; name: string; customerId: string }[]>()
  for (const c of await adsClients()) {
    if (isNeverTouch(c.name)) {
      out.skipped.push(`${c.name}: never-touch`)
      continue
    }
    const { key } = await engagementTradeKey(c.id)
    if (!key) {
      out.skipped.push(`${c.name}: no trade on the board`)
      continue
    }
    byTrade.set(key, [...(byTrade.get(key) ?? []), c])
  }

  const range = `segments.date BETWEEN '${w.startDay}' AND '${w.endDay}'`
  for (const [tradeKey, clients] of Array.from(byTrade)) {
    const inputs: LearningAccountInput[] = []
    for (const c of clients) {
      // A fresh cap per account: LEARNING_CALLS_PER_ACCOUNT GAQL calls at most.
      const ctx: AdsToolContext = { runId: '', customerId: c.customerId, client: c.name, engagementId: c.id, mode: 'work', dry: true, calls: 0, writes: [], maxCalls: LEARNING_CALLS_PER_ACCOUNT }
      const q = (gaql: string) => researchSearch(ctx, c.customerId, c.name, gaql)
      try {
        const campaigns = await q(`SELECT campaign.id, metrics.cost_micros, metrics.conversions, metrics.clicks FROM campaign WHERE ${range} AND campaign.status != 'REMOVED'`)
        const terms = [
          ...(await q(`SELECT search_term_view.search_term, metrics.cost_micros, metrics.conversions, metrics.clicks FROM search_term_view WHERE ${range} AND metrics.conversions >= 1 ORDER BY metrics.conversions DESC LIMIT 200`)),
          ...(await q(`SELECT search_term_view.search_term, metrics.cost_micros, metrics.conversions, metrics.clicks FROM search_term_view WHERE ${range} AND metrics.conversions = 0 AND metrics.cost_micros >= 5000000 ORDER BY metrics.cost_micros DESC LIMIT 200`)),
        ]
        const negatives = [
          ...(await q(`SELECT campaign_criterion.keyword.text FROM campaign_criterion WHERE campaign_criterion.negative = TRUE AND campaign_criterion.type = 'KEYWORD' AND campaign.status != 'REMOVED' LIMIT 1000`)).map((x) => String(x.campaign_criterion.keyword?.text ?? '')),
          ...(await q(`SELECT ad_group_criterion.keyword.text FROM ad_group_criterion WHERE ad_group_criterion.negative = TRUE AND ad_group_criterion.type = 'KEYWORD' AND ad_group_criterion.status != 'REMOVED' LIMIT 1000`)).map((x) => String(x.ad_group_criterion.keyword?.text ?? '')),
        ]
        inputs.push({
          customerId: c.customerId,
          name: c.name,
          campaigns: campaigns.map((x) => ({ cost: usd(x.metrics.cost_micros), conversions: Number(x.metrics.conversions ?? 0), clicks: Number(x.metrics.clicks ?? 0) })),
          terms: terms.map((x) => ({ term: String(x.search_term_view.search_term ?? ''), cost: usd(x.metrics.cost_micros), conversions: Number(x.metrics.conversions ?? 0), clicks: Number(x.metrics.clicks ?? 0) })),
          negatives,
        })
        out.accountsRead++
      } catch (err) {
        out.errors.push(`${c.name} (${c.customerId}): ${err instanceof Error ? err.message : String(err)}`)
      } finally {
        out.googleCalls += ctx.calls
      }
    }
    if (!inputs.length) continue

    const agg = aggregateLearnings(inputs)
    let summary = codeSummary(tradeKey, w, agg)
    let summaryBy: 'model' | 'code' = 'code'
    if (!dryRun && hqApiKey()) {
      try {
        summary = await modelSummary(tradeKey, w, agg)
        summaryBy = 'model'
      } catch (err) {
        out.errors.push(`${tradeKey} summary: ${err instanceof Error ? err.message : String(err)}; the code summary was used`)
      }
    }
    const row = {
      tradeKey,
      periodStart: w.start,
      periodEnd: w.end,
      accounts: agg.accounts as unknown as Prisma.InputJsonArray,
      convertingTerms: agg.convertingTerms as unknown as Prisma.InputJsonArray,
      wastedTerms: agg.wastedTerms as unknown as Prisma.InputJsonArray,
      negativesInUse: agg.negativesInUse as unknown as Prisma.InputJsonArray,
      summary,
    }
    if (!dryRun) {
      const { tradeKey: _k, periodStart: _p, ...update } = row
      await db.adsTradeLearning.upsert({ where: { tradeKey_periodStart: { tradeKey, periodStart: w.start } }, create: row, update })
    }
    out.rows.push(dryRun ? row : { tradeKey, periodStart: w.startDay })
    out.trades.push({ tradeKey, accounts: inputs.length, cost: agg.totals.cost, conversions: agg.totals.conversions, summaryBy })
  }

  console.log(
    `[ads-learnings] ${dryRun ? 'dry run, ' : ''}${out.trades.length} trade${out.trades.length === 1 ? '' : 's'}, ${out.accountsRead} account${out.accountsRead === 1 ? '' : 's'} read, ${out.googleCalls} Google calls, ${out.skipped.length} skipped, ${out.errors.length} error${out.errors.length === 1 ? '' : 's'}`
  )
  return out
}
