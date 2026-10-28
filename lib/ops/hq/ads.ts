// ===========================================
// Ops HQ — the ads specialist
// ===========================================
// One AgentRun per Google Ads account (agent ads, kind ads_task). A normal
// tool_use loop like the chief: the tools in ads-tools.ts call the Google Ads
// API with the platform's own credentials, logged in through the MCC, and every
// call and change lands in the feed as it happens.
//
//   mode work   reads plus the playbook's AUTO writes, made for real;
//               spend-raising changes come back as proposals → OpsApproval
//               (kind ads_change, pending)
//   mode apply  one approved proposal (input.approval): reads plus only that
//               proposal's tool, called with exactly its args; the OpsApproval
//               becomes applied or failed when the run ends
//   dry         either mode with every write sent validate_only: Google checks
//               it and nothing changes
//
// A work run's report is checked before approvals are made: every proposal
// must name an apply tool with valid args, and no UI step may be a change a tool
// can make (bidding strategy, location option, end date, budget, enabling, an ad
// group bid). If either fails, the model gets one turn to fix its report.
//
// System prompt: lib/ops/hq/prompts/ads.md. Env, read by name only: the five
// GOOGLE_ADS_* credentials (any missing ⇒ offline), OPS_AGENT_MODEL (default
// claude-sonnet-5-5), ANTHROPIC_API_KEY_BUILDS.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { AGENT_MODEL_DEFAULT, type ApiMessage } from './anthropic'
import { ADS_APPLY_TOOLS, adsTools, campaignStates, checkProposal, isNeverTouch, missingAdsEnv, setAdsStep, type AdsToolContext } from './ads-tools'
import { DECISION_PREFIX } from './decisions'
import { emit, noEmDash, oneLine } from './events'
import { runAgentLoop } from './loop'
import { onSpecialistRunEnded } from './jobs'
import { createRun, failRun, finishRun } from './runs'

const PLAYBOOK = path.join(process.cwd(), 'lib/ops/hq/prompts/ads.md')

export class AdsOffline extends Error {}

export const ADS_OFFLINE = 'offline: Google Ads credentials not set'

const agentModel = () => process.env.OPS_AGENT_MODEL?.trim() || AGENT_MODEL_DEFAULT

// ── Report parsing ──────────────────────────────────────────────────────────

export type AdsProposal = {
  title: string
  account: string
  campaignId: string
  action: string
  args: Record<string, unknown>
  monthlyCostChange: number
  why: string
  expected: string
  /** Why Jacob should not push it yet (e.g. "do not push until cmhomeservicesnj.com is live"); the card holds Push behind a second confirm. */
  hold?: string
}
export type AdsReport = {
  done: { account: string; campaignId: string; change: string }[]
  proposals: AdsProposal[]
  ui_steps: string[]
  expected: string
}

/** The run's closing JSON block: a ```json fence if there is one, else the last object that starts with "done". */
export function parseAdsReport(text: string): { report: AdsReport | null; error: string | null } {
  const fences = Array.from(text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g), (m) => m[1].trim())
  let raw = fences.reverse().find((f) => f.startsWith('{')) ?? null
  if (!raw) {
    const start = text.lastIndexOf('{"done"')
    if (start !== -1) raw = text.slice(start, text.lastIndexOf('}') + 1)
  }
  if (!raw) return { report: null, error: 'no JSON block in the output' }
  let j: Record<string, unknown>
  try {
    j = JSON.parse(raw)
  } catch (err) {
    return { report: null, error: `JSON did not parse: ${err instanceof Error ? err.message : String(err)}` }
  }
  const s = (v: unknown) => (typeof v === 'string' ? noEmDash(v.trim()) : v == null ? '' : String(v))
  const arr = (v: unknown) => (Array.isArray(v) ? v : [])
  const report: AdsReport = {
    done: arr(j.done)
      .map((d: Record<string, unknown>) => ({ account: s(d?.account), campaignId: s(d?.campaignId), change: s(d?.change) }))
      .filter((d) => d.change),
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
    ui_steps: arr(j.ui_steps).map(s).filter(Boolean),
    expected: s(j.expected),
  }
  return { report, error: null }
}

// ── Board sync after a run ──────────────────────────────────────────────────

/**
 * After a campaign is turned on or off, move the client's ads step so nobody
 * has to do it by hand (Ops tables only):
 *   apply run, enable_campaign changed the account → running, with the
 *     enabled campaigns' daily budget in evidence.dailyBudget.
 *   work run, pause_campaign changed it and no campaign is left enabled →
 *     paused_by_client (the catalog's one paused step), unless the agent set
 *     the step itself with set_ads_step.
 */
async function syncAdsStep(runId: string, ctx: AdsToolContext, mode: 'work' | 'apply') {
  if (!ctx.engagementId || ctx.dry) return
  const changed = (tool: string) => ctx.writes.filter((w) => w.tool === tool && w.changed)
  const enabled = mode === 'apply' ? changed('enable_campaign') : []
  const paused = mode === 'work' && !ctx.stepSet ? changed('pause_campaign') : []
  if (!enabled.length && !paused.length) return

  const states = await campaignStates(ctx)
  const live = states.filter((c) => c.status === 'ENABLED')
  const budget = Math.round(live.reduce((n, c) => n + (c.dailyBudget ?? 0), 0) * 100) / 100
  const ids = (ws: typeof enabled) => ws.map((w) => String(w.args.campaignId)).join(', ')
  const day = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Detroit' })

  if (enabled.length) {
    await setAdsStep(ctx.engagementId, ctx.client, 'running', `Running since ${day}: campaign ${ids(enabled)} enabled after Jacob's Push, $${budget}/day`, { dailyBudget: budget })
    await emit(runId, 'status', `Ads step for ${ctx.client} set to running ($${budget}/day)`)
  } else if (!live.length) {
    await setAdsStep(ctx.engagementId, ctx.client, 'paused_by_client', `Paused ${day}: campaign ${ids(paused)} paused by the ads specialist; nothing is running`, { dailyBudget: 0 })
    await emit(runId, 'status', `Ads step for ${ctx.client} set to paused: no campaign is running`)
  } else {
    await emit(runId, 'status', `Ads step for ${ctx.client} left as is: ${live.length} campaign${live.length === 1 ? '' : 's'} still running`)
  }
}

// ── Starting and running ────────────────────────────────────────────────────

type AdsApproval = { id: string; action: string; args: Record<string, unknown> }
type AdsInput = { instructions: string; customerId: string; client: string; dry: boolean; allow?: string[]; approval?: AdsApproval; approvalId?: string }

export async function adsClients(): Promise<{ id: string; name: string; customerId: string }[]> {
  const rows = await db.engagement.findMany({
    where: { stage: { notIn: ['ignored', 'churned'] } },
    select: { id: true, displayName: true, services: true, business: { select: { googleAdsCustomerId: true } }, deliverables: { where: { type: 'ads' }, select: { evidence: true } } },
  })
  return rows.flatMap((r) => {
    const ev = r.deliverables[0]?.evidence as Record<string, unknown> | null
    const id = r.business?.googleAdsCustomerId ?? (typeof ev?.adsCustomerId === 'string' ? ev.adsCustomerId : null)
    return id && Array.isArray(r.services) && (r.services as string[]).includes('ads') ? [{ id: r.id, name: r.displayName.trim(), customerId: id.replace(/-/g, '') }] : []
  })
}

/** Create the run for one account. Throws AdsOffline when the Google Ads credentials are missing, Error when the account is out of bounds. */
export async function startAdsRun(opts: {
  engagementId: string
  jobId: string | null
  instructions: string
  mode?: 'work' | 'apply'
  /** Apply mode: the approved proposal; its action is the only write tool the run gets. */
  approval?: AdsApproval
  dry?: boolean
}) {
  const missing = missingAdsEnv()
  if (missing.length) throw new AdsOffline(`Ads specialist ${ADS_OFFLINE} (${missing.join(', ')})`)
  const mode = opts.mode ?? 'work'
  if (mode === 'apply') {
    if (!opts.approval) throw new Error('an apply run needs the approved proposal')
    const bad = checkProposal(opts.approval.action, opts.approval.args)
    if (bad) throw new Error(`the approved proposal cannot be applied: ${bad}`)
  }
  const e = await db.engagement.findUnique({
    where: { id: opts.engagementId },
    select: { displayName: true, business: { select: { googleAdsCustomerId: true } }, deliverables: { where: { type: 'ads' }, select: { id: true, evidence: true } } },
  })
  if (!e) throw new Error(`no client with id ${opts.engagementId}`)
  const client = e.displayName.trim()
  if (isNeverTouch(client)) throw new Error(`${client} is on the never-touch list`)
  const ev = e.deliverables[0]?.evidence as Record<string, unknown> | null
  const customerId = (e.business?.googleAdsCustomerId ?? (typeof ev?.adsCustomerId === 'string' ? ev.adsCustomerId : ''))?.replace(/-/g, '')
  // No id on the board: a work run finds the account under the manager and binds it (bind_account).
  if (!customerId && mode === 'apply') throw new Error(`${client} has no Google Ads customer id on the board`)
  const input: AdsInput = {
    instructions: opts.instructions,
    customerId,
    client,
    dry: Boolean(opts.dry),
    ...(mode === 'apply' && opts.approval ? { allow: [opts.approval.action], approval: opts.approval, approvalId: opts.approval.id } : {}),
  }
  return createRun({
    agent: 'ads',
    kind: 'ads_task',
    mode,
    engagementId: opts.engagementId,
    jobId: opts.jobId,
    deliverableId: e.deliverables[0]?.id ?? null,
    input,
  })
}

function taskMessage(input: AdsInput, mode: 'work' | 'apply', decisions: string[]): string {
  const modeLine =
    mode === 'work'
      ? [
          'Work run: make the AUTO changes yourself with your write tools.',
          `Anything that spends more, and any change you have no tool for in this run, goes in "proposals": "action" is the tool that would make it (${ADS_APPLY_TOOLS.join(', ')}) and "args" are that tool's arguments without customerId, e.g. {"campaignId": "123", "strategy": "MAXIMIZE_CLICKS", "cpcCeiling": 8}.`,
          '"ui_steps" are only for work no tool can do: call conversions, call assets, sitelinks, billing, advertiser verification, conversion tracking setup, keyword-level bids. A bidding strategy, location option, end date, budget, enabling a campaign or an ad group bid is never a UI step: propose it. Advice (what not to do yet) goes in "expected", not in ui_steps.',
        ].join(' ')
      : `Apply run: Jacob approved one change. Call ${input.approval?.action} with exactly ${JSON.stringify(input.approval?.args ?? {})} (plus customerId), then confirm it with a read and report it in "done". Change nothing else; any other write is refused.`
  const accountLine = input.customerId
    ? `Account: ${input.client}, Google Ads customer ${input.customerId}. Pass customerId ${input.customerId} on every tool call; the tools log in through the manager account for you.`
    : `Client: ${input.client}. The board has no Google Ads account for this client yet. Find it under the manager with find_client_account (try the business name, then the owner's name or trade) and bind_account it before anything else; that also records the id on the platform. If none matches, stop and say so; never create an account. After binding, pass that customerId on every tool call.`
  return [
    accountLine,
    `Standing decisions for this client:\n${decisions.length ? decisions.map((d) => `- ${DECISION_PREFIX} ${d}`).join('\n') : '- none'}`,
    `Task from Jacob's chief:\n${input.instructions}`,
    modeLine,
    input.dry
      ? 'DRY RUN: every write is sent validate_only, so Google checks it and nothing changes. Put each AUTO change in "done" with "change" starting "Would: ".'
      : '',
    'Work only on this account. End with exactly one JSON block in the format the playbook gives.',
  ]
    .filter(Boolean)
    .join('\n\n')
}

/** UI steps that describe a change a tool can make. Advice and UI-only work pass. */
const API_DOABLE = [
  /bid(ding)? strategy|maximi[sz]e (clicks|conversions)|manual cpc|target cpa|cpc ceiling/i,
  /location option|presence( or interest)?\b/i,
  /end date/i,
  /\bbudget\b/i,
  /\b(enable|turn on|unpause|re-?activate)\b.*\bcampaign/i,
  /ad group (bid|max cpc|default bid)/i,
]

/** What is wrong with a work report: proposals that cannot be applied, UI steps a tool could do. */
function reportProblems(report: AdsReport): string[] {
  const problems: string[] = []
  report.proposals.forEach((p, n) => {
    const bad = checkProposal(p.action, p.args)
    if (bad) problems.push(`proposal ${n + 1} ("${p.title}"): ${bad}`)
  })
  for (const step of report.ui_steps) if (API_DOABLE.some((re) => re.test(step))) problems.push(`ui_step "${oneLine(step, 120)}" is a change a tool can make`)
  return problems
}

export async function runAdsTask(runId: string) {
  let approvalId: string | null = null
  try {
    const missing = missingAdsEnv()
    if (missing.length) throw new AdsOffline(`${ADS_OFFLINE} (${missing.join(', ')})`)
    const run = await db.agentRun.findUniqueOrThrow({ where: { id: runId }, select: { input: true, jobId: true, engagementId: true, mode: true } })
    const input = run.input as unknown as AdsInput
    const mode = run.mode === 'apply' ? 'apply' : 'work'
    approvalId = input.approval?.id ?? null
    const decisions = run.engagementId
      ? (
          await db.opsActivity.findMany({
            where: { engagementId: run.engagementId, body: { startsWith: DECISION_PREFIX } },
            orderBy: { createdAt: 'asc' },
            select: { body: true },
          })
        ).map((d) => d.body.slice(DECISION_PREFIX.length).trim())
      : []
    const ctx: AdsToolContext = {
      runId,
      customerId: input.customerId,
      client: input.client,
      engagementId: run.engagementId,
      findAccount: !input.customerId,
      mode,
      dry: input.dry,
      allow: input.allow,
      approved: input.approval ? { action: input.approval.action, args: input.approval.args } : undefined,
      calls: 0,
      writes: [],
    }
    const loop = (messages: ApiMessage[]) =>
      runAgentLoop({
        runId,
        model: agentModel(),
        system: readFileSync(PLAYBOOK, 'utf8'),
        messages,
        tools: adsTools(ctx),
        effort: 'high',
        describeCall: (name) => `Calling ${name} on ${input.client}`,
      })

    let result = await loop([{ role: 'user', content: taskMessage(input, mode, decisions) }])
    let turns = result.turns
    let { report, error } = parseAdsReport(result.finalText)

    // One chance to fix a work report that breaks the rules; then whatever is left is flagged.
    const problems = mode === 'work' && !result.cancelled ? (report ? reportProblems(report) : [`your report did not parse: ${error}`]) : []
    if (problems.length) {
      await emit(runId, 'status', `Report needs a fix: ${problems.length} problem${problems.length === 1 ? '' : 's'}`, { problems })
      result = await loop([
        ...result.messages,
        {
          role: 'user',
          content: `Fix your report and send the whole JSON block again. Make no further changes.\n${problems.map((p) => `- ${p}`).join('\n')}\nA change a tool can make goes in "proposals" with "action" (one of ${ADS_APPLY_TOOLS.join(', ')}) and its "args"; advice goes in "expected".`,
        },
      ])
      turns += result.turns
      ;({ report, error } = parseAdsReport(result.finalText))
      const left = report ? reportProblems(report) : []
      if (left.length) await emit(runId, 'error', `Report still has ${left.length} problem${left.length === 1 ? '' : 's'}; those proposals get no approval`, { problems: left })
    }
    if (error) await emit(runId, 'error', `Report: ${error}`)

    let approvals = 0
    if (report && run.jobId && mode === 'work') {
      for (const p of report.proposals) {
        if (checkProposal(p.action, p.args)) continue
        await db.opsApproval.create({
          data: {
            jobId: run.jobId,
            runId,
            agent: 'ads',
            kind: 'ads_change',
            title: oneLine(p.title, 200),
            detail: { ...p, customerId: ctx.customerId } as Prisma.InputJsonObject,
            expected: p.expected || null,
          },
        })
        approvals++
      }
    }
    if (report) {
      await emit(
        runId,
        'status',
        `Report: ${report.done.length} done, ${report.proposals.length} proposal${report.proposals.length === 1 ? '' : 's'}, ${report.ui_steps.length} UI step${report.ui_steps.length === 1 ? '' : 's'}`,
        report
      )
    }

    // Apply run: the approval is applied only if the approved tool changed the account.
    if (approvalId) {
      const made = ctx.writes.some((w) => w.tool === input.approval?.action && w.changed)
      await db.opsApproval.updateMany({
        where: { id: approvalId, status: 'approved' },
        data: made ? { status: 'applied', appliedAt: new Date(), error: null } : { status: 'failed', error: result.cancelled ? 'the apply run was cancelled' : 'the approved change was not made' },
      })
      await emit(runId, made ? 'status' : 'error', made ? 'Approval applied' : 'Approval failed: the approved change was not made')
    }

    // Keep the board's ads step in line with what changed in the account.
    await syncAdsStep(runId, ctx, mode).catch((err) => emit(runId, 'error', `Could not move the ads step: ${err instanceof Error ? err.message : String(err)}`))

    await finishRun(runId, {
      mode,
      dry: input.dry,
      googleAdsCalls: ctx.calls,
      writes: ctx.writes,
      report,
      reportError: error,
      reportProblems: problems,
      approvalsCreated: approvals,
      finalText: result.finalText.slice(0, 20000),
      turns,
      cancelled: result.cancelled,
    })
  } catch (err) {
    const message = await failRun(runId, err)
    if (approvalId) await db.opsApproval.updateMany({ where: { id: approvalId, status: 'approved' }, data: { status: 'failed', error: message } })
  }
  // Last specialist run of a job to finish: the chief writes the report (or the job closes after an apply).
  const job = await db.agentRun.findUnique({ where: { id: runId }, select: { jobId: true } })
  if (job?.jobId) await onSpecialistRunEnded(job.jobId).catch((err) => console.error('[hq] job report failed:', err instanceof Error ? err.message : err))
}
