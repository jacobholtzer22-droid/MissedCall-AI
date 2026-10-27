// ===========================================
// POST /api/admin/ops/hq/runs/[id]/cancel — stop an HQ run
// ===========================================
// Marks a queued, running or dispatched run cancelled. The agent loop reads the
// run before every model turn and stops there; a turn already streaming
// finishes first. A dispatched web run keeps going on GitHub; its callback is
// then recorded as a duplicate of a finished run.

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/pipeline-server'
import { emit } from '@/lib/ops/hq/events'

export const dynamic = 'force-dynamic'

export async function POST(_request: Request, context: { params: { id: string } }) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const id = context.params.id
    const done = await db.agentRun.updateMany({
      where: { id, status: { in: ['queued', 'running', 'dispatched'] } },
      data: { status: 'cancelled', finishedAt: new Date() },
    })
    if (done.count === 0) {
      const run = await db.agentRun.findUnique({ where: { id }, select: { status: true } })
      if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })
      return NextResponse.json({ error: `Run is already ${run.status}` }, { status: 409 })
    }
    await emit(id, 'status', 'Cancel requested')
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[admin/ops/hq/cancel] failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to cancel' }, { status: 500 })
  }
}
