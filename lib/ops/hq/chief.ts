// ===========================================
// Ops HQ — the chief
// ===========================================
// Jacob's operations chief. Reads the board, records the updates he gives it,
// records standing decisions, hands work to specialists under a job, and
// writes the job report. Client tools only; every write is to an Ops table.
//
// Model: OPS_CHIEF_MODEL (default claude-opus-5-5), key ANTHROPIC_API_KEY_BUILDS.

import { readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import { db } from '@/lib/db'
import { OPS_TIMEZONE, getOpsBoard, type BoardEngagement } from '@/lib/ops/board'
import { STEP_CATALOG, defaultWaitingOn, stepFor } from '@/lib/ops/steps'
import { DELIVERABLE_TYPES } from '@/lib/ops/types'
import { waitUntil } from '@vercel/functions'
import { AdsOffline, adsClients, runAdsTask, startAdsRun } from './ads'
import { type ApiMessage, CHIEF_MODEL_DEFAULT } from './anthropic'
import { DECISION_PREFIX, decisionsByEngagement } from './decisions'
import { noEmDash, oneLine } from './events'
import { type ClientTool, runAgentLoop } from './loop'
import { adsAccountUrl } from './links'
import { createRun, failRun, finishRun } from './runs'

const HISTORY_MESSAGES = 40

const chiefModel = () => process.env.OPS_CHIEF_MODEL?.trim() || CHIEF_MODEL_DEFAULT

const SYSTEM = `You are the operations chief for Align and Acquire, Jacob's agency. Jacob builds websites, runs Google Ads and sets up missed-call texting for local service businesses. You run the client delivery board with him.

How you talk: short and plain. No preamble, no filler, no em dashes. Name clients by name. Give numbers and dates. When there is a list, use a list.

What you do:
- Look before you answer. Read the board with get_board, or one client in full with get_client. Never answer about a client from memory.
- Record what Jacob tells you ("Cole approved the site", "Ronny's budget is $500") with log_update, in his words. When the update moves a deliverable, pass the step, using a step key from that client's step list in get_client.
- Record standing decisions ("keep X off", "don't raise Y") with record_decision. Specialists read them and must follow them.
- Hand off work Jacob asks for: start_ads_task for Google Ads work, start_web_task for a change to a client's website. Each one starts a specialist run under the current job. Write instructions a specialist can act on without asking back: the client, the goal, the limits, and Jacob's decisions.
- When Jacob points at a spec under docs/ads-specs/, read it with read_spec and pass its full text in the start_ads_task instructions, after one line with Jacob's own instructions (e.g. "Build it paused and queue the enable for my approval."). Do not shorten the spec.
- After you start specialists, tell Jacob in a line or two what you started. Do not call finish_job then: when every run in the job has finished you will be asked for the report, and you write it with finish_job.

Rules:
- Never say a specialist did something until its run says so. Say it started, not that it is done.
- Never make up ids, amounts, dates or steps. If the board does not have it, say so.
- Never count by hand. Totals come from the board's waitingTotals; if you split items into groups, say how many are in each group and make the groups add up.
- If a tool says a specialist is offline or blocked, tell Jacob in one line and what would unblock it.
- Anything that raises spend, turns something on, or goes to production waits for Jacob's Push. You never approve it yourself.
- You write only Ops records (activities, steps, follow-ups, jobs). You never change a client's platform account, pipeline, leads or appointments.`

type ChiefContext = { runId: string; messageId: string | null; prompt: string; jobId: string | null }

// ── Board views ─────────────────────────────────────────────────────────────

function adsCustomerId(e: BoardEngagement): string | null {
  const ads = e.deliverables.find((d) => d.type === 'ads')
  const ev = ads?.evidence.adsCustomerId
  return e.business?.googleAdsCustomerId ?? (typeof ev === 'string' ? ev : null)
}

function repoUrl(e: BoardEngagement): string | null {
  const v = e.deliverables.find((d) => d.type === 'website')?.evidence.repoUrl
  return typeof v === 'string' ? v : null
}

async function compactBoard() {
  const [board, decisions] = await Promise.all([getOpsBoard(), decisionsByEngagement()])
  const waitingTotals: Record<string, { items: number; clients: number }> = {}
  for (const owner of ['jacob', 'client', 'vendor']) {
    const hits = board.engagements.filter((e) => e.deliverables.some((d) => d.waitingOn === owner))
    const items = board.engagements.reduce((n, e) => n + e.deliverables.filter((d) => d.waitingOn === owner).length, 0)
    waitingTotals[owner] = { items, clients: hits.length }
  }
  return {
    generatedAt: board.generatedAt,
    waitingTotals,
    clients: board.engagements.map((e) => ({
      id: e.id,
      name: e.displayName,
      stage: e.stage,
      services: e.services,
      adsCustomerId: adsCustomerId(e),
      repoUrl: repoUrl(e),
      nextFollowUpAt: e.nextFollowUpAt,
      deliverables: e.deliverables.map((d) => ({
        type: d.type,
        step: d.step,
        stepLabel: d.stepLabel,
        waitingOn: d.waitingOn,
        waitingNote: d.waitingNote,
        status: d.effectiveStatus,
        since: d.stepUpdatedAt,
      })),
      alerts: e.alerts.map((a) => `${a.severity}: ${a.message}`),
      ...(decisions.get(e.id)?.length ? { decisions: decisions.get(e.id) } : {}),
    })),
    followUpsDue: board.followUpsDue.map((f) => ({ kind: f.kind, name: f.name, dueAt: f.dueAt })),
  }
}

async function clientDetail(engagementId: string) {
  const board = await getOpsBoard()
  const e = board.engagements.find((x) => x.id === engagementId) ?? board.ignored.find((x) => x.id === engagementId)
  if (!e) throw new Error(`no client with id ${engagementId}`)
  const [activities, runs, decisions] = await Promise.all([
    db.opsActivity.findMany({ where: { engagementId }, orderBy: { createdAt: 'desc' }, take: 10, select: { kind: true, body: true, createdAt: true } }),
    db.agentRun.findMany({
      where: { engagementId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { agent: true, kind: true, status: true, output: true, error: true, createdAt: true, finishedAt: true },
    }),
    decisionsByEngagement([engagementId]),
  ])
  return {
    id: e.id,
    name: e.displayName,
    contactName: e.contactName,
    phone: e.phone,
    email: e.email,
    trade: e.trade,
    location: e.location,
    stage: e.stage,
    services: e.services,
    notes: e.notes,
    monthlyAmount: e.monthlyAmount,
    upfrontAmount: e.upfrontAmount,
    stripeSubscriptionStatus: e.stripeSubscriptionStatus,
    lastContactedAt: e.lastContactedAt,
    nextFollowUpAt: e.nextFollowUpAt,
    platformAccount: e.business ? { name: e.business.name, slug: e.business.slug, googleAdsCustomerId: e.business.googleAdsCustomerId } : null,
    adsCustomerId: adsCustomerId(e),
    deliverables: e.deliverables.map((d) => ({
      type: d.type,
      step: d.step,
      stepLabel: d.stepLabel,
      waitingOn: d.waitingOn,
      waitingNote: d.waitingNote,
      status: d.effectiveStatus,
      evidence: d.evidence,
      failingChecks: d.checks.filter((c) => c.passed === false).map((c) => c.key),
      steps: (STEP_CATALOG[d.type as keyof typeof STEP_CATALOG] ?? []).map((s) => `${s.key} (${s.label})`),
    })),
    alerts: e.alerts.map((a) => `${a.severity}: ${a.message}`),
    decisions: decisions.get(e.id) ?? [],
    recentActivity: activities.map((a) => ({ kind: a.kind, body: a.body, at: a.createdAt.toISOString() })),
    recentAgentRuns: runs.map((r) => ({
      agent: r.agent ?? 'web',
      kind: r.kind,
      status: r.status,
      error: r.error,
      at: r.createdAt.toISOString(),
      finishedAt: r.finishedAt?.toISOString() ?? null,
      output: r.output,
    })),
  }
}

// ── Specs ───────────────────────────────────────────────────────────────────

const SPEC_DIR = path.join(process.cwd(), 'docs', 'ads-specs')

/** A .md file under docs/ads-specs/, nothing else (no other folder, no link out of it). */
async function readSpec(input: string): Promise<{ rel: string; text: string }> {
  const cleaned = input.replace(/^\.?\//, '')
  if (!cleaned) throw new Error('path is empty')
  const full = path.resolve(cleaned.includes('/') ? process.cwd() : SPEC_DIR, cleaned)
  const inside = (p: string, dir: string) => p.startsWith(dir + path.sep)
  if (!inside(full, SPEC_DIR) || !full.endsWith('.md')) throw new Error('read_spec reads only .md files under docs/ads-specs/')
  let real: string
  try {
    real = await realpath(full)
  } catch {
    throw new Error(`no spec at docs/ads-specs/${path.basename(full)}`)
  }
  if (!inside(real, await realpath(SPEC_DIR))) throw new Error('read_spec reads only .md files under docs/ads-specs/')
  const text = await readFile(real, 'utf8')
  if (text.length > 100_000) throw new Error('that spec is over 100,000 characters')
  return { rel: path.relative(process.cwd(), full), text }
}

// ── Tools ───────────────────────────────────────────────────────────────────

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

async function engagementName(id: string) {
  const e = await db.engagement.findUnique({ where: { id }, select: { displayName: true } })
  if (!e) throw new Error(`no client with id ${id}`)
  return e.displayName.trim()
}

/** The job this conversation turn belongs to, created on the first delegation. */
async function ensureJob(ctx: ChiefContext, engagementIds: string[]): Promise<string> {
  if (ctx.jobId) {
    const job = await db.opsJob.findUniqueOrThrow({ where: { id: ctx.jobId }, select: { engagementIds: true } })
    const merged = Array.from(new Set([...job.engagementIds, ...engagementIds]))
    await db.opsJob.update({ where: { id: ctx.jobId }, data: { engagementIds: merged, status: 'running' } })
    return ctx.jobId
  }
  const job = await db.opsJob.create({ data: { prompt: ctx.prompt, status: 'running', engagementIds } })
  ctx.jobId = job.id
  await db.agentRun.update({ where: { id: ctx.runId }, data: { jobId: job.id } })
  if (ctx.messageId) await db.opsMessage.update({ where: { id: ctx.messageId }, data: { jobId: job.id } })
  return job.id
}

function chiefTools(ctx: ChiefContext): ClientTool[] {
  return [
    {
      name: 'get_board',
      description:
        'Every active client (ignored rows left out): stage, services, each deliverable with its step, who it waits on and status, Google Ads customer id, website repo, open alerts, standing decisions, and follow-ups due.',
      input_schema: { type: 'object', properties: {} },
      run: async () => {
        const board = await compactBoard()
        return { result: board, label: `Read the board: ${board.clients.length} clients` }
      },
    },
    {
      name: 'get_client',
      description: 'One client in full: contact, money, every deliverable with evidence and its valid step keys, decisions, the last 10 activities and the last 5 agent runs.',
      input_schema: { type: 'object', properties: { engagementId: { type: 'string', description: 'The client id from get_board.' } }, required: ['engagementId'] },
      run: async (input) => {
        const detail = await clientDetail(str(input.engagementId))
        return { result: detail, label: `Read ${detail.name}` }
      },
    },
    {
      name: 'log_update',
      description:
        "Record an update Jacob gave about a client, in his words, as an activity. Optionally move one deliverable to a new step (a key from that deliverable's steps in get_client) and set the next follow-up date.",
      input_schema: {
        type: 'object',
        properties: {
          engagementId: { type: 'string' },
          body: { type: 'string', description: 'What happened, short and plain.' },
          step: { type: 'object', description: '{ deliverableType, step } to move a deliverable.' },
          nextFollowUpAt: { type: 'string', description: 'ISO date or date-time for the next follow-up.' },
        },
        required: ['engagementId', 'body'],
      },
      run: async (input) => {
        const engagementId = str(input.engagementId)
        const name = await engagementName(engagementId)
        const body = noEmDash(str(input.body))
        if (!body) throw new Error('body is empty')

        let stepChange: { deliverableId: string; type: string; key: string } | null = null
        if (input.step) {
          const s = input.step as Record<string, unknown>
          const type = str(s.deliverableType)
          const key = str(s.step)
          if (!(DELIVERABLE_TYPES as readonly string[]).includes(type)) throw new Error(`deliverableType must be one of ${DELIVERABLE_TYPES.join(', ')}`)
          if (!stepFor(type, key)) {
            const valid = (STEP_CATALOG[type as keyof typeof STEP_CATALOG] ?? []).map((st) => st.key)
            throw new Error(`step "${key}" is not a ${type} step. Valid: ${valid.join(', ')}`)
          }
          const d = await db.deliverable.findUnique({ where: { engagementId_type: { engagementId, type } }, select: { id: true } })
          if (!d) throw new Error(`${name} has no ${type} deliverable`)
          stepChange = { deliverableId: d.id, type, key }
        }
        let followUp: Date | null = null
        if (input.nextFollowUpAt) {
          followUp = new Date(str(input.nextFollowUpAt))
          if (Number.isNaN(followUp.getTime())) throw new Error('nextFollowUpAt is not a date')
        }

        await db.$transaction(async (tx) => {
          await tx.opsActivity.create({ data: { engagementId, kind: 'note', body, followUpAt: followUp } })
          if (followUp) await tx.engagement.update({ where: { id: engagementId }, data: { nextFollowUpAt: followUp } })
          if (stepChange) {
            await tx.deliverable.update({
              where: { id: stepChange.deliverableId },
              data: { step: stepChange.key, stepUpdatedAt: new Date(), waitingOn: defaultWaitingOn(stepChange.type, stepChange.key) },
            })
          }
        })
        const parts = [`Logged on ${name}`]
        if (stepChange) parts.push(`${stepChange.type} step to ${stepChange.key}`)
        if (followUp) parts.push(`follow-up ${followUp.toISOString().slice(0, 10)}`)
        return { result: { ok: true, client: name, step: stepChange && `${stepChange.type}: ${stepChange.key}`, followUp: followUp?.toISOString() ?? null }, label: parts.join(', ') }
      },
    },
    {
      name: 'record_decision',
      description: 'Record a standing decision for a client ("keep the Maps campaign off", "do not raise the budget above $20/day"). Specialists must follow every decision.',
      input_schema: {
        type: 'object',
        properties: { engagementId: { type: 'string' }, decision: { type: 'string', description: 'The decision, one sentence.' } },
        required: ['engagementId', 'decision'],
      },
      run: async (input) => {
        const engagementId = str(input.engagementId)
        const name = await engagementName(engagementId)
        const decision = noEmDash(str(input.decision))
        if (!decision) throw new Error('decision is empty')
        await db.opsActivity.create({ data: { engagementId, kind: 'system', body: `${DECISION_PREFIX} ${decision}` } })
        return { result: { ok: true, client: name }, label: `Decision for ${name}: ${decision}` }
      },
    },
    {
      name: 'read_spec',
      description: 'Read a markdown spec Jacob wrote, from docs/ads-specs/ only (e.g. "docs/ads-specs/prestige-blinds-2026-10.md" or just the file name). Returns its full text.',
      input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
      run: async (input) => {
        const { rel, text } = await readSpec(str(input.path))
        return { result: { path: rel, text }, label: `Read ${rel} (${text.split('\n').length} lines)` }
      },
    },
    {
      name: 'start_ads_task',
      description:
        "Start the ads specialist on one client's Google Ads account, or on every ads client with engagementId 'all_ads_clients'. It reads, makes safe changes itself, and returns anything that raises spend or turns something on as a proposal for Jacob's Push.",
      input_schema: {
        type: 'object',
        properties: {
          engagementId: { type: 'string', description: "A client id, or 'all_ads_clients'." },
          instructions: { type: 'string', description: 'What to do and why, with any limits.' },
        },
        required: ['engagementId', 'instructions'],
      },
      run: async (input) => {
        const target = str(input.engagementId)
        const instructions = noEmDash(str(input.instructions))
        if (!instructions) throw new Error('instructions are empty')
        const clients = target === 'all_ads_clients' ? await adsClients() : [{ id: target, name: await engagementName(target) }]
        if (clients.length === 0) throw new Error('no client has a Google Ads account on the board')
        const started: string[] = []
        const skipped: string[] = []
        let jobId: string | null = null
        for (const c of clients) {
          try {
            // One run per account. The job is created on the first run that can start.
            if (!jobId) jobId = await ensureJob(ctx, clients.map((x) => x.id))
            const run = await startAdsRun({ engagementId: c.id, jobId, instructions })
            waitUntil(runAdsTask(run.id))
            started.push(c.name)
          } catch (err) {
            if (err instanceof AdsOffline) throw err
            skipped.push(`${c.name}: ${err instanceof Error ? err.message : String(err)}`)
          }
        }
        return {
          result: { started, skipped, jobId },
          label: `Started the ads specialist on ${started.length} account${started.length === 1 ? '' : 's'}${skipped.length ? `, skipped ${skipped.length}` : ''}`,
        }
      },
    },
    {
      name: 'start_web_task',
      description:
        "Start the web specialist on a client's website repo: site_update (a scoped change, opens a PR with a preview) or go_live (make the site indexable). The change reaches production only when Jacob pushes it.",
      input_schema: {
        type: 'object',
        properties: {
          engagementId: { type: 'string' },
          kind: { type: 'string', enum: ['site_update', 'go_live'] },
          instructions: { type: 'string', description: 'The exact change, written for the site agent.' },
        },
        required: ['engagementId', 'kind', 'instructions'],
      },
      run: async () => {
        throw new Error('The web specialist is not connected to HQ yet. Tell Jacob he can still dispatch from the client panel.')
      },
    },
    {
      name: 'finish_job',
      description: "Write the job's final report once every run in it has finished: per specialist what was done, what to expect, links, and how many items wait for Push.",
      input_schema: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'Two or three plain sentences for the chat.' },
          sections: {
            type: 'array',
            description: 'One per specialist run: { agent, client, did, expect, links: [{ label, url }], waitingForPush }',
          },
        },
        required: ['summary', 'sections'],
      },
      run: async (input) => {
        if (!ctx.jobId) throw new Error('there is no job in this conversation to finish')
        const active = await db.agentRun.count({ where: { jobId: ctx.jobId, agent: { in: ['ads', 'web'] }, status: { in: ['queued', 'running', 'dispatched'] } } })
        if (active) throw new Error(`${active} specialist run${active === 1 ? ' is' : 's are'} still working; the report is asked for when they finish`)
        const pending = await db.opsApproval.count({ where: { jobId: ctx.jobId, status: 'pending' } })
        const report = { text: noEmDash(str(input.summary)), sections: Array.isArray(input.sections) ? input.sections : [], pendingApprovals: pending }
        await db.opsJob.update({
          where: { id: ctx.jobId },
          data: { summary: JSON.stringify(report), status: pending > 0 ? 'awaiting_approval' : 'done' },
        })
        return { result: { ok: true, pendingApprovals: pending }, label: `Wrote the job report${pending ? `, ${pending} waiting for Push` : ''}` }
      },
    },
  ]
}

// ── Running the chief ───────────────────────────────────────────────────────

/** The HQ chat as API messages: jacob → user, chief → assistant, starting at a user turn. */
async function chatHistory(uptoMessageId: string | null): Promise<ApiMessage[]> {
  const upto = uptoMessageId ? await db.opsMessage.findUnique({ where: { id: uptoMessageId }, select: { createdAt: true } }) : null
  const rows = await db.opsMessage.findMany({
    where: upto ? { createdAt: { lte: upto.createdAt } } : {},
    orderBy: { createdAt: 'desc' },
    take: HISTORY_MESSAGES,
    select: { role: true, body: true },
  })
  const ordered = rows.reverse()
  while (ordered.length && ordered[0].role !== 'jacob') ordered.shift()
  return ordered.map((m) => ({ role: m.role === 'jacob' ? ('user' as const) : ('assistant' as const), content: m.body }))
}

function today(): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: OPS_TIMEZONE, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(new Date())
}

/** Create the chief's run for one of Jacob's messages. The route then runs it with waitUntil. */
export async function startChiefRun(messageId: string, prompt: string) {
  return createRun({ agent: 'chief', kind: 'chief', mode: 'work', engagementId: null, input: { messageId, prompt } })
}

export async function runChief(runId: string) {
  const run = await db.agentRun.findUniqueOrThrow({ where: { id: runId }, select: { input: true, jobId: true } })
  const input = (run.input ?? {}) as { messageId?: string; prompt?: string }
  const ctx: ChiefContext = { runId, messageId: input.messageId ?? null, prompt: input.prompt ?? '', jobId: run.jobId }
  try {
    const messages = await chatHistory(ctx.messageId)
    if (messages.length === 0) throw new Error('no message from Jacob to answer')
    const result = await runAgentLoop({
      runId,
      model: chiefModel(),
      system: `${SYSTEM}\n\nToday is ${today()} (${OPS_TIMEZONE}).`,
      messages,
      tools: chiefTools(ctx),
      effort: 'medium',
    })
    const reply = result.finalText || (result.cancelled ? 'Stopped.' : '')
    if (reply) await db.opsMessage.create({ data: { role: 'chief', body: reply, jobId: ctx.jobId } })
    await finishRun(runId, { reply: oneLine(reply, 500), turns: result.turns, jobId: ctx.jobId, cancelled: result.cancelled })
  } catch (err) {
    const message = await failRun(runId, err)
    await db.opsMessage.create({ data: { role: 'chief', body: `I hit an error and stopped: ${message}`, jobId: ctx.jobId } })
  }
}

// ── The job report ──────────────────────────────────────────────────────────


/** What each specialist run in a job did, for the report prompt and the fallback report. */
async function jobRuns(jobId: string) {
  const [runs, approvals] = await Promise.all([
    db.agentRun.findMany({
      where: { jobId, agent: { in: ['ads', 'web'] } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, agent: true, mode: true, status: true, error: true, input: true, output: true, engagement: { select: { displayName: true } } },
    }),
    db.opsApproval.findMany({ where: { jobId }, orderBy: { createdAt: 'asc' }, select: { runId: true, title: true, status: true, detail: true } }),
  ])
  return runs.map((r) => {
    const out = (r.output ?? {}) as Record<string, unknown>
    const input = (r.input ?? {}) as Record<string, unknown>
    const customerId = typeof input.customerId === 'string' && input.customerId ? input.customerId : null
    return {
      agent: r.agent,
      client: r.engagement?.displayName.trim() ?? null,
      mode: r.mode,
      status: r.status,
      error: r.error,
      report: out.report ?? null,
      links: customerId ? [{ label: 'Google Ads account', url: adsAccountUrl(customerId) }] : [],
      approvals: approvals
        .filter((a) => a.runId === r.id)
        .map((a) => ({ title: a.title, status: a.status, monthlyCostChange: (a.detail as Record<string, unknown>)?.monthlyCostChange ?? null })),
    }
  })
}

type ReportSection = { agent: string; client: string | null; did: string[]; expect: string; links: { label: string; url: string }[]; waitingForPush: string[] }

/** The report the chief failed to write, built from the runs themselves. */
function fallbackSections(runs: Awaited<ReturnType<typeof jobRuns>>): ReportSection[] {
  return runs.map((r) => {
    const rep = (r.report ?? {}) as { done?: { change?: string }[]; expected?: string }
    return {
      agent: r.agent ?? 'ads',
      client: r.client,
      did: r.status === 'succeeded' ? (rep.done ?? []).map((d) => String(d.change ?? '')).filter(Boolean) : [`Run ${r.status}${r.error ? `: ${r.error}` : ''}`],
      expect: String(rep.expected ?? ''),
      links: r.links,
      waitingForPush: r.approvals.filter((a) => a.status === 'pending').map((a) => a.title),
    }
  })
}

/** Re-invoke the chief once to write a finished job's report (OpsJob.summary + a chief message). */
export async function runChiefReport(jobId: string) {
  const job = await db.opsJob.findUniqueOrThrow({ where: { id: jobId }, select: { prompt: true } })
  const runs = await jobRuns(jobId)
  const run = await createRun({ agent: 'chief', kind: 'chief', mode: 'work', engagementId: null, jobId, input: { report: true, jobId } })
  const ctx: ChiefContext = { runId: run.id, messageId: null, prompt: job.prompt, jobId }
  const prompt = [
    `Every specialist run in this job has finished. Jacob asked: "${job.prompt}"`,
    `The runs, with each one's parsed report, links and approvals:\n${JSON.stringify(runs, null, 1)}`,
    'Call finish_job once. sections: one per run, { agent, client, did: [what was done, one line each], expect: what to expect and when, links: [{ label, url }] (use the links given), waitingForPush: [titles of pending approvals] }. Then reply to Jacob in two or three plain sentences: what is done and what waits for his Push. No em dashes.',
  ].join('\n\n')
  try {
    const result = await runAgentLoop({
      runId: run.id,
      model: chiefModel(),
      system: `${SYSTEM}\n\nToday is ${today()} (${OPS_TIMEZONE}).`,
      messages: [{ role: 'user', content: prompt }],
      tools: chiefTools(ctx).filter((t) => t.name === 'finish_job' || t.name === 'get_client'),
      effort: 'medium',
    })
    await writeFallbackIfNeeded(jobId, runs)
    const reply = result.finalText || 'The job is finished. The report is below.'
    await db.opsMessage.create({ data: { role: 'chief', body: reply, jobId } })
    await finishRun(run.id, { report: true, reply: oneLine(reply, 500), turns: result.turns, jobId })
  } catch (err) {
    const message = await failRun(run.id, err)
    await writeFallbackIfNeeded(jobId, runs)
    await db.opsMessage.create({ data: { role: 'chief', body: `The job finished but I could not write the report: ${message}. The runs' own results are below.`, jobId } })
  }
}

/** A job still at reporting after the chief ran gets the plain report built from its runs. */
async function writeFallbackIfNeeded(jobId: string, runs: Awaited<ReturnType<typeof jobRuns>>) {
  const job = await db.opsJob.findUnique({ where: { id: jobId }, select: { status: true } })
  if (job?.status !== 'reporting') return
  const pending = await db.opsApproval.count({ where: { jobId, status: 'pending' } })
  const report = { text: 'Report built from the runs.', sections: fallbackSections(runs), pendingApprovals: pending }
  await db.opsJob.update({ where: { id: jobId }, data: { summary: JSON.stringify(report), status: pending > 0 ? 'awaiting_approval' : 'done' } })
}
