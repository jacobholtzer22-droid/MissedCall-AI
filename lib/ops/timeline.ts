// ===========================================
// /admin/ops: the timeline, everything that happened
// ===========================================
// One merged feed, newest first: approvals (pushed, rejected, applied,
// failed, with who and when), jobs (Jacob's message and the chief's report),
// agent runs (agent, client, status, duration), and OpsActivity rows (notes,
// contacts, status lines, status changes, decisions, system). Shared by GET
// /api/admin/ops/timeline and the chief's get_timeline tool. Read only.
//
// Four findMany with the same cursor, merged and sorted in code; fine at this
// volume. Each row's `at` is when it last happened: an approval's applied,
// else decided, else created time; a run's, a job's or an activity's created
// time. Paging: pass the last row's `at` as `before`.

import { db } from '@/lib/db'
import { DECISION_PREFIX } from './hq/decisions'

export const TIMELINE_KINDS = ['approvals', 'jobs', 'runs', 'notes', 'decisions'] as const
export type TimelineKind = (typeof TIMELINE_KINDS)[number]

export type TimelineQuery = {
  before?: Date | null
  /** Only rows on or after this time. */
  from?: Date | null
  engagementId?: string | null
  /** chief | ads | web. Activities have no agent and are left out when set. */
  agent?: string | null
  kinds?: TimelineKind[]
  limit?: number
}

type Base = { id: string; at: string; engagementId: string | null; client: string | null }

export type TimelineApproval = Base & {
  type: 'approval'
  agent: string
  title: string
  status: string
  error: string | null
  decidedBy: string | null
  decidedVia: string | null
  createdAt: string
  decidedAt: string | null
  appliedAt: string | null
  jobId: string
  runId: string
  applyRunId: string | null
  monthlyCostChange: number | null
}

export type TimelineJob = Base & {
  type: 'job'
  status: string
  prompt: string
  report: { text: string; sections: unknown[]; pendingApprovals: number } | null
  runIds: string[]
}

export type TimelineRun = Base & {
  type: 'run'
  agent: string
  mode: string | null
  kind: string
  status: string
  error: string | null
  startedAt: string | null
  finishedAt: string | null
  jobId: string | null
}

export type TimelineActivity = Base & {
  type: 'activity'
  /** 'decision' for a standing decision; otherwise the OpsActivity kind. */
  kind: string
  body: string
  followUpAt: string | null
}

export type TimelineItem = TimelineApproval | TimelineJob | TimelineRun | TimelineActivity

export function parseReport(summary: string | null): TimelineJob['report'] {
  if (!summary) return null
  try {
    return JSON.parse(summary) as { text: string; sections: unknown[]; pendingApprovals: number }
  } catch {
    return { text: summary, sections: [], pendingApprovals: 0 }
  }
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null)
const name = (e: { displayName: string } | null | undefined) => e?.displayName.trim() ?? null

export async function getTimeline(q: TimelineQuery): Promise<{ items: TimelineItem[]; nextBefore: string | null }> {
  const limit = Math.min(200, Math.max(1, q.limit ?? 50))
  const kinds = new Set<TimelineKind>(q.kinds?.length ? q.kinds : TIMELINE_KINDS)
  const before = q.before ?? null
  const from = q.from ?? null
  const range = (field: string) => ({
    ...(before || from ? { [field]: { ...(before ? { lt: before } : {}), ...(from ? { gte: from } : {}) } } : {}),
  })
  const eid = q.engagementId ?? null
  // A run with no agent is a web dispatch from before HQ.
  const agentWhere = q.agent ? (q.agent === 'web' ? { OR: [{ agent: 'web' }, { agent: null }] } : { agent: q.agent }) : {}
  const wantNotes = kinds.has('notes') && !q.agent
  const wantDecisions = kinds.has('decisions') && !q.agent

  const [approvals, jobs, runs, activities] = await Promise.all([
    kinds.has('approvals')
      ? db.opsApproval.findMany({
          // Any of its three times may fall in range; the exact `at` is checked below.
          where: {
            ...(q.agent ? { agent: q.agent } : {}),
            // A chief approval (admin_change) names its client in detail, not on its run.
            ...(eid ? { AND: [{ OR: [{ run: { engagementId: eid } }, { detail: { path: ['engagementId'], equals: eid } }] }] } : {}),
            ...(before || from ? { OR: [range('createdAt'), range('decidedAt'), range('appliedAt')] } : {}),
          },
          orderBy: { createdAt: 'desc' },
          take: limit * 2,
          include: { run: { select: { engagementId: true, engagement: { select: { displayName: true } } } } },
        })
      : [],
    kinds.has('jobs')
      ? db.opsJob.findMany({
          where: {
            ...range('createdAt'),
            ...(eid ? { OR: [{ engagementIds: { has: eid } }, { runs: { some: { engagementId: eid } } }] } : {}),
            ...(q.agent ? { runs: { some: agentWhere } } : {}),
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
          include: { runs: { select: { id: true }, orderBy: { createdAt: 'asc' } } },
        })
      : [],
    kinds.has('runs')
      ? db.agentRun.findMany({
          where: { ...range('createdAt'), ...(eid ? { engagementId: eid } : {}), ...agentWhere },
          orderBy: { createdAt: 'desc' },
          take: limit,
          select: {
            id: true,
            agent: true,
            mode: true,
            kind: true,
            status: true,
            error: true,
            startedAt: true,
            finishedAt: true,
            createdAt: true,
            jobId: true,
            engagementId: true,
            engagement: { select: { displayName: true } },
          },
        })
      : [],
    wantNotes || wantDecisions
      ? db.opsActivity.findMany({
          where: {
            ...range('createdAt'),
            ...(eid ? { engagementId: eid } : {}),
            ...(wantNotes && !wantDecisions ? { NOT: { body: { startsWith: DECISION_PREFIX } } } : {}),
            ...(wantDecisions && !wantNotes ? { body: { startsWith: DECISION_PREFIX } } : {}),
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
          include: { engagement: { select: { displayName: true } } },
        })
      : [],
  ])

  const items: TimelineItem[] = []

  for (const a of approvals) {
    const at = a.appliedAt ?? a.decidedAt ?? a.createdAt
    if ((before && at >= before) || (from && at < from)) continue
    const d = (a.detail ?? {}) as Record<string, unknown>
    const cost = Number(d.monthlyCostChange)
    items.push({
      type: 'approval',
      id: a.id,
      at: at.toISOString(),
      engagementId: a.run.engagementId ?? (typeof d.engagementId === 'string' ? d.engagementId : null),
      client: name(a.run.engagement) ?? (typeof d.client === 'string' ? d.client : null),
      agent: a.agent,
      title: a.title,
      status: a.status,
      error: a.error,
      decidedBy: typeof d.decidedBy === 'string' ? d.decidedBy : null,
      decidedVia: typeof d.decidedVia === 'string' ? d.decidedVia : null,
      createdAt: a.createdAt.toISOString(),
      decidedAt: iso(a.decidedAt),
      appliedAt: iso(a.appliedAt),
      jobId: a.jobId,
      runId: a.runId,
      applyRunId: typeof d.applyRunId === 'string' ? d.applyRunId : null,
      monthlyCostChange: Number.isFinite(cost) ? cost : null,
    })
  }
  for (const j of jobs) {
    items.push({
      type: 'job',
      id: j.id,
      at: j.createdAt.toISOString(),
      engagementId: j.engagementIds.length === 1 ? j.engagementIds[0] : null,
      client: null,
      status: j.status,
      prompt: j.prompt,
      report: parseReport(j.summary),
      runIds: j.runs.map((r) => r.id),
    })
  }
  for (const r of runs) {
    items.push({
      type: 'run',
      id: r.id,
      at: r.createdAt.toISOString(),
      engagementId: r.engagementId,
      client: name(r.engagement),
      agent: r.agent ?? 'web',
      mode: r.mode,
      kind: r.kind,
      status: r.status,
      error: r.error,
      startedAt: iso(r.startedAt),
      finishedAt: iso(r.finishedAt),
      jobId: r.jobId,
    })
  }
  for (const a of activities) {
    const decision = a.body.startsWith(DECISION_PREFIX)
    items.push({
      type: 'activity',
      id: a.id,
      at: a.createdAt.toISOString(),
      engagementId: a.engagementId,
      client: name(a.engagement),
      kind: decision ? 'decision' : a.kind,
      body: decision ? a.body.slice(DECISION_PREFIX.length).trim() : a.body,
      followUpAt: iso(a.followUpAt),
    })
  }

  const inRange = items.filter((i) => (!before || i.at < before.toISOString()) && (!from || i.at >= from.toISOString()))
  inRange.sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id))
  const page = inRange.slice(0, limit)
  // More may exist when this page is full or any source filled its take.
  const sourceFull = approvals.length >= limit * 2 || jobs.length >= limit || runs.length >= limit || activities.length >= limit
  const nextBefore = page.length && (inRange.length > limit || sourceFull) ? page[page.length - 1].at : null
  return { items: page, nextBefore }
}
