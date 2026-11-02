// ===========================================
// Ops HQ: the Research desk
// ===========================================
// One AgentRun per client (agent research, kind ads_research, mode work) under
// the chief's job. A tool_use loop like the ads specialist's, over read-only
// Google Ads tools (research-tools.ts): the client, its trade siblings'
// accounts, Keyword Planner, the monthly learnings. It writes one campaign
// brief (AdsBrief) and one note on the client, and never builds anything.
//
// Shares the ads specialist's Google Ads client, credentials and never-touch
// list; capped at RESEARCH_MAX_CALLS (60) Google calls per run.
//
// System prompt: lib/ops/hq/prompts/research.md. Env, read by name only: the
// five GOOGLE_ADS_* credentials (any missing ⇒ offline), OPS_RESEARCH_MODEL
// (default claude-sonnet-5-5), ANTHROPIC_API_KEY_BUILDS.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { db } from '@/lib/db'
import { BRIEF_REUSE_DAYS, BUDGET_NORM, PLAYBOOK_NEGATIVES } from '@/lib/ops/ads-research'
import { tradeLabel } from '@/lib/ops/trades'
import { AGENT_MODEL_DEFAULT } from './anthropic'
import { ADS_OFFLINE, AdsOffline, adsClients } from './ads'
import { RESEARCH_MAX_CALLS, isNeverTouch, missingAdsEnv, type AdsToolContext } from './ads-tools'
import { DECISION_PREFIX } from './decisions'
import { emit } from './events'
import { onSpecialistRunEnded } from './jobs'
import { runAgentLoop } from './loop'
import { engagementTradeKey, researchTools, type ResearchContext } from './research-tools'
import { createRun, failRun, finishRun } from './runs'

const PROMPT = path.join(process.cwd(), 'lib/ops/hq/prompts/research.md')

const researchModel = () => process.env.OPS_RESEARCH_MODEL?.trim() || AGENT_MODEL_DEFAULT

type ResearchInput = { goal: string; client: string; customerId: string; tradeKey: string | null }

/** The client's latest brief, if it is younger than BRIEF_REUSE_DAYS. */
export async function recentBrief(engagementId: string) {
  const since = new Date(Date.now() - BRIEF_REUSE_DAYS * 86_400_000)
  return db.adsBrief.findFirst({ where: { engagementId, createdAt: { gte: since } }, orderBy: { createdAt: 'desc' }, select: { id: true, createdAt: true } })
}

/** Create the run for one client. Throws AdsOffline when the Google Ads credentials are missing, Error when the client is out of bounds. */
export async function startResearchRun(opts: { engagementId: string; jobId: string | null; goal: string }) {
  const missing = missingAdsEnv()
  if (missing.length) throw new AdsOffline(`Research desk ${ADS_OFFLINE} (${missing.join(', ')})`)
  const e = await db.engagement.findUnique({
    where: { id: opts.engagementId },
    select: { displayName: true, business: { select: { googleAdsCustomerId: true } }, deliverables: { where: { type: 'ads' }, select: { id: true, evidence: true } } },
  })
  if (!e) throw new Error(`no client with id ${opts.engagementId}`)
  const client = e.displayName.trim()
  if (isNeverTouch(client)) throw new Error(`${client} is on the never-touch list`)
  const ev = e.deliverables[0]?.evidence as Record<string, unknown> | null
  const customerId = (e.business?.googleAdsCustomerId ?? (typeof ev?.adsCustomerId === 'string' ? ev.adsCustomerId : '') ?? '').replace(/-/g, '')
  const trade = await engagementTradeKey(opts.engagementId)
  const input: ResearchInput = { goal: opts.goal, client, customerId, tradeKey: trade.key }
  return createRun({ agent: 'research', kind: 'ads_research', mode: 'work', engagementId: opts.engagementId, jobId: opts.jobId, deliverableId: e.deliverables[0]?.id ?? null, input })
}

function taskMessage(input: ResearchInput, engagementId: string, decisions: string[]): string {
  return [
    `Client: ${input.client} (client id ${engagementId}). ${input.customerId ? `Its Google Ads account: ${input.customerId}.` : 'It has no Google Ads account yet; keyword_ideas runs under the manager.'}`,
    `Trade: ${input.tradeKey ? `${tradeLabel(input.tradeKey)} (trade key ${input.tradeKey})` : 'not named on the board; say so under Risks and unknowns and research from the services alone'}.`,
    `Standing decisions for this client:\n${decisions.length ? decisions.map((d) => `- ${DECISION_PREFIX} ${d}`).join('\n') : '- none'}`,
    `Goal from Jacob's chief:\n${input.goal}`,
    `Playbook negatives (source "playbook"): ${PLAYBOOK_NEGATIVES.join(', ')}.`,
    `Jacob's budget norm: $${BUDGET_NORM.low} to $${BUDGET_NORM.high} a month. Monthly = daily x 30.4.`,
    `You have ${RESEARCH_MAX_CALLS} Google calls in this run. Read only; write the brief with save_brief.`,
  ].join('\n\n')
}

export async function runResearchTask(runId: string) {
  try {
    const missing = missingAdsEnv()
    if (missing.length) throw new AdsOffline(`${ADS_OFFLINE} (${missing.join(', ')})`)
    const run = await db.agentRun.findUniqueOrThrow({ where: { id: runId }, select: { input: true, engagementId: true } })
    if (!run.engagementId) throw new Error('a research run needs a client')
    const input = run.input as unknown as ResearchInput
    const decisions = (
      await db.opsActivity.findMany({ where: { engagementId: run.engagementId, body: { startsWith: DECISION_PREFIX } }, orderBy: { createdAt: 'asc' }, select: { body: true } })
    ).map((d) => d.body.slice(DECISION_PREFIX.length).trim())

    // The accounts it may read: every ads client bound on the board, never-touch ones left out.
    const accounts = new Map((await adsClients()).filter((c) => !isNeverTouch(c.name)).map((c) => [c.customerId, c.name]))
    if (input.customerId) accounts.set(input.customerId, input.client)
    const ads: AdsToolContext = { runId, customerId: input.customerId, client: input.client, engagementId: run.engagementId, mode: 'work', dry: true, calls: 0, writes: [], maxCalls: RESEARCH_MAX_CALLS }
    const ctx: ResearchContext = { runId, engagementId: run.engagementId, client: input.client, customerId: input.customerId, accounts, ads, briefId: null, saveFailures: 0, lastProblems: [] }

    const result = await runAgentLoop({
      runId,
      model: researchModel(),
      system: readFileSync(PROMPT, 'utf8'),
      messages: [{ role: 'user', content: taskMessage(input, run.engagementId, decisions) }],
      tools: researchTools(ctx),
      effort: 'high',
      describeCall: (name, i) => `Calling ${name}${typeof i.customerId === 'string' && accounts.get(i.customerId.replace(/-/g, '')) ? ` on ${accounts.get(i.customerId.replace(/-/g, ''))}` : ` for ${input.client}`}`,
    })

    if (!ctx.briefId && !result.cancelled) {
      const why = ctx.lastProblems.length ? `the brief failed its check twice: ${ctx.lastProblems.slice(0, 5).join('; ')}` : 'the run ended without saving a brief'
      throw new Error(why)
    }
    await emit(runId, 'status', ctx.briefId ? `Brief ${ctx.briefId} saved, ${ctx.ads.calls} Google calls` : 'Cancelled before a brief was saved')
    await finishRun(runId, { briefId: ctx.briefId, googleAdsCalls: ctx.ads.calls, turns: result.turns, cancelled: result.cancelled, finalText: result.finalText.slice(0, 4000) })
  } catch (err) {
    await failRun(runId, err)
  }
  const job = await db.agentRun.findUnique({ where: { id: runId }, select: { jobId: true } })
  if (job?.jobId) await onSpecialistRunEnded(job.jobId).catch((err) => console.error('[hq] job report failed:', err instanceof Error ? err.message : err))
}
