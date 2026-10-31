// ===========================================
// Ops HQ — the chief
// ===========================================
// Jacob's operations chief. Reads the board, records the updates he gives it,
// records standing decisions, hands work to specialists under a job, and
// writes the job report. Client tools only; every write is to an Ops table.
//
// Model: OPS_CHIEF_MODEL (default claude-opus-5-5), key ANTHROPIC_API_KEY_BUILDS.

import type { Prisma } from '@prisma/client'
import { readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import { db } from '@/lib/db'
import { OPS_TIMEZONE, getOpsBoard, type BoardEngagement } from '@/lib/ops/board'
import { STEP_CATALOG, defaultWaitingOn, stepFor } from '@/lib/ops/steps'
import { DELIVERABLE_TYPES } from '@/lib/ops/types'
import { bucketClients } from '@/lib/ops/triage'
import { TIMELINE_KINDS, getTimeline, type TimelineKind } from '@/lib/ops/timeline'
import { nullableNumber } from '@/lib/ops/validate'
import { parseLocalDateTime } from '@/lib/ops/dates'
import { CLIENT_UPDATE_FIELDS, Conflict, NEW_CLIENT_FIELDS, addPlatformAccount, createClient, parseNewClient, updateClient } from '@/lib/ops/clients'
import { BUSINESS_PATCH_FIELDS } from '@/lib/admin-business-patch'
import { BadRequest } from '@/lib/ops/validate'
import { ROUTING_FIELDS, updateBusiness } from './admin-change'
import { WEB_TASK_KINDS, briefTemplate, startWebTask, type WebTaskKind } from './web'
import { INTAKE_KEYS, intakeSummary, readIntake, withAssetSections } from '@/lib/ops/intake'
import { loadIntake, patchIntake } from '@/lib/ops/intake-server'
import { BATCH_THRESHOLD, FILE_PHOTOS_TOOL, InvalidAttachments, inboxText, readAttachments } from '@/lib/ops/photo-filing'
import { fileAllPhotos, filePhotos } from '@/lib/ops/photo-filing-server'
import { listInbox } from './inbox'
import { withPhotos } from './photo-view'
import { activePhotoRun, runPhotoRun, startPhotoRun } from './photo'

/** "Tue Nov 3, 9:00 AM" in Detroit, for feed lines and results. */
const detroitWhen = (d: Date) =>
  d.toLocaleString('en-US', { timeZone: OPS_TIMEZONE, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
import { waitUntil } from '@vercel/functions'
import { AdsOffline, adsClients, runAdsTask, startAdsRun } from './ads'
import { type ApiMessage, type Block, CHIEF_MODEL_DEFAULT } from './anthropic'
import { DECISION_PREFIX, decisionsByEngagement } from './decisions'
import { noEmDash, oneLine } from './events'
import { type ClientTool, runAgentLoop } from './loop'
import { adsAccountUrl } from './links'
import { createRun, failRun, finishRun } from './runs'
import { onSpecialistRunEnded } from './jobs'
import { loadGateClients } from '@/lib/ops/gate-data'
import { lookupGbp } from '@/lib/ops/gbp-server'
import { questionsFrom } from '@/lib/ops/build-style'
import { reportGaps, type GateClient } from '@/lib/ops/launch-gate'

const HISTORY_MESSAGES = 40

const chiefModel = () => process.env.OPS_CHIEF_MODEL?.trim() || CHIEF_MODEL_DEFAULT

const SYSTEM = `You are the operations chief for Align and Acquire, Jacob's agency. Jacob builds websites, runs Google Ads and sets up missed-call texting for local service businesses. You run the client delivery board with him.

How you talk: short and plain. No preamble, no filler, no em dashes. Name clients by name. Give numbers and dates. When there is a list, use a list.

What you do:
- Look before you answer. Read the board with get_board, or one client in full with get_client. Never answer about a client from memory.
- Record what Jacob tells you ("Cole approved the site", "Ronny's budget is $500") with log_update, in his words. When the update moves a deliverable, pass the step, using a step key from that client's step list in get_client. When it changes where the client stands, pass statusLine: one sentence, the client's status now.
- Record standing decisions ("keep X off", "don't raise Y") with record_decision. Specialists read them and must follow them.
- Jacob reports what he did in plain language ("talked to Cole, he wants Friday", "Josue is on $350 from December"). Your job is to record it: log_update (with the step and statusLine when they change), record_decision for standing rules, set_client_amounts for money. Then reflect it back in one line: what you recorded, on whom.
- "What should I do" is answered from get_needs_you: the Today clients in their order, then Get done, never from memory. Count clients, not items. "What did I approve", "what happened with X" is answered from get_timeline; it says who pushed each approval and when it applied.
- New clients: when Jacob names one ("New client: ..."), create it with create_client (createBusiness when the client gets a website, ads or missed-call texting), then say in one line what was created. Platform account changes go through update_business; routing fields wait for Push.
- Website clients: the site builds from a brief, and the brief is written from the client's intake (get_client's intake: answers, files, old site, and summary.missing). Photos and the logo are added on the intake page (/admin/ops/intake/<id>) or dropped in this chat (see Photos in chat); the old site is set on the intake page. When a website client has no brief: read the intake, then ask Jacob in ONE grouped message only for what is still empty of what get_brief_template needs. Save his answers with save_intake. Then write the whole brief in the template's shape (unknowns under UNKNOWN, never invented, businessSlug from the platform account; set_brief adds the Assets and Old site sections) and show it back in one message; store it with set_brief only after he says it looks good or gives edits.
- Client answers by number: Jacob texts every client the onboarding questionnaire (read_doc onboarding-questionnaire.md). When he pastes answers like "1. Yualex Painting 2 LLC 2. Painting, drywall...", read it, map each answer to its intake field with save_intake (one call, everything), and do the platform side the table names: the phone and email on the platform account with update_business (the phone that rings is the owner phone; routing numbers wait for Push), the ads budget and account email in intake.ads. Then say in a few lines what you saved and which of 1 to 14 and 17 to 19 are still missing.
- Google profile: after save_intake (or when you read a website client's intake) and hours, address, reviews or photos are still empty, run lookup_gbp on your own and tell Jacob in one line what it found. When it returns candidates instead of a match, ask Jacob which one is the client; never pick one yourself. If it says the lookup is offline, say so once.
- Every brief follows docs/ops/site-brief-standards.md (get_brief_template returns it with the template): services named and split the way customers search, no published job ranges, no claims the client did not make, hours and towns as the rules say, no invented tagline, about story or reviews, display name without LLC or numbering. List what you applied under "## Standards applied" at the end of the brief body; when the client's answers override a standard, the client wins and you say so there. The same file's section 9 is how the answers become the ads spec.
- A build needs real photos: with none on file and no old site set to verbatim, site_build is refused. Tell Jacob to add photos at the intake page, or build with stock only if he says so (withStock).
- Website work: start_web_task. A branch name, preview URL or PR comes from the run's recorded result (get_client, the job report, review), never from the agent's BUILD-REPORT text, which can name a branch that was never pushed. "Build X's site": site_build (it provisions first if needed). After a build reports back: review, which posts the preview and PR. "Merge it" / "take it live" / "connect example.com": merge, go_live, connect_domain, each waiting for Push. Never claim a site is built, merged or live before its run or Push says so.
- Domains: a client with no domain (intake domain.current empty, domain.wanted set) or "buy example.com for X": offer buy_domain, which checks availability and price and waits for Push. A domain the client owns: connect_domain, then give Jacob the one registrar instruction it returns, word for word. Google Workspace mail on a domain on Vercel DNS: set_email_records.
- Tracking: "install tracking on X": install_tracking. It needs the ads account's AW- id and conversion labels on the ads deliverable; if they are missing, start the ads specialist with "read the conversion labels" first.
- Go-live and enable gates: go_live is refused while the Google tag, the domain, the approval or the owner's email and phone for lead alerts are undone, and the refusal names each one; repeat it to Jacob as given. Only Jacob's own words "skip <item>" (or "go live on vercel.app") waive one; never add them yourself. Enable proposals carry their unmet list on the card.
- Hand off work Jacob asks for: start_ads_task for Google Ads work, start_web_task for a change to a client's website. Each one starts a specialist run under the current job. Write instructions a specialist can act on without asking back: the client, the goal, the limits, and Jacob's decisions.
- When Jacob points at a spec under docs/ads-specs/, read it with read_spec and pass its full text in the start_ads_task instructions, after one line with Jacob's own instructions (e.g. "Build it paused and queue the enable for my approval."). Do not shorten the spec.
- Photos in chat: when Jacob drops photos in this chat you see them, listed with their url and filename. File them with file_photos, and only that way. First know whose they are: from his message, or from what he says next about the same photos. If he did not say, ask "Who are these for?" and wait; you may say what the photos show, but do not suggest whose they might be. Never guess, and never choose between two clients that could fit: ask. If he names a client you cannot find on the board, say so and ask. Read get_client first for the client's services. Caption each one from what you see: what is in the frame and which service it shows; never a town, street, customer or job you were not told. Set service only when it plainly matches one of the client's services, otherwise leave it out. At most one heroCandidate per call, the strongest wide shot. beforeAfter only for an obvious pair. kind logo only for the business logo. Filing photos is the whole job: never write, change or offer a brief because of them. Then say in one line what you filed on whom and what you are unsure about ("the two kitchen shots could be either service, I left service blank").
- Photo batches: a message with more than ${BATCH_THRESHOLD} photos shows you only a count and the first ${BATCH_THRESHOLD}; the Photo desk captions all of them in the background (it starts on its own) and you are told when it finishes. Do not caption a batch yourself and do not file it before then: say in one line that the photos are being captioned, and ask "Who are these for?" if he did not say. Once captions are in, file the batch with file_photos all: true (scope with messageIds when list_inbox shows drops for more than one client). list_inbox shows every unfiled photo with its caption, counts per drop, and photos uploaded but never sent. caption_photos captions any unfiled photos that have no caption yet (for example the unsent ones). After filing a batch, say in one line how many you filed on whom, which one is the hero, and what stayed blank or unfiled.
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
  const [activities, runs, decisions, approvals, intakeRow] = await Promise.all([
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
    db.engagement.findUnique({ where: { id: engagementId }, select: { intake: true } }),
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
    monthlyStartedAt: e.monthlyStartedAt,
    upfrontAmount: e.upfrontAmount,
    upfrontPaidAt: e.upfrontPaidAt,
    stripeSubscriptionStatus: e.stripeSubscriptionStatus,
    lastContactedAt: e.lastContactedAt,
    nextFollowUpAt: e.nextFollowUpAt,
    brief: e.brief,
    intake: intakeForChief(intakeRow?.intake),
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

/** The intake as the chief sees it: every answer, the files as captions and tags (no URLs), and what is still empty. */
function intakeForChief(raw: unknown) {
  const i = readIntake(raw)
  const { assets, ...answers } = i
  return {
    ...answers,
    files: (assets ?? []).map((a) => ({ kind: a.kind, filename: a.filename, caption: a.caption ?? null, heroCandidate: Boolean(a.heroCandidate), service: a.service ?? null, beforeAfter: a.beforeAfter ?? null })),
    summary: intakeSummary(i),
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
const DOCS_DIR = path.join(process.cwd(), 'docs', 'ops')

/** A .md file under one folder and nothing else (no other folder, no link out of it). */
async function readMarkdownIn(dir: string, label: string, input: string): Promise<{ rel: string; text: string }> {
  const cleaned = input.replace(/^\.?\//, '')
  if (!cleaned) throw new Error('path is empty')
  const full = path.resolve(cleaned.includes('/') ? process.cwd() : dir, cleaned)
  const inside = (p: string, d: string) => p.startsWith(d + path.sep)
  const refuse = `reads only .md files under ${label}`
  if (!inside(full, dir) || !full.endsWith('.md')) throw new Error(refuse)
  let real: string
  try {
    real = await realpath(full)
  } catch {
    throw new Error(`no file at ${label}${path.basename(full)}`)
  }
  if (!inside(real, await realpath(dir))) throw new Error(refuse)
  const text = await readFile(real, 'utf8')
  if (text.length > 100_000) throw new Error('that file is over 100,000 characters')
  return { rel: path.relative(process.cwd(), full), text }
}

const readSpec = (input: string) => readMarkdownIn(SPEC_DIR, 'docs/ads-specs/', input)
const readDoc = (input: string) => readMarkdownIn(DOCS_DIR, 'docs/ops/', input)

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
      name: 'update_client',
      description:
        "Change a client's own fields when Jacob says so: displayName, contactName, email, phone, trade, location, services (website, ads, missedcall, gbp; adding one creates its deliverables, removing one deletes nothing), stage. Logged on the client with Jacob's words. Money goes through set_client_amounts, the platform account through update_business.",
      input_schema: {
        type: 'object',
        properties: {
          engagementId: { type: 'string' },
          fields: { type: 'object', description: `Any of ${CLIENT_UPDATE_FIELDS.join(', ')}. services is the whole new list.` },
          words: { type: 'string', description: "Jacob's words for the change." },
        },
        required: ['engagementId', 'fields', 'words'],
      },
      run: async (input) => {
        const fields = input.fields && typeof input.fields === 'object' && !Array.isArray(input.fields) ? (input.fields as Record<string, unknown>) : {}
        try {
          const r = await updateClient(str(input.engagementId), fields, noEmDash(str(input.words)))
          return { result: r, label: `Updated ${r.client}: ${r.changed.join(', ')}${r.deliverablesCreated.length ? `; new deliverables ${r.deliverablesCreated.join(', ')}` : ''}` }
        } catch (err) {
          if (err instanceof BadRequest || err instanceof Conflict) throw new Error(err.message)
          throw err
        }
      },
    },
    {
      name: 'add_platform_account',
      description:
        'Create the platform account (Business) for a client on the board that has none, and link it. Needed before a site build, missed-call texting or an ads id. Missed-call texting stays off unless the client has the missedcall service. The owner claims it by signing up with the client email.',
      input_schema: { type: 'object', properties: { engagementId: { type: 'string' } }, required: ['engagementId'] },
      run: async (input) => {
        try {
          const b = await addPlatformAccount(str(input.engagementId))
          return { result: { ok: true, business: b }, label: `Platform account ${b.slug} created and linked` }
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
        "What Jacob should do, as Home shows it: every client in one bucket. today (urgent: approvals waiting for Push, past due, leads going nowhere while something is live, follow-ups due), getDone (steps on Jacob, onboarding not started, no subscription, Stripe unlinked), waitingOnClient, live; each with its reasons, oldest first. sales: prospect follow-ups and demo calls today. Answer \"what should I do\" from today, in its order, then getDone.",
      input_schema: { type: 'object', properties: {} },
      run: async () => {
        const [board, pending] = await Promise.all([
          getOpsBoard(),
          db.opsApproval.findMany({
            where: { status: 'pending' },
            select: { id: true, title: true, status: true, detail: true, createdAt: true, run: { select: { engagementId: true } } },
          }),
        ])
        const t = bucketClients(
          board,
          pending.map((a) => {
            const d = (a.detail ?? {}) as Record<string, unknown>
            return { id: a.id, title: a.title, status: a.status, engagementId: a.run.engagementId ?? (typeof d.engagementId === 'string' ? d.engagementId : null), createdAt: a.createdAt.toISOString() }
          }),
          new Date()
        )
        const view = (list: typeof t.today) => list.map((e) => ({ client: e.name, engagementId: e.engagementId, reasons: e.reasons.map((r) => r.text) }))
        return {
          result: {
            counts: { today: t.today.length, getDone: t.getDone.length, waitingOnClient: t.waitingOnClient.length, live: t.live.length, churned: t.churnedCount },
            today: view(t.today),
            getDone: view(t.getDone),
            waitingOnClient: view(t.waitingOnClient),
            live: t.live.map((e) => e.name),
            sales: {
              prospectFollowUps: t.sales.prospectFollowUps.map((p) => ({ name: p.name, dueAt: p.dueAt })),
              demoCallsToday: t.sales.demoCallsToday.map((b) => ({ name: b.customerName, at: b.scheduledAt, showStatus: b.showStatus })),
            },
          },
          label: `Read Home: ${t.today.length} today, ${t.getDone.length} to get done, ${t.waitingOnClient.length} waiting on clients, ${t.live.length} live`,
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
          step: {
            type: 'object',
            description:
              "{ deliverableType, step?, waitingNote? }. step moves the deliverable (a key from get_client's steps) and clears its old waiting note unless you pass a new one. waitingNote alone replaces the note on the current step (\"\" clears it). Keep the note current: it is what the board shows under the step.",
          },
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

        let stepChange: { deliverableId: string; type: string; key: string | null; note: string | null | undefined } | null = null
        if (input.step) {
          const s = input.step as Record<string, unknown>
          const type = str(s.deliverableType)
          const key = str(s.step) || null
          // undefined: leave the note (only when the step does not move); '' or text: set it.
          const note = typeof s.waitingNote === 'string' ? noEmDash(s.waitingNote.trim()).slice(0, 500) || null : undefined
          if (!(DELIVERABLE_TYPES as readonly string[]).includes(type)) throw new Error(`deliverableType must be one of ${DELIVERABLE_TYPES.join(', ')}`)
          if (!key && note === undefined) throw new Error('step needs a step key, a waitingNote, or both')
          if (key && !stepFor(type, key)) {
            const valid = (STEP_CATALOG[type as keyof typeof STEP_CATALOG] ?? []).map((st) => st.key)
            throw new Error(`step "${key}" is not a ${type} step. Valid: ${valid.join(', ')}`)
          }
          const d = await db.deliverable.findUnique({ where: { engagementId_type: { engagementId, type } }, select: { id: true } })
          if (!d) throw new Error(`${name} has no ${type} deliverable`)
          stepChange = { deliverableId: d.id, type, key, note }
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
              data: stepChange.key
                ? // A new step starts with a new note: the old one described the old step.
                  { step: stepChange.key, stepUpdatedAt: new Date(), waitingOn: defaultWaitingOn(stepChange.type, stepChange.key), waitingNote: stepChange.note ?? null }
                : { waitingNote: stepChange.note ?? null },
            })
          }
        })
        const parts = [`Logged on ${name}`]
        if (stepChange?.key) parts.push(`${stepChange.type} step to ${stepChange.key}`)
        if (stepChange && stepChange.note !== undefined) parts.push(stepChange.note ? `${stepChange.type} note: ${stepChange.note}` : `${stepChange.type} note cleared`)
        if (followUp) parts.push(`follow-up ${detroitWhen(followUp)}`)
        if (statusLine) parts.push(`status: ${statusLine}`)
        return {
          result: { ok: true, client: name, step: stepChange && `${stepChange.type}: ${stepChange.key ?? '(unchanged)'}`, waitingNote: stepChange?.note, followUp: followUp ? `${detroitWhen(followUp)} Detroit` : null, statusLine },
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
      name: 'read_doc',
      description:
        'Read one of the ops reference docs in docs/ops/. onboarding-questionnaire.md is the numbered text Jacob sends every client after payment (questions 1 to 28) with the table of which intake field each answer goes to: read it whenever Jacob pastes a client\'s numbered answers.',
      input_schema: { type: 'object', properties: { path: { type: 'string', description: 'e.g. "onboarding-questionnaire.md"' } }, required: ['path'] },
      run: async (input) => {
        const { rel, text } = await readDoc(str(input.path))
        return { result: { path: rel, text }, label: `Read ${rel}` }
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
      name: 'get_brief_template',
      description:
        "Everything a site brief is written from, in one read: AA-Template's BRIEF.template.md (the shape) and docs/ops/site-brief-standards.md (Jacob's standing rules for services, prices, claims, hours, service area, copy, photos and platform). Read it before asking Jacob for a brief or writing one; apply every standard unless the client's answers say otherwise.",
      input_schema: { type: 'object', properties: {} },
      run: async () => {
        const [template, standards] = await Promise.all([briefTemplate(), readDoc('site-brief-standards.md')])
        return { result: { template, standards: standards.text }, label: 'Read the brief template and the site brief standards' }
      },
    },
    {
      ...FILE_PHOTOS_TOOL,
      input_schema: FILE_PHOTOS_TOOL.input_schema as unknown as ClientTool['input_schema'],
      run: async (input) => {
        const engagementId = str(input.engagementId)
        const name = await engagementName(engagementId)
        const plural = (n: number) => `${n} photo${n === 1 ? '' : 's'}`
        try {
          if (input.all === true) {
            if (input.photos !== undefined && input.photos !== null) throw new Error('pass photos or all: true, not both')
            const ids = Array.isArray(input.messageIds) ? input.messageIds.map(String) : undefined
            const res = await fileAllPhotos(engagementId, ids)
            await ensureJob(ctx, [engagementId])
            // The full list of 50 is noise for the model: counts plus the first few.
            return {
              result: { ok: true, client: res.client, filed: res.filed.length, hero: res.hero, logo: res.filed.find((f) => f.kind === 'logo')?.filename ?? null, withService: res.filed.filter((f) => f.service).length, uncaptionedLeft: res.uncaptioned, extraLogosLeft: res.extraLogos, unmatchedServices: res.unmatchedServices, sample: res.filed.slice(0, 6) },
              label: `Filed ${plural(res.filed.length)} on ${name}${res.hero ? `, hero ${res.hero}` : ''}`,
            }
          }
          const photos = JSON.parse(noEmDash(JSON.stringify(input.photos ?? null)))
          const res = await filePhotos(engagementId, photos)
          await ensureJob(ctx, [engagementId])
          return { result: { ok: true, client: res.client, filed: res.filed }, label: `Filed ${plural(res.filed.length)} on ${name}` }
        } catch (err) {
          if (err instanceof InvalidAttachments) throw new Error(err.message)
          throw err
        }
      },
    },
    {
      name: 'list_inbox',
      description: 'Every unfiled photo dropped in this chat, as text (never images): counts (captioned, not captioned, unsent), each drop with its messageId, and the first limit photos with the Photo desk\'s caption, suggested service, hero score and flags. Unsent photos were uploaded but the message never went out.',
      input_schema: { type: 'object', properties: { limit: { type: 'number', description: 'How many photos to list (default 20, at most 200).' } } },
      run: async (input) => {
        const limit = Math.min(200, Math.max(0, Math.round(typeof input.limit === 'number' ? input.limit : 20)))
        const [entries, running] = await Promise.all([listInbox(), activePhotoRun()])
        const { text, counts } = inboxText(entries, limit, running)
        return { result: { counts, text }, label: `Inbox: ${counts.unfiled} unfiled, ${counts.captioned} captioned` }
      },
    },
    {
      name: 'caption_photos',
      description: 'Start the Photo desk on unfiled photos that have no caption yet: every one, or only urls / the photos on messageId. It views them and stores a caption, suggested service, hero score, before/after, logo and face-or-plate on each; you are told when it finishes, then file with file_photos all: true. Refused while another photo run is captioning.',
      input_schema: {
        type: 'object',
        properties: {
          urls: { type: 'array', items: { type: 'string' }, description: 'Optional: just these photo urls.' },
          messageId: { type: 'string', description: 'Optional: just the photos on this message (from list_inbox).' },
        },
      },
      run: async (input) => {
        let urls = Array.isArray(input.urls) ? input.urls.map(String) : undefined
        if (input.messageId) {
          const onMessage = (await listInbox()).filter((e) => e.messageId === str(input.messageId)).map((e) => e.url)
          if (!onMessage.length) throw new Error('no unfiled photos on that message')
          urls = urls ? urls.filter((u) => onMessage.includes(u)) : onMessage
        }
        const jobId = await ensureJob(ctx, [])
        const { run, count } = await startPhotoRun({ jobId, urls })
        waitUntil(runPhotoRun(run.id))
        return { result: { started: true, photos: count }, label: `Started the Photo desk on ${count} photo${count === 1 ? '' : 's'}` }
      },
    },
    {
      name: 'save_intake',
      description: `Save what Jacob tells you about a client's site into the client's intake (the same record the intake page edits), so it lives in one place. Keys: ${INTAKE_KEYS.filter((k) => k !== 'assets').join(', ')}. Objects merge one level deep (business, reviews, oldSite, socials, style, domain); lists replace whole (services, differentiators, serviceArea). Files are added only on the intake page, never here.`,
      input_schema: {
        type: 'object',
        properties: {
          engagementId: { type: 'string' },
          intake: {
            type: 'object',
            description:
              'e.g. {"business": {"phone": "+16125551234", "serviceArea": ["Rochester, MN", "Byron"]}, "services": [{"name": "Gutter cleaning", "description": "..."}], "about": "...", "oldSite": {"url": "https://...", "use": "facts_only"}}',
          },
        },
        required: ['engagementId', 'intake'],
      },
      run: async (input) => {
        const engagementId = str(input.engagementId)
        const raw = input.intake && typeof input.intake === 'object' && !Array.isArray(input.intake) ? (input.intake as Record<string, unknown>) : null
        if (!raw) throw new Error('intake must be an object')
        const unknown = Object.keys(raw).filter((k) => !(INTAKE_KEYS as readonly string[]).includes(k) || k === 'assets')
        if (unknown.length) throw new Error(`not intake keys: ${unknown.join(', ')}`)
        const clean = JSON.parse(noEmDash(JSON.stringify(raw)))
        const next = await patchIntake(engagementId, clean)
        await ensureJob(ctx, [engagementId])
        const sum = intakeSummary(next)
        return { result: { ok: true, saved: Object.keys(raw), stillMissing: sum.missing }, label: `Saved intake (${Object.keys(raw).join(', ')}) for ${await engagementName(engagementId)}` }
      },
    },
    {
      name: 'set_brief',
      description:
        "Store a client's site brief: the full BRIEF.template.md filled from what Jacob or the client actually said, with the site brief standards applied (businessSlug from get_client's platformAccount.slug; unknowns listed under UNKNOWN, never invented; launch.indexable stays false), ending with a '## Standards applied' section of three to eight lines. Only after Jacob has seen it and said it looks good. Answers Jacob gave in chat go in intake as well. The brief's Assets and Old site sections are written for you from the intake. Moves the website step from brief (or none) to build.",
      input_schema: {
        type: 'object',
        properties: {
          engagementId: { type: 'string' },
          brief: { type: 'string', description: 'The whole brief, markdown, in the template shape.' },
          intake: { type: 'object', description: 'Answers Jacob gave in chat that are not in the intake yet, in save_intake shape; saved to the intake too.' },
        },
        required: ['engagementId', 'brief'],
      },
      run: async (input) => {
        const engagementId = str(input.engagementId)
        const brief = noEmDash(str(input.brief))
        if (brief.length < 200) throw new Error('the brief is too short to build from; fill the template')
        // Site brief standards, rule 10: what came from the standards, not the client, is listed for Jacob.
        if (!/^#{1,3}\s*Standards applied\s*$/im.test(brief)) {
          throw new Error('the brief needs a "## Standards applied" section (docs/ops/site-brief-standards.md, rule 10): three to eight lines naming each standard you applied and any place the client\'s answers overrode one')
        }
        if (/indexable[^\n]*\btrue\b/i.test(brief)) throw new Error('launch.indexable must stay false in a brief; go_live flips it later')
        const e = await db.engagement.findUnique({
          where: { id: engagementId },
          select: { displayName: true, business: { select: { slug: true } }, deliverables: { where: { type: 'website' }, select: { id: true, step: true } } },
        })
        if (!e) throw new Error(`no client with id ${engagementId}`)
        if (e.business?.slug && !brief.includes(e.business.slug)) throw new Error(`the brief must carry businessSlug ${e.business.slug} exactly`)
        // Answers given here go into the intake too, so nothing lives in two places.
        if (input.intake && typeof input.intake === 'object' && !Array.isArray(input.intake)) {
          const raw = input.intake as Record<string, unknown>
          const allowed = Object.fromEntries(Object.entries(raw).filter(([k]) => (INTAKE_KEYS as readonly string[]).includes(k) && k !== 'assets'))
          if (Object.keys(allowed).length) await patchIntake(engagementId, allowed)
        }
        // The brief ends with this client's own files and old site, written from the intake.
        const stored = await loadIntake(engagementId)
        const full = withAssetSections(brief, stored?.intake ?? {})
        const site = e.deliverables[0]
        await db.$transaction(async (tx) => {
          await tx.engagement.update({ where: { id: engagementId }, data: { brief: full } })
          await tx.opsActivity.create({ data: { engagementId, kind: 'note', body: `Site brief saved (${brief.length} characters). Ready to build.` } })
          if (site && (!site.step || site.step === 'brief')) {
            await tx.deliverable.update({ where: { id: site.id }, data: { step: 'build', stepUpdatedAt: new Date(), waitingOn: defaultWaitingOn('website', 'build'), waitingNote: 'Brief saved; ready to build' } })
          }
        })
        await ensureJob(ctx, [engagementId])
        const sum = intakeSummary(stored?.intake ?? {})
        return {
          result: { ok: true, client: e.displayName.trim(), chars: full.length, photos: sum.photos, logo: sum.logo, oldSite: sum.oldSite },
          label: `Saved the brief for ${e.displayName.trim()} (${sum.photos} photo${sum.photos === 1 ? '' : 's'}${sum.logo ? ', logo' : ''})`,
        }
      },
    },
    {
      name: 'start_web_task',
      description: [
        "The web specialist on a client's site (repo from AA-Template, built by the aa-build workflow). kind:",
        'provision: repo, secrets and Vercel project (needs a platform account).',
        'site_build: build the site from the stored brief (provisions first when there is no repo yet).',
        'site_update: a scoped change from instructions.',
        'review: after a build calls back, post the preview and PR and set the website step to send_preview.',
        'merge: queue the PR merge for Push.',
        'go_live: queue making the site indexable for Push.',
        'connect_domain: queue adding a domain the client owns to Vercel for Push (domain; dnsHeldBy client or jacob); returns the one instruction for the registrar.',
        'buy_domain: queue buying the domain on Vercel for Push (domain); returns the price.',
        'set_email_records: queue Google Workspace MX, SPF and DMARC on a domain on Vercel DNS for Push.',
        'install_tracking: queue installing the Google tag (from the ads account\'s labels) for Push.',
        'go_live is refused with the list of givens still undone unless Jacob\'s message skips them.',
        'provision, site_build and site_update start at once; the rest wait for Jacob\'s Push. A build reports back in a few minutes; do not say it is done before the report.',
      ].join(' '),
      input_schema: {
        type: 'object',
        properties: {
          engagementId: { type: 'string' },
          kind: { type: 'string', enum: [...WEB_TASK_KINDS] },
          instructions: { type: 'string', description: 'site_update: the exact change, written for the site agent.' },
          domain: { type: 'string', description: 'connect_domain, buy_domain, set_email_records: e.g. example.com' },
          dnsHeldBy: { type: 'string', enum: ['client', 'jacob'], description: 'connect_domain: who adds the DNS records. Default client.' },
          withStock: { type: 'boolean', description: 'site_build only: true only when Jacob said to build with stock photos. Without photos on file (and no old site to copy) the build is refused otherwise.' },
        },
        required: ['engagementId', 'kind'],
      },
      run: async (input) => {
        const engagementId = str(input.engagementId)
        const r = await startWebTask({
          engagementId,
          kind: str(input.kind) as WebTaskKind,
          instructions: input.instructions ? noEmDash(str(input.instructions)) : undefined,
          domain: input.domain ? str(input.domain) : undefined,
          dnsHeldBy: input.dnsHeldBy === 'jacob' ? 'jacob' : 'client',
          withStock: input.withStock === true,
          said: ctx.prompt,
          runId: ctx.runId,
          jobId: () => ensureJob(ctx, [engagementId]),
        })
        return { result: r, label: `Web ${str(input.kind)} for ${await engagementName(engagementId)}: ${r.done}` }
      },
    },
    {
      name: 'lookup_gbp',
      description:
        "Read the client's Google Business Profile (Places API) by business name and city: address, phone, website, hours, rating and review count, reviews with text, and up to 12 photos the business posted itself. On a name match it saves them into the intake (intake.gbp, photos as kind gbp) so the build gets them as GBP.json. When no result matches by name it returns the candidates and saves nothing. name, city and state override what the intake has.",
      input_schema: {
        type: 'object',
        properties: {
          engagementId: { type: 'string' },
          name: { type: 'string', description: 'Optional: the business name as customers see it.' },
          city: { type: 'string', description: 'Optional: the city, e.g. Ogden.' },
          state: { type: 'string', description: 'Optional: two-letter state, e.g. UT.' },
        },
        required: ['engagementId'],
      },
      run: async (input) => {
        const engagementId = str(input.engagementId)
        const r = await lookupGbp(engagementId, {
          dry: false,
          name: input.name ? str(input.name) : undefined,
          city: input.city ? str(input.city) : undefined,
          state: input.state ? str(input.state) : undefined,
        })
        await ensureJob(ctx, [engagementId])
        return { result: r, label: noEmDash(r.line) }
      },
    },
    {
      name: 'install_tracking',
      description:
        "Install the Google tag on a client's site: the ads account's AW- id plus the form and click-to-call conversion labels (from the ads deliverable) go into site.config.ts by a site_update that changes nothing else. Waits for Jacob's Push. Fails with what is missing when the labels have not been read yet.",
      input_schema: { type: 'object', properties: { engagementId: { type: 'string' } }, required: ['engagementId'] },
      run: async (input) => {
        const engagementId = str(input.engagementId)
        const r = await startWebTask({ engagementId, kind: 'install_tracking', said: ctx.prompt, runId: ctx.runId, jobId: () => ensureJob(ctx, [engagementId]) })
        return { result: r, label: `Google tag for ${await engagementName(engagementId)}: ${r.done}` }
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
            description: 'One per specialist run: { agent, client, did, expect, links: [{ label, url }], waitingForPush, questions }. questions: the build\'s open questions for Jacob to ask the client, word for word.',
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
    select: { role: true, body: true, attachments: true, createdAt: true },
  })
  const ordered = rows.reverse()
  while (ordered.length && ordered[0].role !== 'jacob') ordered.shift()
  // Photos are shown newest first, up to MAX_HISTORY_IMAGES across the history.
  let images = 0
  const content = ordered
    .slice()
    .reverse()
    .map((m) => (m.role === 'jacob' && m.attachments ? withPhotos(m.body, readAttachments(m.attachments), m.createdAt, () => images++ < MAX_HISTORY_IMAGES) : m.body))
    .reverse()
  return mergeTurns(ordered.map((m, n) => ({ role: m.role === 'jacob' ? ('user' as const) : ('assistant' as const), content: content[n] })))
}

/** Two messages in a row from one side (photos adopted from an unsent drop, a wake-up note) become one turn. */
function mergeTurns(list: ApiMessage[]): ApiMessage[] {
  const blocks = (c: string | Block[]): Block[] => (typeof c === 'string' ? (c ? [{ type: 'text', text: c }] : []) : c)
  const out: ApiMessage[] = []
  for (const m of list) {
    const last = out[out.length - 1]
    if (last && last.role === m.role) last.content = [...blocks(last.content), ...blocks(m.content)]
    else out.push({ ...m })
  }
  return out
}

const MAX_HISTORY_IMAGES = 30

function today(): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: OPS_TIMEZONE, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(new Date())
}

/** Create the chief's run for one of Jacob's messages. The route then runs it with waitUntil. */
export async function startChiefRun(messageId: string, prompt: string, jobId: string | null = null) {
  return createRun({ agent: 'chief', kind: 'chief', mode: 'work', engagementId: null, jobId, input: { messageId, prompt } })
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
  // Specialists this turn started may all have finished while it was still
  // talking; the report waits for the turn, so check once it has ended.
  if (ctx.jobId) await onSpecialistRunEnded(ctx.jobId).catch((err) => console.error('[hq] job report failed:', err instanceof Error ? err.message : err))
}

// ── After a photo run ───────────────────────────────────────────────────────

/**
 * A photo run in this job ended: wake the chief once, with the chat and a note
 * of what was captioned, to file the batch (when Jacob has said whose) or ask
 * whose they are. Only the photo tools and the board reads.
 */
export async function runChiefAfterPhotos(jobId: string) {
  const job = await db.opsJob.findUniqueOrThrow({ where: { id: jobId }, select: { prompt: true } })
  const runs = await db.agentRun.findMany({ where: { jobId, agent: 'photo' }, orderBy: { createdAt: 'asc' }, select: { status: true, error: true, output: true } })
  const run = await createRun({ agent: 'chief', kind: 'chief', mode: 'work', engagementId: null, jobId, input: { afterPhotos: true, jobId } })
  const ctx: ChiefContext = { runId: run.id, messageId: null, prompt: job.prompt, jobId }
  const lines = runs.map((r) => {
    const o = (r.output ?? {}) as { done?: number; total?: number; missed?: number }
    return r.status === 'succeeded' ? `captioned ${o.done ?? 0} of ${o.total ?? 0}${o.missed ? ` (${o.missed} got no usable caption)` : ''}` : `${r.status}${r.error ? `: ${r.error}` : ''} after ${o.done ?? 0} of ${o.total ?? 0}`
  })
  const note = `[Note from HQ, not from Jacob] The Photo desk finished: ${lines.join('; ')}. If Jacob has said whose these photos are, read get_client and file them now with file_photos all: true (scoped with messageIds when list_inbox shows drops for more than one client), then say in one line what you filed. If he has not, ask "Who are these for?" in one line and nothing else. Never guess the client.`
  try {
    const history = await chatHistory(null)
    const messages = mergeTurns([...history, { role: 'user', content: note }])
    const result = await runAgentLoop({
      runId: run.id,
      model: chiefModel(),
      system: `${SYSTEM}\n\nToday is ${today()} (${OPS_TIMEZONE}).`,
      messages,
      tools: chiefTools(ctx).filter((t) => ['get_board', 'get_client', 'list_inbox', 'file_photos'].includes(t.name)),
      effort: 'medium',
    })
    const reply = result.finalText || 'The photos are captioned.'
    await db.opsMessage.create({ data: { role: 'chief', body: reply, jobId } })
    await finishRun(run.id, { afterPhotos: true, reply: oneLine(reply, 500), turns: result.turns, jobId })
  } catch (err) {
    const message = await failRun(run.id, err)
    await db.opsMessage.create({ data: { role: 'chief', body: `The photos are captioned but I stopped before filing them: ${message}`, jobId } })
  }
}

// ── The job report ──────────────────────────────────────────────────────────


/** What each specialist run in a job did, for the report prompt and the fallback report. */
async function jobRuns(jobId: string) {
  const [runs, approvals] = await Promise.all([
    db.agentRun.findMany({
      where: { jobId, agent: { in: ['ads', 'web'] } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, agent: true, kind: true, mode: true, status: true, error: true, input: true, output: true, engagementId: true, engagement: { select: { displayName: true } } },
    }),
    db.opsApproval.findMany({ where: { jobId }, orderBy: { createdAt: 'asc' }, select: { runId: true, title: true, status: true, detail: true } }),
  ])
  // The givens still undone per client: every report names them, asked or not.
  const gates = await loadGateClients(runs.map((r) => r.engagementId ?? '')).catch(() => new Map<string, GateClient>())
  return runs.map((r) => {
    const out = (r.output ?? {}) as Record<string, unknown>
    const input = (r.input ?? {}) as Record<string, unknown>
    const customerId = typeof input.customerId === 'string' && input.customerId ? input.customerId : null
    const url = (v: unknown) => (typeof v === 'string' && /^https?:\/\//.test(v) ? v : null)
    // A web run's result: the workflow's callback (or the provision steps).
    const web =
      r.agent === 'web'
        ? {
            kind: r.kind,
            // The branch the workflow pushed, recorded from git; the agent's report may name a different one.
            branch: typeof out.branch === 'string' ? out.branch : null,
            prUrl: url(out.prUrl),
            previewUrl: url(out.previewUrl),
            verifyPassed: out.verifyPassed ?? null,
            failingChecks: Array.isArray(out.failingChecks) ? out.failingChecks : [],
            reportExcerpt: typeof out.reportExcerpt === 'string' ? out.reportExcerpt.slice(0, 1500) : null,
            // A failed run: the end of the agent's own result text, which says why.
            failureTail: typeof out.failureTail === 'string' ? out.failureTail : null,
            // What the build could not find out, for "Questions for you".
            clientTodo: typeof out.clientTodo === 'string' ? out.clientTodo : null,
            questions: questionsFrom(typeof out.clientTodo === 'string' ? out.clientTodo : null),
            mergeError: out.mergeError ?? null,
            nextStep:
              r.kind === 'provision'
                ? 'site_build once the brief is stored'
                : r.kind === 'go_live'
                  ? 'the web checks mark the site live once production is indexable'
                  : 'review the preview, send it to the client, then merge (Push)',
          }
        : null
    return {
      agent: r.agent,
      client: r.engagement?.displayName.trim() ?? null,
      mode: r.mode,
      kind: r.kind,
      status: r.status,
      error: r.error,
      report: out.report ?? null,
      web,
      notDone: r.engagementId && gates.has(r.engagementId) ? reportGaps(gates.get(r.engagementId)!) : [],
      links: [
        ...(customerId ? [{ label: 'Google Ads account', url: adsAccountUrl(customerId) }] : []),
        ...(web?.prUrl ? [{ label: 'Pull request', url: web.prUrl }] : []),
        ...(web?.previewUrl ? [{ label: 'Preview', url: web.previewUrl }] : []),
        ...(url(out.repoUrl) ? [{ label: 'Repo', url: url(out.repoUrl)! }] : []),
      ],
      approvals: approvals
        .filter((a) => a.runId === r.id)
        .map((a) => ({ title: a.title, status: a.status, monthlyCostChange: (a.detail as Record<string, unknown>)?.monthlyCostChange ?? null })),
    }
  })
}

type ReportSection = { agent: string; client: string | null; did: string[]; expect: string; links: { label: string; url: string }[]; waitingForPush: string[]; questions: string[] }

/** The report the chief failed to write, built from the runs themselves. */
function fallbackSections(runs: Awaited<ReturnType<typeof jobRuns>>): ReportSection[] {
  return runs.map((r) => {
    const rep = (r.report ?? {}) as { done?: { change?: string }[]; expected?: string }
    const w = r.web
    const webDid = w
      ? [
          `${w.kind} ${r.status}`,
          ...(w.verifyPassed === null ? [] : [w.verifyPassed ? 'Build gate passed' : `Build gate failed: ${(w.failingChecks as string[]).join(', ') || 'see the PR'}`]),
          ...(w.mergeError ? [`PR not merged: ${String(w.mergeError)}`] : []),
        ]
      : null
    const did =
      r.status !== 'succeeded'
        ? [`Run ${r.status}${r.error ? `: ${r.error}` : ''}`, ...(w?.failureTail ? [`Agent's last words:\n${w.failureTail}`] : [])]
        : webDid ?? (rep.done ?? []).map((d) => String(d.change ?? '')).filter(Boolean)
    return {
      agent: r.agent ?? 'ads',
      client: r.client,
      did: r.notDone.length ? [...did, `Not done: ${r.notDone.join('; ')}`] : did,
      expect: w ? `Next: ${w.nextStep}.` : String(rep.expected ?? ''),
      links: r.links,
      waitingForPush: r.approvals.filter((a) => a.status === 'pending').map((a) => a.title),
      questions: w ? (w.questions as string[]) : [],
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
    'Call finish_job once. sections: one per run, { agent, client, did: [what was done, one line each], expect: what to expect and when, links: [{ label, url }] (use the links given), waitingForPush: [titles of pending approvals], questions: [the web run\'s questions, one per item, word for word; [] when it has none] }. When a run\'s notDone is not empty, the last line of its did is "Not done: " followed by those items, word for word, even if nobody asked. Then reply to Jacob in two or three plain sentences: what is done and what waits for his Push, ending with the Not done items if there are any. No em dashes.',
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
