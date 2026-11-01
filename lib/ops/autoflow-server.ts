// ===========================================
// Ops HQ autoflow: the real side effects (OPS_AUTOFLOW, off by default)
// ===========================================
// lib/ops/autoflow.ts decides and guards; this file only reads the board rows
// and calls start_web_task's own code. Two entry points, both no-ops with the
// flag off and both called only when it is on:
//   autoflowForJob     from runChiefReport, once per finished web or ads run in the job
//   autoflowAfterPush  from decideApproval, after an applied web_push

import { db } from '@/lib/db'
import { startWebTask } from '@/lib/ops/hq/web'
import { autoflowEnabled, runAutoflowEvent, type AutoflowDeps, type AutoflowEvent, type HopResult } from '@/lib/ops/autoflow'

function deps(runId: string, jobId: string): AutoflowDeps {
  return {
    deliverables: async (engagementId) =>
      (
        await db.deliverable.findMany({ where: { engagementId }, select: { type: true, step: true, stepUpdatedAt: true, evidence: true } })
      ).map((d) => ({
        type: d.type,
        step: d.step,
        stepUpdatedAt: d.stepUpdatedAt?.toISOString() ?? null,
        evidence: d.evidence && typeof d.evidence === 'object' && !Array.isArray(d.evidence) ? (d.evidence as Record<string, unknown>) : {},
      })),
    handled: async (engagementId, marker) =>
      Boolean(await db.opsActivity.findFirst({ where: { engagementId, body: { startsWith: `${marker} |` } }, select: { id: true } })),
    lastHop: async (engagementId) =>
      (
        await db.opsActivity.findFirst({
          where: { engagementId, kind: 'system', body: { startsWith: '[autoflow] event', contains: '| started ' } },
          orderBy: { createdAt: 'desc' },
          select: { body: true },
        })
      )?.body ?? null,
    // said is always empty: autoflow never waives a go-live gate item.
    startWeb: (engagementId, kind) => startWebTask({ engagementId, kind, said: '', runId, jobId: async () => jobId }),
    activity: async (engagementId, body, kind) => {
      await db.opsActivity.create({ data: { engagementId, kind, body } })
    },
    waitingNote: async (engagementId, type, note) => {
      await db.deliverable.updateMany({ where: { engagementId, type }, data: { waitingNote: note } })
    },
  }
}

/** One event per finished web or ads run in the job. Returns what was done, for the report prompt. */
export async function autoflowForJob(jobId: string, reportRunId: string): Promise<HopResult[]> {
  if (!autoflowEnabled()) return []
  const runs = await db.agentRun.findMany({
    where: { jobId, agent: { in: ['web', 'ads'] }, finishedAt: { not: null }, engagementId: { not: null } },
    orderBy: { finishedAt: 'asc' },
    select: { id: true, agent: true, kind: true, status: true, engagementId: true, input: true },
  })
  const out: HopResult[] = []
  for (const r of runs) {
    const input = (r.input ?? {}) as { kind?: unknown; tracking?: unknown }
    const event: AutoflowEvent = {
      type: 'run',
      id: r.id,
      agent: r.agent ?? 'web',
      kind: typeof input.kind === 'string' ? input.kind : r.kind,
      status: r.status,
      engagementId: r.engagementId!,
      trackingRun: Boolean(input.tracking && typeof input.tracking === 'object'),
    }
    try {
      out.push(await runAutoflowEvent(event, deps(reportRunId, jobId)))
    } catch (err) {
      console.error(`[autoflow] run ${r.id} failed:`, err instanceof Error ? err.message : err)
    }
  }
  return out
}

/** One event for an applied web_push. Never throws to the Push route. */
export async function autoflowAfterPush(approval: { id: string; jobId: string; runId: string | null }, detail: Record<string, unknown>): Promise<HopResult | null> {
  if (!autoflowEnabled()) return null
  const engagementId = typeof detail.engagementId === 'string' ? detail.engagementId : null
  if (!engagementId || !approval.runId) return null
  try {
    return await runAutoflowEvent(
      { type: 'approval', id: approval.id, action: String(detail.action ?? ''), engagementId },
      deps(approval.runId, approval.jobId)
    )
  } catch (err) {
    console.error(`[autoflow] approval ${approval.id} failed:`, err instanceof Error ? err.message : err)
    return null
  }
}
