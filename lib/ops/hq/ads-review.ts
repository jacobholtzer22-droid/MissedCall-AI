// ===========================================
// Ops HQ: the weekly ads review
// ===========================================
// runAdsReview() opens one OpsJob ("Weekly ads review <date>") and, for every
// client with 'ads' in services, a Google Ads customer id, the ads step at
// running and not on the never-touch list, one ads specialist run (agent ads,
// kind ads_review, mode work) created queued. Workers claim the queued runs
// three at a time: on Vercel each run gets its own function invocation (a
// worker request to /api/cron/ads-review?worker=<jobId> that runs one account
// under waitUntil, then asks for the next), so a long fleet never hits one
// function's 800 s; locally the same pool runs in process.
//
// One run (runAdsReviewTask):
//   1. The code reads the account (about 8 Google calls): campaigns with age and
//      bidding status, 7d and 30d metrics, conversion actions and 90 days of
//      their conversions, disapproved ads, daily clicks, and change_event when
//      the platform's own ledger has no change for a campaign.
//   2. From those: trackingState, the structural gate per campaign, and the
//      alert flags (lib/ops/alerts.ts adsReviewAlerts). The model gets them as
//      facts; it does not compute them.
//   3. The ads specialist loop with the reads, read_learnings and only the three
//      review changes (negatives, a qualifying CPC cut, a disapproved RSA), each
//      re-checked in ads-tools.ts reviewGuard before it reaches Google.
//   4. Proposals are filtered in code (ads-gates.ts filterReviewProposals), held
//      when a recorded decision caps them (capHold), and become OpsApprovals
//      (detail.review). One AdsReview row is written. A dry run sends every write
//      validate_only and writes no AdsReview and no approval.
//
// When the last run ends, reportReviewJob posts one chat message, one line per
// client, worst first; the chat shows the approvals as compact cards under it.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Prisma } from '@prisma/client'
import { waitUntil } from '@vercel/functions'
import { db } from '@/lib/db'
import { median } from '@/lib/ops/ads-research'
import { adsReviewAlerts } from '@/lib/ops/alerts'
import { loadGateClient } from '@/lib/ops/gate-data'
import { trackingOk } from '@/lib/ops/launch-gate'
import { AGENT_MODEL_DEFAULT, type ApiMessage } from './anthropic'
import { ADS_OFFLINE, AdsOffline, startAdsRun, type AdsInput } from './ads'
import { capHold, daysBetween, decisionCaps, filterReviewProposals, isVerifiedAction, lastChangeAt, trackingState, type LedgerEntry, type StructuralFacts, type TrackingState } from './ads-gates'
import { REVIEW_JOB_PREFIX, campaignRowsFrom, parseReviewReport, outcomeLine, rankOutcomes, reviewSummary, sumMetrics, type ReviewOutcome, type ReviewProposal } from './ads-review-report'
import { adsTools, checkProposal, enumName, isNeverTouch, missingAdsEnv, researchSearch, type AdsToolContext } from './ads-tools'
import { DECISION_PREFIX } from './decisions'
import { emit, noEmDash, oneLine } from './events'
import { onSpecialistRunEnded } from './jobs'
import { runAgentLoop } from './loop'
import { engagementTradeKey } from './research-tools'
import { failRun, finishRun, stampCost } from './runs'
import { enums } from 'google-ads-api'

export { REVIEW_JOB_PREFIX }

const PLAYBOOK = path.join(process.cwd(), 'lib/ops/hq/prompts/ads.md')
export const REVIEW_CONCURRENCY = 3

const agentModel = () => process.env.OPS_AGENT_MODEL?.trim() || AGENT_MODEL_DEFAULT
const dayStr = (d: Date) => d.toISOString().slice(0, 10)
const detroitDay = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Detroit' })

// ── Who gets reviewed ───────────────────────────────────────────────────────

export type ReviewCandidate = { engagementId: string; name: string; customerId: string }

/** Clients with ads bought, a bound account, the ads step at running, not never-touch. */
export async function reviewCandidates(engagementId?: string): Promise<{ run: ReviewCandidate[]; skipped: { name: string; reason: string }[] }> {
  const rows = await db.engagement.findMany({
    where: { stage: { notIn: ['ignored', 'churned'] }, ...(engagementId ? { id: engagementId } : {}) },
    select: { id: true, displayName: true, services: true, business: { select: { googleAdsCustomerId: true } }, deliverables: { where: { type: 'ads' }, select: { step: true, evidence: true } } },
    orderBy: { displayName: 'asc' },
  })
  const run: ReviewCandidate[] = []
  const skipped: { name: string; reason: string }[] = []
  for (const r of rows) {
    const name = r.displayName.trim()
    const services = Array.isArray(r.services) ? (r.services as string[]) : []
    if (!services.includes('ads')) {
      if (engagementId) skipped.push({ name, reason: 'ads is not in its services' })
      continue
    }
    const ads = r.deliverables[0]
    const ev = (ads?.evidence ?? {}) as Record<string, unknown>
    const customerId = (r.business?.googleAdsCustomerId || (typeof ev.adsCustomerId === 'string' ? ev.adsCustomerId : '') || '').replace(/-/g, '')
    if (isNeverTouch(name)) skipped.push({ name, reason: 'never-touch list' })
    else if (!customerId) skipped.push({ name, reason: 'no Google Ads customer id' })
    else if (ads?.step !== 'running') skipped.push({ name, reason: `ads step is ${ads?.step ?? 'not set'}, not running` })
    else run.push({ engagementId: r.id, name, customerId })
  }
  return { run, skipped }
}

const REVIEW_INSTRUCTIONS = 'Weekly ads review. Follow the "Weekly review" section of the playbook, in its order, on the facts below.'

/** Open the job and queue one run per client, then start the workers. Throws AdsOffline when the credentials are missing. */
export async function runAdsReview(opts: { dryRun?: boolean; engagementId?: string; now?: Date } = {}) {
  const missing = missingAdsEnv()
  if (missing.length) throw new AdsOffline(`Weekly ads review ${ADS_OFFLINE} (${missing.join(', ')})`)
  const now = opts.now ?? new Date()
  const { run: candidates, skipped } = await reviewCandidates(opts.engagementId)
  if (!candidates.length) return { jobId: null as string | null, dryRun: Boolean(opts.dryRun), runs: [] as { client: string; runId: string }[], skipped, failed: [] as { client: string; error: string }[] }
  const title = `${REVIEW_JOB_PREFIX} ${detroitDay(now)}${opts.engagementId ? `: ${candidates[0].name}` : ''}${opts.dryRun ? ' (dry run)' : ''}`
  const job = await db.opsJob.create({ data: { prompt: title, status: 'running', engagementIds: candidates.map((c) => c.engagementId) } })
  const runs: { client: string; runId: string }[] = []
  const failed: { client: string; error: string }[] = []
  for (const c of candidates) {
    try {
      const run = await startAdsRun({ engagementId: c.engagementId, jobId: job.id, instructions: REVIEW_INSTRUCTIONS, review: true, dry: opts.dryRun })
      runs.push({ client: c.name, runId: run.id })
    } catch (err) {
      failed.push({ client: c.name, error: err instanceof Error ? err.message : String(err) })
    }
  }
  if (!runs.length) {
    await db.opsJob.update({ where: { id: job.id }, data: { status: 'failed', summary: `no review run could start: ${failed.map((f) => `${f.client}: ${f.error}`).join('; ')}` } })
    return { jobId: job.id, dryRun: Boolean(opts.dryRun), runs, skipped, failed }
  }
  await kickWorkers(job.id, Math.min(REVIEW_CONCURRENCY, runs.length))
  return { jobId: job.id, dryRun: Boolean(opts.dryRun), runs, skipped, failed }
}

// ── Workers ─────────────────────────────────────────────────────────────────

/** Claim the job's next queued review run, or null when none is left. */
async function claimNext(jobId: string): Promise<string | null> {
  for (let tries = 0; tries < 5; tries++) {
    const next = await db.agentRun.findFirst({ where: { jobId, kind: 'ads_review', status: 'queued' }, orderBy: { createdAt: 'asc' }, select: { id: true } })
    if (!next) return null
    const claimed = await db.agentRun.updateMany({ where: { id: next.id, status: 'queued' }, data: { status: 'running', startedAt: new Date() } })
    if (claimed.count) return next.id
  }
  return null
}

/** Run one queued account. Returns whether one ran (so the caller asks for the next). */
export async function runReviewWorker(jobId: string): Promise<boolean> {
  const runId = await claimNext(jobId)
  if (!runId) return false
  await emit(runId, 'status', 'Started')
  await runAdsReviewTask(runId)
  return true
}

/**
 * Start n workers. On Vercel each is its own request to the cron route
 * (CRON_SECRET bearer), so each account gets a full function lifetime; the
 * worker answers at once and runs under waitUntil. Elsewhere (local dev, or no
 * CRON_SECRET) the workers run in this process.
 */
export async function kickWorkers(jobId: string, n: number) {
  const secret = process.env.CRON_SECRET?.trim()
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, '')
  if (process.env.VERCEL === '1' && secret && base) {
    const url = `${base}/api/cron/ads-review?worker=${encodeURIComponent(jobId)}`
    const sent = await Promise.allSettled(Array.from({ length: n }, () => fetch(url, { headers: { authorization: `Bearer ${secret}` } })))
    const ok = sent.filter((s) => s.status === 'fulfilled' && s.value.ok).length
    if (ok === n) return
    console.error(`[ads-review] ${n - ok} of ${n} workers did not start over HTTP; running them here`)
    for (let i = ok; i < n; i++) waitUntil(drainHere(jobId))
    return
  }
  for (let i = 0; i < n; i++) waitUntil(drainHere(jobId))
}

/** In-process worker: run queued accounts one after another until none is left. */
async function drainHere(jobId: string) {
  try {
    while (await runReviewWorker(jobId)) {
      // next
    }
  } catch (err) {
    console.error('[ads-review] worker failed:', err instanceof Error ? err.message : err)
  }
}

// ── Reading the account ─────────────────────────────────────────────────────

type AccountFacts = {
  campaigns: { id: string; name: string; status: string | null; startDate: string | null; biddingStatus: string | null; bidding: string | null; dailyBudget: number | null }[]
  d7: ReturnType<typeof sumMetrics>
  d30: ReturnType<typeof sumMetrics>
  campaigns30d: ReturnType<typeof campaignRowsFrom>
  conversionActions: { name: string; type: string | null; status: string | null; primary: boolean; allConversions90d: number; verified: boolean }[]
  disapproved: { adGroupId: string; adId: string; campaignId: string }[]
  gates: Record<string, StructuralFacts & { lastChange: string | null; lastChangeFrom: 'platform' | 'change_event' | null }>
  tracking: TrackingState
}

function window(days: number, now: Date) {
  const end = new Date(now)
  end.setUTCDate(end.getUTCDate() - 1)
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - (days - 1))
  return { start: dayStr(start), end: dayStr(end) }
}

/** The platform's own record of changes on this client's account: review changes, then every ads run's writes (apply runs included). */
async function platformLedger(engagementId: string, since: Date): Promise<LedgerEntry[]> {
  const [reviews, runs] = await Promise.all([
    // Caught: a database without the AdsReview table yet reads an empty ledger.
    db.adsReview.findMany({ where: { engagementId, createdAt: { gte: since } }, select: { changes: true, createdAt: true } }).catch(() => []),
    db.agentRun.findMany({ where: { engagementId, agent: 'ads', kind: { not: 'ads_review' }, finishedAt: { gte: since } }, select: { output: true, finishedAt: true } }),
  ])
  const out: LedgerEntry[] = []
  const push = (w: Record<string, unknown>, fallback: Date) => {
    if (w.changed !== true) return
    const args = (w.args ?? {}) as Record<string, unknown>
    const at = typeof w.at === 'string' ? new Date(w.at) : fallback
    out.push({ at, tool: String(w.tool ?? ''), campaignId: args.campaignId ? String(args.campaignId).replace(/-/g, '') : null })
  }
  for (const r of reviews) for (const w of Array.isArray(r.changes) ? (r.changes as Record<string, unknown>[]) : []) push(w, r.createdAt)
  for (const r of runs) {
    const writes = ((r.output ?? {}) as { writes?: unknown }).writes
    if (Array.isArray(writes)) for (const w of writes as Record<string, unknown>[]) push(w, r.finishedAt ?? since)
  }
  return out
}

/** Exported for scripts that check the reads on one account (read only). */
export async function readAccount(ctx: AdsToolContext, engagementId: string, tagLive: boolean | null, now: Date): Promise<AccountFacts> {
  const q = (gaql: string) => researchSearch(ctx, ctx.customerId, ctx.client, gaql)
  const w7 = window(7, now)
  const w30 = window(30, now)
  const w90 = window(90, now)
  const w365 = window(365, now)
  const perf = (w: { start: string; end: string }) =>
    q(`SELECT campaign.id, campaign.name, campaign.status, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions,
              metrics.search_impression_share, metrics.search_budget_lost_impression_share, metrics.search_rank_lost_impression_share
       FROM campaign WHERE segments.date BETWEEN '${w.start}' AND '${w.end}' AND campaign.status != 'REMOVED'`)

  const [campRows, p7, p30, actions, actionCounts, disapproved, daily] = await Promise.all([
    q(`SELECT campaign.id, campaign.name, campaign.status, campaign.start_date_time, campaign.bidding_strategy_system_status, campaign.bidding_strategy_type, campaign_budget.amount_micros
       FROM campaign WHERE campaign.status != 'REMOVED'`),
    perf(w7),
    perf(w30),
    q(`SELECT conversion_action.id, conversion_action.name, conversion_action.type, conversion_action.status, conversion_action.primary_for_goal, conversion_action.include_in_conversions_metric
       FROM conversion_action WHERE conversion_action.status != 'REMOVED'`),
    q(`SELECT segments.conversion_action, metrics.all_conversions FROM customer WHERE segments.date BETWEEN '${w90.start}' AND '${w90.end}'`),
    q(`SELECT campaign.id, ad_group.id, ad_group_ad.ad.id FROM ad_group_ad
       WHERE ad_group_ad.status = 'ENABLED' AND ad_group_ad.policy_summary.approval_status = 'DISAPPROVED' AND campaign.status = 'ENABLED'`),
    q(`SELECT campaign.id, segments.date, metrics.clicks FROM campaign WHERE segments.date BETWEEN '${w365.start}' AND '${w365.end}' AND campaign.status = 'ENABLED' AND metrics.clicks > 0`),
  ])

  const campaigns = campRows.map((r) => ({
    id: String(r.campaign.id),
    name: String(r.campaign.name ?? ''),
    status: enumName(enums.CampaignStatus, r.campaign.status),
    startDate: r.campaign.start_date_time ? String(r.campaign.start_date_time).slice(0, 10) : null,
    biddingStatus: enumName(enums.BiddingStrategySystemStatus, r.campaign.bidding_strategy_system_status),
    bidding: enumName(enums.BiddingStrategyType, r.campaign.bidding_strategy_type),
    dailyBudget: r.campaign_budget?.amount_micros ? Math.round(Number(r.campaign_budget.amount_micros) / 10_000) / 100 : null,
  }))
  const rows7 = campaignRowsFrom(p7)
  const rows30 = campaignRowsFrom(p30)

  const counts = new Map<string, number>()
  for (const x of actionCounts) {
    const id = String(x.segments?.conversion_action ?? '').split('/').pop() ?? ''
    counts.set(id, (counts.get(id) ?? 0) + Number(x.metrics?.all_conversions ?? 0))
  }
  const conversionActions = actions.map((x) => {
    const a = {
      name: String(x.conversion_action.name ?? ''),
      type: enumName(enums.ConversionActionType, x.conversion_action.type),
      status: enumName(enums.ConversionActionStatus, x.conversion_action.status),
      primary: Boolean(x.conversion_action.include_in_conversions_metric || x.conversion_action.primary_for_goal),
      allConversions90d: Math.round((counts.get(String(x.conversion_action.id)) ?? 0) * 100) / 100,
      tagLive,
    }
    return { ...a, verified: isVerifiedAction(a) }
  })
  const d30 = sumMetrics(rows30)
  const tracking = trackingState({ conversionActions, conversions30d: d30.conversions, clicks30d: d30.clicks })

  // The structural gate per enabled campaign. Last change: the platform's ledger, else change_event (30 days).
  const enabled = campaigns.filter((c) => c.status === 'ENABLED')
  const ledger = await platformLedger(engagementId, new Date(now.getTime() - 60 * 86_400_000))
  const fromLedger = new Map(enabled.map((c) => [c.id, lastChangeAt(ledger, c.id)]))
  const fromGoogle = new Map<string, Date>()
  if (enabled.some((c) => !fromLedger.get(c.id))) {
    const start = dayStr(new Date(now.getTime() - 29 * 86_400_000))
    const end = dayStr(new Date(now.getTime() + 86_400_000))
    const events = await q(`SELECT change_event.change_date_time, change_event.change_resource_type, change_event.campaign FROM change_event
       WHERE change_event.change_date_time >= '${start}' AND change_event.change_date_time <= '${end}'
         AND change_event.change_resource_type IN ('CAMPAIGN', 'CAMPAIGN_BUDGET', 'AD_GROUP', 'AD_GROUP_CRITERION', 'AD_GROUP_BID_MODIFIER')
       ORDER BY change_event.change_date_time DESC LIMIT 1000`).catch(() => [])
    for (const ev of events) {
      const id = String(ev.change_event?.campaign ?? '').split('/').pop() ?? ''
      const at = new Date(String(ev.change_event?.change_date_time ?? '').replace(' ', 'T'))
      if (id && !Number.isNaN(at.getTime()) && (!fromGoogle.get(id) || at > fromGoogle.get(id)!)) fromGoogle.set(id, at)
    }
  }
  const gates: AccountFacts['gates'] = {}
  for (const c of enabled) {
    const age = c.startDate ? daysBetween(new Date(`${c.startDate}T00:00:00Z`), now) : null
    const last = fromLedger.get(c.id) ?? fromGoogle.get(c.id) ?? null
    const after = last ? dayStr(last) : c.startDate ?? w365.start
    const clicks = daily.filter((d) => String(d.campaign.id) === c.id && String(d.segments.date) > after).reduce((n, d) => n + Number(d.metrics.clicks ?? 0), 0)
    gates[c.id] = {
      campaignAgeDays: age,
      clicksSinceLastChange: clicks,
      daysSinceLastChange: last ? daysBetween(last, now) : age,
      biddingStatus: c.biddingStatus,
      lastChange: last ? last.toISOString() : null,
      lastChangeFrom: fromLedger.get(c.id) ? 'platform' : fromGoogle.get(c.id) ? 'change_event' : null,
    }
  }
  return {
    campaigns,
    d7: sumMetrics(rows7),
    d30,
    campaigns30d: rows30,
    conversionActions,
    disapproved: disapproved.map((x) => ({ campaignId: String(x.campaign.id), adGroupId: String(x.ad_group.id), adId: String(x.ad_group_ad?.ad?.id ?? '') })),
    gates,
    tracking,
  }
}

// ── One run ─────────────────────────────────────────────────────────────────

function taskMessage(input: AdsInput, f: AccountFacts, extra: { decisions: string[]; tradeKey: string | null; tradeMedianCpc: number | null; flags: string[] }): string {
  const facts = {
    trackingState: f.tracking,
    conversionActions: f.conversionActions,
    metrics7d: f.d7,
    metrics30d: f.d30,
    campaigns: f.campaigns.map((c) => ({ ...c, last30d: f.campaigns30d.find((r) => r.id === c.id) ?? null, structuralGate: f.gates[c.id] ?? null })),
    disapprovedAds: f.disapproved,
    flags: extra.flags,
    tradeKey: extra.tradeKey,
    tradeMedianCpc: extra.tradeMedianCpc,
  }
  return [
    `Account: ${input.client}, Google Ads customer ${input.customerId}. Pass customerId ${input.customerId} on every tool call.`,
    `Standing decisions for this client (recorded decisions win; a proposal above a recorded cap gets "hold" with the decision text):\n${extra.decisions.length ? extra.decisions.map((d) => `- ${DECISION_PREFIX} ${d}`).join('\n') : '- none'}`,
    `Facts the platform read for this review (use these numbers; read more only where the playbook says):\n${JSON.stringify(facts, null, 1)}`,
    input.instructions,
    f.tracking === 'unverified'
      ? 'Tracking is UNVERIFIED: make no bid or budget change and propose none. Lead the summary with the tracking fix.'
      : '',
    input.dry ? 'DRY RUN: every write is sent validate_only, so Google checks it and nothing changes. List each change in "changes" starting "Would: ".' : '',
    'Work only on this account. End with exactly one JSON block in the "Weekly review" format.',
  ]
    .filter(Boolean)
    .join('\n\n')
}

export async function runAdsReviewTask(runId: string) {
  let engagementId: string | null = null
  let client = ''
  try {
    const missing = missingAdsEnv()
    if (missing.length) throw new AdsOffline(`${ADS_OFFLINE} (${missing.join(', ')})`)
    const run = await db.agentRun.findUniqueOrThrow({ where: { id: runId }, select: { input: true, jobId: true, engagementId: true } })
    const input = run.input as unknown as AdsInput
    engagementId = run.engagementId
    client = input.client
    if (!engagementId) throw new Error('a review run needs a client')
    const now = new Date()
    const decisions = (
      await db.opsActivity.findMany({ where: { engagementId, body: { startsWith: DECISION_PREFIX } }, orderBy: { createdAt: 'asc' }, select: { body: true } })
    ).map((d) => d.body.slice(DECISION_PREFIX.length).trim())
    const gate = await loadGateClient(engagementId).catch(() => null)
    const trade = await engagementTradeKey(engagementId)
    const learning = trade.key ? await db.adsTradeLearning.findFirst({ where: { tradeKey: trade.key }, orderBy: { periodStart: 'desc' }, select: { accounts: true } }) : null
    const cpcs = (Array.isArray(learning?.accounts) ? (learning!.accounts as { cpc?: number | null; cost?: number }[]) : []).filter((a) => typeof a.cpc === 'number' && (a.cost ?? 0) > 0).map((a) => a.cpc as number)
    const tradeMedianCpc = median(cpcs)

    const ctx: AdsToolContext = { runId, customerId: input.customerId, client: input.client, engagementId, mode: 'work', dry: input.dry, calls: 0, writes: [] }
    await emit(runId, 'status', `Reading ${input.client}`)
    const facts = await readAccount(ctx, engagementId, gate ? trackingOk(gate) : null, now)
    const enabled = facts.campaigns.filter((c) => c.status === 'ENABLED')
    const alertInput = { trackingState: facts.tracking, createdAt: now, metrics: { d7: facts.d7, d30: facts.d30, enabledCampaigns: enabled.length, disapprovedAds: facts.disapproved.length } }
    const flags = adsReviewAlerts(alertInput, now).map((a) => a.code)
    await emit(runId, 'status', `${input.client}: ${facts.tracking}, 7d $${facts.d7.cost} / ${facts.d7.clicks} clicks / ${facts.d7.conversions} conv, ${enabled.length} enabled campaign${enabled.length === 1 ? '' : 's'}`, { facts, flags })

    ctx.review = { tracking: facts.tracking, tradeKey: trade.key, tradeMedianCpc, disapprovedAdGroups: Array.from(new Set(facts.disapproved.map((d) => d.adGroupId))) }
    const loop = (messages: ApiMessage[]) =>
      runAgentLoop({ runId, model: agentModel(), system: readFileSync(PLAYBOOK, 'utf8'), messages, tools: adsTools(ctx), effort: 'high', describeCall: (name) => `Calling ${name} on ${input.client}` })

    let result = enabled.length
      ? await loop([{ role: 'user', content: taskMessage(input, facts, { decisions, tradeKey: trade.key, tradeMedianCpc, flags }) }])
      : null
    let { report, error } = result ? parseReviewReport(result.finalText, noEmDash) : { report: null, error: 'no enabled campaign: nothing to review' }
    const badProposals = (r: typeof report) => (r ? r.proposals.map((p, n) => [n, checkProposal(p.action, p.args, { review: true })] as const).filter(([, bad]) => bad) : [])
    if (result && !result.cancelled && (!report || badProposals(report).length)) {
      const problems = report ? badProposals(report).map(([n, bad]) => `proposal ${n + 1}: ${bad}`) : [`your report did not parse: ${error}`]
      await emit(runId, 'status', `Report needs a fix: ${problems.length} problem${problems.length === 1 ? '' : 's'}`, { problems })
      result = await loop([...result.messages, { role: 'user', content: `Fix your report and send the whole JSON block again. Make no further changes.\n${problems.map((p) => `- ${p}`).join('\n')}` }])
      ;({ report, error } = parseReviewReport(result.finalText, noEmDash))
    }
    if (error) await emit(runId, 'error', `Report: ${error}`)

    // Proposals: schema, then the gates, then recorded caps.
    const valid = (report?.proposals ?? []).filter((p) => !checkProposal(p.action, p.args, { review: true }))
    const { kept, dropped } = filterReviewProposals(valid, { tracking: facts.tracking, factsFor: (id) => facts.gates[id] ?? null })
    for (const d of dropped) await emit(runId, 'status', `Proposal not filed: ${d.title}: ${d.reason}`)
    const caps = decisionCaps(decisions)
    const currentDaily = enabled.reduce((n, c) => n + (c.dailyBudget ?? 0), 0)
    const filed: (ReviewProposal & { approvalId?: string; held?: boolean })[] = []
    for (const p of kept) {
      const capped = capHold(p, caps, currentDaily)
      const hold = capped ? `Recorded decision: ${capped}` : p.hold
      let approvalId: string | undefined
      if (!input.dry && run.jobId) {
        const a = await db.opsApproval.create({
          data: { jobId: run.jobId, runId, agent: 'ads', kind: 'ads_change', title: oneLine(p.title, 200), detail: { ...p, ...(hold ? { hold } : {}), customerId: ctx.customerId, review: true } as Prisma.InputJsonObject, expected: p.expected || null },
        })
        approvalId = a.id
      }
      filed.push({ ...p, ...(hold ? { hold } : {}), ...(approvalId ? { approvalId } : {}) })
    }

    const changes = ctx.writes.map((w) => ({ tool: w.tool, args: w.args, changed: w.changed, campaignId: w.args.campaignId ? String(w.args.campaignId) : null, at: w.at ?? now.toISOString(), result: w.result ?? null }))
    const made = changes.filter((c) => c.changed).length
    const summary = noEmDash(
      reviewSummary(report?.summary ?? '', { client: input.client, tracking: facts.tracking, d7: facts.d7, d30: facts.d30, changes: input.dry ? changes.length : made, proposals: filed.length, flags })
    )
    const w30 = window(30, now)
    let reviewId: string | null = null
    if (!input.dry) {
      const row = await db.adsReview.create({
        data: {
          engagementId,
          runId,
          customerId: ctx.customerId,
          periodStart: new Date(`${w30.start}T00:00:00Z`),
          periodEnd: new Date(`${w30.end}T00:00:00Z`),
          trackingState: facts.tracking,
          metrics: { d7: facts.d7, d30: facts.d30, enabledCampaigns: enabled.length, disapprovedAds: facts.disapproved.length, campaigns: facts.campaigns30d, gates: facts.gates } as unknown as Prisma.InputJsonObject,
          changes: changes as unknown as Prisma.InputJsonArray,
          proposals: filed as unknown as Prisma.InputJsonArray,
          flags: flags as Prisma.InputJsonArray,
          summary,
        },
      })
      reviewId = row.id
    }
    const outcome: ReviewOutcome = { client: input.client, engagementId, trackingState: facts.tracking, d7: facts.d7, d30: facts.d30, changes: input.dry ? changes.length : made, proposals: filed.length, flags, reviewId }
    await emit(runId, 'status', `Review: ${made} change${made === 1 ? '' : 's'}, ${filed.length} proposal${filed.length === 1 ? '' : 's'}${dropped.length ? `, ${dropped.length} not filed` : ''}`, { flags, nextCheck: report?.nextCheck ?? null })
    await finishRun(runId, {
      review: outcome,
      reviewId,
      dry: input.dry,
      googleAdsCalls: ctx.calls,
      writes: ctx.writes,
      proposals: filed,
      droppedProposals: dropped,
      nextCheck: report?.nextCheck ?? null,
      summary,
      reportError: error,
      finalText: result?.finalText.slice(0, 20000) ?? null,
      turns: result?.turns ?? 0,
      cancelled: result?.cancelled ?? false,
    })
  } catch (err) {
    const message = await failRun(runId, err)
    await db.agentRun.update({ where: { id: runId }, data: { output: { review: { client, engagementId, failed: message } } as Prisma.InputJsonObject } }).catch(() => {})
    await stampCost(runId)
  }
  const job = await db.agentRun.findUnique({ where: { id: runId }, select: { jobId: true } })
  if (job?.jobId) await onSpecialistRunEnded(job.jobId).catch((err) => console.error('[hq] job report failed:', err instanceof Error ? err.message : err))
}

// ── The job report ──────────────────────────────────────────────────────────

/** Is this job a weekly review (every specialist run is a review, or an apply run of one of its approvals)? */
export function isReviewJob(runs: { kind: string | null; mode: string | null }[]) {
  return runs.some((r) => r.kind === 'ads_review') && runs.every((r) => r.kind === 'ads_review' || r.mode === 'apply')
}

/** One chat message, one line per client, worst first; the job summary for the report card. Written in code: every number comes from the runs. */
export async function reportReviewJob(jobId: string) {
  const job = await db.opsJob.findUniqueOrThrow({ where: { id: jobId }, select: { prompt: true } })
  const runs = await db.agentRun.findMany({
    where: { jobId, kind: 'ads_review' },
    orderBy: { createdAt: 'asc' },
    select: { id: true, status: true, error: true, output: true, engagementId: true, engagement: { select: { displayName: true } } },
  })
  const outcomes: ReviewOutcome[] = runs.map((r) => {
    const o = ((r.output ?? {}) as { review?: ReviewOutcome }).review
    const client = r.engagement?.displayName.trim() ?? o?.client ?? 'Unknown client'
    if (r.status === 'failed') return { client, engagementId: r.engagementId, failed: r.error ?? o?.failed ?? 'failed' }
    if (r.status === 'cancelled') return { client, engagementId: r.engagementId, failed: 'cancelled' }
    return o ? { ...o, client } : { client, engagementId: r.engagementId, failed: 'no result recorded' }
  })
  const ranked = rankOutcomes(outcomes)
  const approvals = await db.opsApproval.findMany({ where: { jobId, runId: { in: runs.map((r) => r.id) } }, select: { runId: true, title: true, status: true } })
  const pending = approvals.filter((a) => a.status === 'pending')
  const tracking = outcomes.filter((o) => o.trackingState === 'unverified').length
  const failed = outcomes.filter((o) => o.failed).length
  const dry = job.prompt.includes('(dry run)')
  const head = `${job.prompt}: ${outcomes.length} account${outcomes.length === 1 ? '' : 's'}, ${tracking} with tracking unverified, ${pending.length} proposal${pending.length === 1 ? '' : 's'} waiting for Push${failed ? `, ${failed} failed` : ''}.${dry ? ' Dry run: nothing changed, no review saved, no approval filed.' : ''}`
  const body = noEmDash([head, '', ...ranked.map(outcomeLine)].join('\n'))
  const runOf = new Map(runs.map((r) => [r.engagementId, r.id]))
  const sections = ranked.map((o) => ({
    agent: 'ads',
    client: o.client,
    did: o.failed ? [`Review failed: ${o.failed}`] : [outcomeLine(o).replace(/^- \*\*[^*]+\*\*: /, '')],
    expect: o.failed ? 'Rerun the review for this client when the error is fixed.' : 'Next review next Monday.',
    links: [],
    waitingForPush: approvals.filter((a) => a.runId === runOf.get(o.engagementId) && a.status === 'pending').map((a) => a.title),
    questions: [],
  }))
  await db.opsJob.update({
    where: { id: jobId },
    data: { summary: JSON.stringify({ text: head, sections, pendingApprovals: pending.length }), status: pending.length ? 'awaiting_approval' : 'done' },
  })
  await db.opsMessage.create({ data: { role: 'chief', body, jobId } })
}

/** A run created for the chief's review_ads tool: the same job and workers as the cron. */
export async function reviewForChief(target: string) {
  const all = target === 'all'
  const r = await runAdsReview({ engagementId: all ? undefined : target })
  return { jobId: r.jobId, clients: r.runs.map((x) => x.client), skipped: r.skipped, failed: r.failed }
}
