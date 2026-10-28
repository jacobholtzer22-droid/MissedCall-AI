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
import { rankNeedsYou } from '@/lib/ops/needs-you'
import { TIMELINE_KINDS, getTimeline, type TimelineKind } from '@/lib/ops/timeline'
import { nullableNumber } from '@/lib/ops/validate'
import { parseLocalDateTime } from '@/lib/ops/dates'
import { Conflict, NEW_CLIENT_FIELDS, createClient, parseNewClient } from '@/lib/ops/clients'
import { BUSINESS_PATCH_FIELDS } from '@/lib/admin-business-patch'
import { BadRequest } from '@/lib/ops/validate'
import { ROUTING_FIELDS, updateBusiness } from './admin-change'

/** "Tue Nov 3, 9:00 AM" in Detroit, for feed lines and results. */
const detroitWhen = (d: Date) =>
  d.toLocaleString('en-US', { timeZone: OPS_TIMEZONE, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
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
- Record what Jacob tells you ("Cole approved the site", "Ronny's budget is $500") with log_update, in his words. When the update moves a deliverable, pass the step, using a step key from that client's step list in get_client. When it changes where the client stands, pass statusLine: one sentence, the client's status now.
- Record standing decisions ("keep X off", "don't raise Y") with record_decision. Specialists read them and must follow them.
- Jacob reports what he did in plain language ("talked to Cole, he wants Friday", "Josue is on $350 from December"). Your job is to record it: log_update (with the step and statusLine when they change), record_decision for standing rules, set_client_amounts for money. Then reflect it back in one line: what you recorded, on whom.
- "What should I do" is answered from get_needs_you, in its rank order, never from memory. "What did I approve", "what happened with X" is answered from get_timeline; it says who pushed each approval and when it applied.
- New clients: when Jacob names one ("New client: ..."), create it with create_client (createBusiness when the client gets a website, ads or missed-call texting), then say in one line what was created. Platform account changes go through update_business; routing fields wait for Push.
- Hand off work Jacob asks for: start_ads_task for Google Ads work, start_web_task for a change to a client's website. Each one starts a specialist run under the current job. Write instructions a specialist can act on without asking back: the client, the goal, the limits, and Jacob's decisions.
- When Jacob points at a spec under docs/ads-specs/, read it with read_spec and pass its full text in the start_ads_task instructions, after one line with Jacob's own instructions (e.g. "Build it paused and queue the enable for my approval."). Do not shorten the spec.
- After you start specialists, tell Jacob in a line or two what you started. Do not call finish_job then: when every run in the job has finished you will be asked for the report, and you write it with finish_job.

Rules:
- Never say a specialist did something until its run says so. Say it started, not that it is done.
- Never make up ids, amounts, dates or steps. If the board does not have it, say so.
- Never count by hand. Totals come from the board's waitingTotals; if you split items into groups, say how many are in each group and make the groups add up.
- If a tool says a specialist is offline or blocked, tell Jacob in one line and what would unblock it.
- Anything that raises spend, turns something on, or goes to production waits for Jacob's Push. You never approve it yourself.
- You write Ops records (clients, activities, steps, follow-ups, jobs) and, through create_client and update_business only, platform accounts. You never touch pipeline, leads or appointments.`

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
      statusLine: e.statusLine,
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
  const [activities, runs, decisions, approvals] = await Promise.all([
    db.opsActivity.findMany({ where: { engagementId }, orderBy: { createdAt: 'desc' }, take: 10, select: { kind: true, body: true, createdAt: true } }),
    db.agentRun.findMany({
      where: { engagementId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { agent: true, kind: true, status: true, output: true, error: true, createdAt: true, finishedAt: true },
    }),
    decisionsByEngagement([engagementId]),
    db.opsApproval.findMany({
      where: { run: { engagementId } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { title: true, status: true, error: true, detail: true, createdAt: true, decidedAt: true, appliedAt: true },
    }),
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
    statusLine: e.statusLine,
    statusAt: e.statusAt,
    notes: e.notes,
    monthlyAmount: e.monthlyAmount,
    upfrontAmount: e.upfrontAmount,
    stripeSubscriptionStatus: e.stripeSubscriptionStatus,
    lastContactedAt: e.lastContactedAt,
    nextFollowUpAt: e.nextFollowUpAt,
    platformAccount: e.business
      ? {
          businessId: e.business.id,
          name: e.business.name,
          slug: e.business.slug,
          subscriptionStatus: e.business.subscriptionStatus,
          ownerEmail: e.business.ownerEmail,
          ownerPhone: e.business.ownerPhone,
          telnyxPhoneNumber: e.business.telnyxPhoneNumber,
          forwardingNumber: e.business.forwardingNumber,
          googleAdsCustomerId: e.business.googleAdsCustomerId,
        }
      : null,
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
    recentApprovals: approvals.map((a) => approvalView(a)),
  }
}

/** An approval as the chief sees it: who decided, through what, and when it applied. */
function approvalView(a: { title: string; status: string; error: string | null; detail: unknown; createdAt: Date; decidedAt: Date | null; appliedAt: Date | null }) {
  const d = (a.detail ?? {}) as Record<string, unknown>
  return {
    title: a.title,
    status: a.status,
    proposedAt: a.createdAt.toISOString(),
    decidedAt: a.decidedAt?.toISOString() ?? null,
    // Only Jacob can push or reject (the route is admin only); rows from before Oct 28 2026 did not record it.
    decidedBy: a.decidedAt ? (typeof d.decidedBy === 'string' ? d.decidedBy : 'jacob (not recorded, only Jacob can decide)') : null,
    decidedVia: typeof d.decidedVia === 'string' ? d.decidedVia : null,
    appliedAt: a.appliedAt?.toISOString() ?? null,
    error: a.error,
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
      name: 'create_client',
      description:
        "Put a new client on the board when Jacob says so (\"New client: Bryan, In and Out Property Care, ...\"). Creates the Ops client (source manual, stage onboarding unless told), its deliverables for the services, and with createBusiness the platform account too (no signup needed; the owner claims it later by signing up with the same email). Refuses a client whose name, email or Stripe customer is already on the board: then use that client instead.",
      input_schema: {
        type: 'object',
        properties: {
          displayName: { type: 'string', description: 'The business name, e.g. "In and Out Property Care".' },
          contactName: { type: 'string' },
          email: { type: 'string' },
          phone: { type: 'string' },
          trade: { type: 'string', description: 'e.g. property care, painting.' },
          location: { type: 'string', description: 'City, ST.' },
          services: { type: 'array', items: { type: 'string', enum: ['website', 'ads', 'missedcall', 'gbp'] } },
          stage: { type: 'string', description: 'Default onboarding.' },
          upfrontAmount: { type: 'number', description: 'Dollars paid upfront.' },
          upfrontPaidAt: { type: 'string', description: 'YYYY-MM-DD the upfront was paid.' },
          monthlyAmount: { type: 'number', description: 'Dollars a month once on a subscription.' },
          stripeCustomerId: { type: 'string', description: 'cus_ id when Jacob gives one; links and syncs Stripe.' },
          createBusiness: { type: 'boolean', description: 'Also create the platform account (needed for a website build, missed-call texting or an ads id).' },
          notes: { type: 'string', description: "Anything else Jacob said about the client, in his words." },
        },
        required: ['displayName', 'services'],
      },
      run: async (input) => {
        const body: Record<string, unknown> = {}
        for (const k of NEW_CLIENT_FIELDS) if (input[k] !== undefined) body[k] = typeof input[k] === 'string' ? noEmDash(input[k] as string) : input[k]
        if (typeof body.upfrontPaidAt === 'string') body.upfrontPaidAt = parseLocalDateTime(body.upfrontPaidAt, OPS_TIMEZONE)?.toISOString() ?? body.upfrontPaidAt
        try {
          const created = await createClient(parseNewClient(body), 'the chief')
          await ensureJob(ctx, [created.engagementId])
          return {
            result: created,
            label: `Created ${created.displayName}${created.business ? ` with platform account ${created.business.slug}` : ''}, ${created.deliverables.length} deliverable${created.deliverables.length === 1 ? '' : 's'}`,
          }
        } catch (err) {
          if (err instanceof BadRequest || err instanceof Conflict) throw new Error(err.message)
          throw err
        }
      },
    },
    {
      name: 'update_business',
      description: `Change a client's platform account (the Business row: get_client's platformAccount.businessId). Fields: ${BUSINESS_PATCH_FIELDS.join(', ')}. Validated exactly like the admin page. ${ROUTING_FIELDS.join(', ')} reroute live calls or texts, so they are NOT written: each becomes an approval waiting for Jacob's Push, and you tell him so. Everything else is written at once and logged on the client.`,
      input_schema: {
        type: 'object',
        properties: {
          businessId: { type: 'string' },
          fields: { type: 'object', description: 'Field name to new value, e.g. {"ownerPhone": "+17025551234", "forwardingNumber": "+17025551234"}.' },
          words: { type: 'string', description: "Jacob's words for this change, quoted on the client's log and the approval." },
        },
        required: ['businessId', 'fields', 'words'],
      },
      run: async (input) => {
        const fields = input.fields && typeof input.fields === 'object' && !Array.isArray(input.fields) ? (input.fields as Record<string, unknown>) : null
        if (!fields || !Object.keys(fields).length) throw new Error('fields is empty')
        const businessId = str(input.businessId)
        const eng = await db.engagement.findUnique({ where: { businessId }, select: { id: true } })
        const r = await updateBusiness({
          businessId,
          fields,
          words: noEmDash(str(input.words)),
          runId: ctx.runId,
          jobId: () => ensureJob(ctx, eng ? [eng.id] : []),
        })
        const parts = [
          r.written.length ? `wrote ${r.written.map((w) => w.field).join(', ')}` : null,
          r.waitingForPush.length ? `${r.waitingForPush.map((w) => w.field).join(', ')} waiting for Push` : null,
        ].filter(Boolean)
        return { result: r, label: `${r.business}: ${parts.join('; ') || 'nothing changed'}` }
      },
    },
    {
      name: 'get_needs_you',
      description:
        "What Jacob should do now, in rank order: the same list as the Needs you column on Home. Pending approvals, red alerts, deliverable steps waiting on Jacob (oldest first), follow-ups due, today's demo calls, yellow alerts; plus what waits on clients and vendors. Answer \"what should I do\" from this, in this order.",
      input_schema: { type: 'object', properties: {} },
      run: async () => {
        const [board, pending] = await Promise.all([
          getOpsBoard(),
          db.opsApproval.findMany({
            where: { status: 'pending' },
            include: { run: { select: { engagementId: true, engagement: { select: { displayName: true } } } } },
          }),
        ])
        const ranked = rankNeedsYou(
          board,
          pending.map((a) => ({
            id: a.id,
            title: a.title,
            agent: a.agent,
            status: a.status,
            client: a.run.engagement?.displayName.trim() ?? null,
            engagementId: a.run.engagementId,
            createdAt: a.createdAt.toISOString(),
          }))
        )
        return {
          result: {
            count: ranked.count,
            items: ranked.items.map((i) => ({ rank: i.rank, kind: i.kind, client: i.client, what: i.what, since: i.at, engagementId: i.engagementId, counts: i.counts })),
            waitingOnOthers: ranked.waitingOnOthers.map((w) => ({ client: w.client, waitingOn: w.waitingOn, what: w.what, since: w.at })),
          },
          label: `Read Needs you: ${ranked.count} item${ranked.count === 1 ? '' : 's'}`,
        }
      },
    },
    {
      name: 'get_timeline',
      description:
        'What happened, newest first: approvals (who pushed or rejected, when, when applied), jobs (Jacob\'s message and the report), agent runs, and activities (notes, contacts, status lines, decisions). Use it for "what did I approve this week", "what happened with X". At most 100 rows.',
      input_schema: {
        type: 'object',
        properties: {
          engagementId: { type: 'string', description: 'Only this client.' },
          days: { type: 'number', description: 'Only the last N days (default 7).' },
          kinds: { type: 'array', items: { type: 'string', enum: [...TIMELINE_KINDS] }, description: 'Only these kinds; all when omitted.' },
        },
      },
      run: async (input) => {
        const days = Math.min(365, Math.max(1, Number(input.days) || 7))
        const kinds = Array.isArray(input.kinds) ? (input.kinds as string[]).filter((k): k is TimelineKind => (TIMELINE_KINDS as readonly string[]).includes(k)) : []
        const { items } = await getTimeline({
          from: new Date(Date.now() - days * 86_400_000),
          engagementId: input.engagementId ? str(input.engagementId) : null,
          kinds,
          limit: 100,
        })
        const rows = items.map((i) => {
          if (i.type === 'approval') {
            return { type: i.type, at: i.at, client: i.client, title: i.title, status: i.status, decidedBy: i.decidedAt ? i.decidedBy ?? 'jacob (not recorded, only Jacob can decide)' : null, decidedVia: i.decidedVia, decidedAt: i.decidedAt, appliedAt: i.appliedAt, error: i.error }
          }
          if (i.type === 'job') return { type: i.type, at: i.at, status: i.status, prompt: i.prompt, report: i.report?.text ?? null }
          if (i.type === 'run') return { type: i.type, at: i.at, agent: i.agent, mode: i.mode, client: i.client, status: i.status, finishedAt: i.finishedAt, error: i.error }
          return { type: i.type, at: i.at, kind: i.kind, client: i.client, body: i.body }
        })
        return { result: { days, rows }, label: `Read the timeline: ${rows.length} row${rows.length === 1 ? '' : 's'}, last ${days} day${days === 1 ? '' : 's'}` }
      },
    },
    {
      name: 'set_client_amounts',
      description:
        'Record a client\'s monthly and/or upfront amount in dollars when Jacob tells you ("Josue is on $350 a month"). These feed Verified and Projected MRR. Writes the same fields the panel edits and logs the change on the client. Use clear to remove one.',
      input_schema: {
        type: 'object',
        properties: {
          engagementId: { type: 'string' },
          monthlyAmount: { type: 'number', description: 'Dollars a month.' },
          upfrontAmount: { type: 'number', description: 'Dollars, one time.' },
          clear: { type: 'array', items: { type: 'string', enum: ['monthlyAmount', 'upfrontAmount'] }, description: 'Amounts to remove.' },
        },
        required: ['engagementId'],
      },
      run: async (input) => {
        const engagementId = str(input.engagementId)
        const current = await db.engagement.findUnique({ where: { id: engagementId }, select: { displayName: true, monthlyAmount: true, upfrontAmount: true } })
        if (!current) throw new Error(`no client with id ${engagementId}`)
        const data: { monthlyAmount?: number | null; upfrontAmount?: number | null } = {}
        const clear = Array.isArray(input.clear) ? (input.clear as string[]) : []
        for (const key of ['monthlyAmount', 'upfrontAmount'] as const) {
          if (clear.includes(key)) data[key] = null
          else if (key in input) data[key] = nullableNumber(input[key], key)
        }
        if (!Object.keys(data).length) throw new Error('pass monthlyAmount, upfrontAmount or both')
        const dollars = (n: number | null | undefined) => (n == null ? 'none' : `$${n}`)
        const changes = [
          'monthlyAmount' in data ? `monthly ${dollars(current.monthlyAmount)} to ${dollars(data.monthlyAmount)}` : null,
          'upfrontAmount' in data ? `upfront ${dollars(current.upfrontAmount)} to ${dollars(data.upfrontAmount)}` : null,
        ].filter(Boolean)
        const name = current.displayName.trim()
        await db.$transaction([
          db.engagement.update({ where: { id: engagementId }, data }),
          db.opsActivity.create({ data: { engagementId, kind: 'system', body: `Amounts set by the chief: ${changes.join(', ')}` } }),
        ])
        return { result: { ok: true, client: name, ...data }, label: `Amounts for ${name}: ${changes.join(', ')}` }
      },
    },
    {
      name: 'log_update',
      description:
        "Record an update Jacob gave about a client, in his words, as an activity. Optionally move one deliverable to a new step (a key from that deliverable's steps in get_client), set the next follow-up date, and replace the client's status line.",
      input_schema: {
        type: 'object',
        properties: {
          engagementId: { type: 'string' },
          body: { type: 'string', description: 'What happened, short and plain.' },
          step: { type: 'object', description: '{ deliverableType, step } to move a deliverable.' },
          nextFollowUpAt: { type: 'string', description: 'Next follow-up in Detroit time: YYYY-MM-DD (means 9:00 am) or YYYY-MM-DDTHH:mm. No Z, no offset.' },
          statusLine: {
            type: 'string',
            description: "The client's current status in one sentence, as it stands after this update (e.g. \"Ads running at $16/day; waiting on the Google tag\"). Shown on the client's card. Pass it whenever the update changes where the client stands.",
          },
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
        const statusLine = input.statusLine ? noEmDash(str(input.statusLine)).slice(0, 300) : null
        let followUp: Date | null = null
        if (input.nextFollowUpAt) {
          // Detroit time; a date alone is 9:00 that morning (lib/ops/dates.ts).
          followUp = parseLocalDateTime(str(input.nextFollowUpAt), OPS_TIMEZONE)
          if (!followUp) throw new Error('nextFollowUpAt must be YYYY-MM-DD or YYYY-MM-DDTHH:mm (Detroit time)')
        }

        await db.$transaction(async (tx) => {
          await tx.opsActivity.create({ data: { engagementId, kind: 'note', body, followUpAt: followUp } })
          if (statusLine) await tx.opsActivity.create({ data: { engagementId, kind: 'status', body: statusLine } })
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
        if (followUp) parts.push(`follow-up ${detroitWhen(followUp)}`)
        if (statusLine) parts.push(`status: ${statusLine}`)
        return {
          result: { ok: true, client: name, step: stepChange && `${stepChange.type}: ${stepChange.key}`, followUp: followUp ? `${detroitWhen(followUp)} Detroit` : null, statusLine },
          label: parts.join(', '),
        }
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
