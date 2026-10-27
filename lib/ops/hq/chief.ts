// ===========================================
// Ops HQ — the chief
// ===========================================
// Jacob's operations chief. Reads the board, records the updates he gives it,
// records standing decisions, hands work to specialists under a job, and
// writes the job report. Client tools only; every write is to an Ops table.
//
// Model: OPS_CHIEF_MODEL (default claude-opus-5-5), key ANTHROPIC_API_KEY_BUILDS.

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
- When every run in a job has finished you will be asked for the report. Write it with finish_job.

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
