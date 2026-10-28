// ===========================================
// GET /api/admin/ops/hq/feed?since=<iso> — everything HQ needs to redraw
// ===========================================
// Polled every 2s while the tab is visible, 15s when hidden. With since: the
// chat messages and agent events newer than it (events capped at 200). Without
// since: the last 50 messages and the last 200 events. Always: active runs plus
// runs finished in the last 30 minutes (agent, client, status, latest event),
// each HQ agent's most recent run whenever it was (the idle desks), approvals
// that are pending or were decided in the last 30 minutes (so a pushed card can
// show Applying, then Applied or the error), and the last 20 jobs with their
// reports. cursor is the newest timestamp returned; pass it back as since.

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/pipeline-server'
import { HQ_AGENTS } from '@/lib/ops/types'

export const dynamic = 'force-dynamic'

const ACTIVE = ['queued', 'running', 'dispatched']
const RECENT_MS = 30 * 60 * 1000

function detailString(detail: unknown, key: string): string | null {
  const v = (detail as Record<string, unknown> | null)?.[key]
  return typeof v === 'string' ? v : null
}

function parseReport(summary: string | null) {
  if (!summary) return null
  try {
    return JSON.parse(summary) as { text: string; sections: unknown[]; pendingApprovals: number }
  } catch {
    return { text: summary, sections: [], pendingApprovals: 0 }
  }
}

export async function GET(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const raw = new URL(request.url).searchParams.get('since')
    const since = raw ? new Date(raw) : null
    if (since && Number.isNaN(since.getTime())) return NextResponse.json({ error: 'since is not a date' }, { status: 400 })

    const recent = new Date(Date.now() - RECENT_MS)
    const runInclude = {
      engagement: { select: { displayName: true } },
      events: { orderBy: { createdAt: 'desc' as const }, take: 1, select: { label: true, kind: true, createdAt: true } },
    }
    const [messages, events, runs, approvals, jobs, lastRuns] = await Promise.all([
      since
        ? db.opsMessage.findMany({ where: { createdAt: { gt: since } }, orderBy: { createdAt: 'asc' }, take: 200 })
        : db.opsMessage.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }).then((r) => r.reverse()),
      since
        ? db.agentEvent.findMany({ where: { createdAt: { gt: since } }, orderBy: { createdAt: 'asc' }, take: 200 })
        : db.agentEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }).then((r) => r.reverse()),
      db.agentRun.findMany({
        where: {
          agent: { not: null },
          OR: [{ status: { in: ACTIVE } }, { finishedAt: { gt: recent } }],
        },
        orderBy: { createdAt: 'desc' },
        take: 30,
        include: runInclude,
      }),
      db.opsApproval.findMany({
        where: { OR: [{ status: 'pending' }, { decidedAt: { gt: recent } }] },
        orderBy: { createdAt: 'desc' },
        include: { run: { select: { engagementId: true, engagement: { select: { displayName: true } } } } },
      }),
      db.opsJob.findMany({ orderBy: { createdAt: 'desc' }, take: 20 }),
      Promise.all(HQ_AGENTS.map((agent) => db.agentRun.findFirst({ where: { agent }, orderBy: { createdAt: 'desc' }, include: runInclude }))),
    ])
    type RunRow = (typeof runs)[number]
    const runView = (r: RunRow) => ({
      id: r.id,
      agent: r.agent,
      mode: r.mode,
      kind: r.kind,
      jobId: r.jobId,
      engagementId: r.engagementId,
      client: r.engagement?.displayName.trim() ?? null,
      status: r.status,
      error: r.error,
      startedAt: r.startedAt?.toISOString() ?? null,
      finishedAt: r.finishedAt?.toISOString() ?? null,
      latest: r.events[0] ? { kind: r.events[0].kind, label: r.events[0].label, at: r.events[0].createdAt.toISOString() } : null,
    })

    const stamps = [...messages.map((m) => m.createdAt), ...events.map((e) => e.createdAt)].map((d) => d.getTime())
    const cursor = stamps.length ? new Date(Math.max(...stamps)).toISOString() : (since?.toISOString() ?? null)

    return NextResponse.json({
      cursor,
      messages: messages.map((m) => ({ id: m.id, jobId: m.jobId, role: m.role, body: m.body, createdAt: m.createdAt.toISOString() })),
      events: events.map((e) => ({ id: e.id, runId: e.runId, kind: e.kind, label: e.label, detail: e.detail, createdAt: e.createdAt.toISOString() })),
      runs: runs.map(runView),
      lastRuns: Object.fromEntries(HQ_AGENTS.map((agent, n) => [agent, lastRuns[n] ? runView(lastRuns[n]!) : null])),
      approvals: approvals.map((a) => ({
        id: a.id,
        jobId: a.jobId,
        runId: a.runId,
        agent: a.agent,
        kind: a.kind,
        // A chief approval (admin_change) has no client on its run; its detail names one.
        client: a.run.engagement?.displayName.trim() ?? detailString(a.detail, 'client'),
        engagementId: a.run.engagementId ?? detailString(a.detail, 'engagementId'),
        title: a.title,
        detail: a.detail,
        expected: a.expected,
        status: a.status,
        error: a.error,
        decidedAt: a.decidedAt?.toISOString() ?? null,
        appliedAt: a.appliedAt?.toISOString() ?? null,
        createdAt: a.createdAt.toISOString(),
      })),
      jobs: jobs.map((j) => ({
        id: j.id,
        status: j.status,
        prompt: j.prompt,
        engagementIds: j.engagementIds,
        report: parseReport(j.summary),
        createdAt: j.createdAt.toISOString(),
        updatedAt: j.updatedAt.toISOString(),
      })),
    })
  } catch (err) {
    console.error('[admin/ops/hq/feed] failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to load the feed' }, { status: 500 })
  }
}
