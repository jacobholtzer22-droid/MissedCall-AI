// ===========================================
// GET /api/admin/ops/hq/jobs?engagementId=&before=<iso>&limit= — job history
// ===========================================
// Read only. OpsJobs newest first, each with its runs (agent, client, status,
// mode, start and finish) and every approval (decision, when decided, when
// applied, error). With engagementId: only jobs that touched that client, by
// the job's engagementIds or by any of its runs. before pages backwards: pass
// the oldest createdAt you have; nextBefore is null when there is no more.

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/pipeline-server'

export const dynamic = 'force-dynamic'

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
    const params = new URL(request.url).searchParams
    const engagementId = params.get('engagementId')
    const rawBefore = params.get('before')
    const before = rawBefore ? new Date(rawBefore) : null
    if (before && Number.isNaN(before.getTime())) return NextResponse.json({ error: 'before is not a date' }, { status: 400 })
    const limit = Math.min(50, Math.max(1, Number(params.get('limit')) || 20))

    const jobs = await db.opsJob.findMany({
      where: {
        ...(before ? { createdAt: { lt: before } } : {}),
        ...(engagementId ? { OR: [{ engagementIds: { has: engagementId } }, { runs: { some: { engagementId } } }] } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      include: {
        runs: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            agent: true,
            mode: true,
            kind: true,
            status: true,
            error: true,
            engagementId: true,
            startedAt: true,
            finishedAt: true,
            createdAt: true,
            engagement: { select: { displayName: true } },
          },
        },
        approvals: {
          orderBy: { createdAt: 'asc' },
          include: { run: { select: { engagementId: true, engagement: { select: { displayName: true } } } } },
        },
      },
    })
    const page = jobs.slice(0, limit)

    return NextResponse.json({
      nextBefore: jobs.length > limit ? page[page.length - 1].createdAt.toISOString() : null,
      jobs: page.map((j) => ({
        id: j.id,
        status: j.status,
        prompt: j.prompt,
        report: parseReport(j.summary),
        createdAt: j.createdAt.toISOString(),
        updatedAt: j.updatedAt.toISOString(),
        runs: j.runs.map((r) => ({
          id: r.id,
          agent: r.agent,
          mode: r.mode,
          kind: r.kind,
          status: r.status,
          error: r.error,
          engagementId: r.engagementId,
          client: r.engagement?.displayName.trim() ?? null,
          startedAt: r.startedAt?.toISOString() ?? null,
          finishedAt: r.finishedAt?.toISOString() ?? null,
          createdAt: r.createdAt.toISOString(),
        })),
        approvals: j.approvals.map((a) => ({
          id: a.id,
          runId: a.runId,
          agent: a.agent,
          kind: a.kind,
          title: a.title,
          status: a.status,
          error: a.error,
          engagementId: a.run.engagementId,
          client: a.run.engagement?.displayName.trim() ?? null,
          decidedAt: a.decidedAt?.toISOString() ?? null,
          appliedAt: a.appliedAt?.toISOString() ?? null,
          createdAt: a.createdAt.toISOString(),
        })),
      })),
    })
  } catch (err) {
    console.error('[admin/ops/hq/jobs] failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to load the history' }, { status: 500 })
  }
}
