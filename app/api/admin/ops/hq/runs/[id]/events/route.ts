// ===========================================
// GET /api/admin/ops/hq/runs/[id]/events — one run's whole feed
// ===========================================
// For the desk drawer: the run (agent, client, status, times) and every event
// it wrote, oldest first (up to 2,000). New events after that arrive through the
// feed poll, which carries runId on each event.

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/pipeline-server'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, context: { params: { id: string } }) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const run = await db.agentRun.findUnique({
      where: { id: context.params.id },
      include: { engagement: { select: { displayName: true } }, events: { orderBy: { createdAt: 'asc' }, take: 2000 } },
    })
    if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })
    return NextResponse.json({
      run: {
        id: run.id,
        agent: run.agent,
        mode: run.mode,
        client: run.engagement?.displayName.trim() ?? null,
        status: run.status,
        error: run.error,
        startedAt: run.startedAt?.toISOString() ?? null,
        finishedAt: run.finishedAt?.toISOString() ?? null,
      },
      events: run.events.map((e) => ({ id: e.id, runId: e.runId, kind: e.kind, label: e.label, detail: e.detail, createdAt: e.createdAt.toISOString() })),
    })
  } catch (err) {
    console.error('[admin/ops/hq/run events] failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to load the run' }, { status: 500 })
  }
}
