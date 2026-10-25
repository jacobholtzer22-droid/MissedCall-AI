// ===========================================
// GET /api/admin/ops/agents — every AgentRun, newest first
// ===========================================
// For the Agents tab: kind, client, status, times, input and output (PR,
// branch, report excerpt), plus the client's website preview URL and state
// from evidence. Read only.

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/pipeline-server'
import { asObject } from '@/lib/ops/agents/shared'

export const dynamic = 'force-dynamic'

export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const runs = await db.agentRun.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        engagement: {
          select: { displayName: true, deliverables: { where: { type: 'website' }, select: { evidence: true } } },
        },
      },
    })
    return NextResponse.json({
      runs: runs.map((r) => {
        const ev = asObject(r.engagement.deliverables[0]?.evidence)
        return {
          id: r.id,
          engagementId: r.engagementId,
          engagementName: r.engagement.displayName.trim(),
          kind: r.kind,
          status: r.status,
          input: asObject(r.input),
          output: asObject(r.output),
          externalId: r.externalId,
          error: r.error,
          startedAt: r.startedAt?.toISOString() ?? null,
          finishedAt: r.finishedAt?.toISOString() ?? null,
          createdAt: r.createdAt.toISOString(),
          previewUrl: typeof ev.previewUrl === 'string' ? ev.previewUrl : null,
          previewState: typeof ev.previewState === 'string' ? ev.previewState : null,
          previewBranch: typeof ev.previewBranch === 'string' ? ev.previewBranch : null,
        }
      }),
    })
  } catch (err) {
    console.error('[admin/ops/agents] failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to load runs' }, { status: 500 })
  }
}
