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
//   mode apply  reads plus only the apply tools the approved proposal names
//               (input.allow), one approved proposal at a time
//   dry         either mode with every write sent validate_only: Google checks
//               it and nothing changes
//
// System prompt: lib/ops/hq/prompts/ads.md. Env, read by name only: the five
// GOOGLE_ADS_* credentials (any missing ⇒ offline), OPS_AGENT_MODEL (default
// claude-sonnet-5-5), ANTHROPIC_API_KEY_BUILDS.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { AGENT_MODEL_DEFAULT } from './anthropic'
import { ADS_APPLY_TOOLS, adsTools, missingAdsEnv, type AdsToolContext } from './ads-tools'
import { DECISION_PREFIX } from './decisions'
import { emit, noEmDash, oneLine } from './events'
import { runAgentLoop } from './loop'
import { createRun, failRun, finishRun } from './runs'

const PLAYBOOK = path.join(process.cwd(), 'lib/ops/hq/prompts/ads.md')

/** Accounts the playbook says never to touch. Matched on the client name, case-insensitive. */
const NEVER_TOUCH = ['mk2 auto spa', "g's elite dump", 'g’s elite dump', 'valor', 'hail recovery', 'evergreen construction', 'apply nex']

export class AdsOffline extends Error {}

export const ADS_OFFLINE = 'offline: Google Ads credentials not set'

const agentModel = () => process.env.OPS_AGENT_MODEL?.trim() || AGENT_MODEL_DEFAULT

const isNeverTouch = (name: string) => NEVER_TOUCH.some((n) => name.toLowerCase().includes(n))

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
      }))
      .filter((p) => p.title && p.action),
    ui_steps: arr(j.ui_steps).map(s).filter(Boolean),
    expected: s(j.expected),
  }
  return { report, error: null }
}

// ── Starting and running ────────────────────────────────────────────────────

type AdsInput = { instructions: string; customerId: string; client: string; dry: boolean; allow?: string[] }

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
  /** Apply mode: the apply tools the approved proposal names. */
  allow?: string[]
  dry?: boolean
}) {
  const missing = missingAdsEnv()
  if (missing.length) throw new AdsOffline(`Ads specialist ${ADS_OFFLINE} (${missing.join(', ')})`)
  const mode = opts.mode ?? 'work'
  const allow = (opts.allow ?? []).filter((t) => ADS_APPLY_TOOLS.includes(t))
  if (mode === 'apply' && !allow.length) throw new Error(`an apply run needs one of ${ADS_APPLY_TOOLS.join(', ')}`)
  const e = await db.engagement.findUnique({
    where: { id: opts.engagementId },
    select: { displayName: true, business: { select: { googleAdsCustomerId: true } }, deliverables: { where: { type: 'ads' }, select: { id: true, evidence: true } } },
  })
  if (!e) throw new Error(`no client with id ${opts.engagementId}`)
  const client = e.displayName.trim()
  if (isNeverTouch(client)) throw new Error(`${client} is on the never-touch list`)
  const ev = e.deliverables[0]?.evidence as Record<string, unknown> | null
  const customerId = (e.business?.googleAdsCustomerId ?? (typeof ev?.adsCustomerId === 'string' ? ev.adsCustomerId : ''))?.replace(/-/g, '')
  if (!customerId) throw new Error(`${client} has no Google Ads customer id on the board`)
  const input: AdsInput = { instructions: opts.instructions, customerId, client, dry: Boolean(opts.dry), ...(mode === 'apply' ? { allow } : {}) }
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
      ? `Work run: make the AUTO changes yourself with your write tools. Anything that spends more, and any change you have no tool for in this run (bidding strategy, budget, enabling, end date, raising a bid, removing a criterion), goes in "proposals": set "action" to the tool that would make it (${ADS_APPLY_TOOLS.join(', ')}) and "args" to that tool's arguments.`
      : `Apply run: make exactly the approved change with ${(input.allow ?? []).join(', ')}, check the result with a read, and report it in "done". Change nothing else.`
  return [
    `Account: ${input.client}, Google Ads customer ${input.customerId}. Pass customerId ${input.customerId} on every tool call; the tools log in through the manager account for you.`,
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

export async function runAdsTask(runId: string) {
  try {
    const missing = missingAdsEnv()
    if (missing.length) throw new AdsOffline(`${ADS_OFFLINE} (${missing.join(', ')})`)
    const run = await db.agentRun.findUniqueOrThrow({ where: { id: runId }, select: { input: true, jobId: true, engagementId: true, mode: true } })
    const input = run.input as unknown as AdsInput
    const mode = run.mode === 'apply' ? 'apply' : 'work'
    const decisions = run.engagementId
      ? (
          await db.opsActivity.findMany({
            where: { engagementId: run.engagementId, body: { startsWith: DECISION_PREFIX } },
            orderBy: { createdAt: 'asc' },
            select: { body: true },
          })
        ).map((d) => d.body.slice(DECISION_PREFIX.length).trim())
      : []
    const ctx: AdsToolContext = { runId, customerId: input.customerId, client: input.client, mode, dry: input.dry, allow: input.allow, calls: 0 }

    const result = await runAgentLoop({
      runId,
      model: agentModel(),
      system: readFileSync(PLAYBOOK, 'utf8'),
      messages: [{ role: 'user', content: taskMessage(input, mode, decisions) }],
      tools: adsTools(ctx),
      effort: 'high',
      describeCall: (name) => `Calling ${name} on ${input.client}`,
    })

    const { report, error } = parseAdsReport(result.finalText)
    if (error) await emit(runId, 'error', `Report: ${error}`)
    let approvals = 0
    if (report && run.jobId) {
      for (const p of report.proposals) {
        await db.opsApproval.create({
          data: {
            jobId: run.jobId,
            runId,
            agent: 'ads',
            kind: 'ads_change',
            title: oneLine(p.title, 200),
            detail: { ...p, customerId: input.customerId } as Prisma.InputJsonObject,
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
    await finishRun(runId, {
      mode,
      dry: input.dry,
      googleAdsCalls: ctx.calls,
      report,
      reportError: error,
      approvalsCreated: approvals,
      finalText: result.finalText.slice(0, 20000),
      turns: result.turns,
      cancelled: result.cancelled,
    })
  } catch (err) {
    await failRun(runId, err)
  }
}
