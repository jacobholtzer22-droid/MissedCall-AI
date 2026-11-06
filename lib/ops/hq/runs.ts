// ===========================================
// Ops HQ — run lifecycle
// ===========================================
// Every HQ agent run is an AgentRun row (agent chief | ads | web, mode work |
// apply). These helpers start it, finish it, and fail it with an event, so a
// thrown error never leaves a run stuck at running.

import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import type { AgentRunKind, AgentRunMode, HqAgent } from '@/lib/ops/types'
import { emit, oneLine } from './events'
import { costFields, runUsage } from './usage'

export async function createRun(data: {
  agent: HqAgent
  kind: AgentRunKind
  mode: AgentRunMode
  engagementId: string | null
  jobId?: string | null
  deliverableId?: string | null
  input: Record<string, unknown>
  /** Created queued (not started): a worker claims it later (the weekly ads review). */
  queued?: boolean
}) {
  const run = await db.agentRun.create({
    data: {
      agent: data.agent,
      kind: data.kind,
      mode: data.mode,
      engagementId: data.engagementId,
      jobId: data.jobId ?? null,
      deliverableId: data.deliverableId ?? null,
      status: data.queued ? 'queued' : 'running',
      startedAt: data.queued ? null : new Date(),
      input: data.input as Prisma.InputJsonObject,
    },
  })
  await emit(run.id, 'status', data.queued ? 'Queued' : 'Started')
  return run
}

export async function finishRun(runId: string, output: Record<string, unknown>) {
  // The spend recorded by the loop goes onto output as costUsd and usage (usage.ts).
  const cost = costFields(await runUsage(runId).catch(() => null))
  // A run cancelled mid-turn keeps cancelled; only a running run becomes succeeded.
  const done = await db.agentRun.updateMany({
    where: { id: runId, status: 'running' },
    data: { status: 'succeeded', finishedAt: new Date(), output: { ...output, ...cost } as Prisma.InputJsonObject },
  })
  if (done.count === 0) await stampCost(runId, cost)
  await db.agentRun.updateMany({ where: { id: runId, status: 'cancelled', finishedAt: null }, data: { finishedAt: new Date() } })
  await emit(runId, 'status', 'Finished')
}

/** Merge the spend into whatever output the run already has (a failed or cancelled run). Never throws. */
export async function stampCost(runId: string, cost?: Record<string, unknown>) {
  try {
    const fields = cost ?? costFields(await runUsage(runId))
    if (!Object.keys(fields).length) return
    const row = await db.agentRun.findUnique({ where: { id: runId }, select: { output: true } })
    const prev = row?.output && typeof row.output === 'object' && !Array.isArray(row.output) ? (row.output as Record<string, unknown>) : {}
    await db.agentRun.update({ where: { id: runId }, data: { output: { ...prev, ...fields } as Prisma.InputJsonObject } })
  } catch (err) {
    console.error('[hq/runs] cost stamp failed:', err instanceof Error ? err.message : err)
  }
}

export async function failRun(runId: string, err: unknown) {
  const message = oneLine(err instanceof Error ? err.message : String(err), 500)
  await db.agentRun.update({ where: { id: runId }, data: { status: 'failed', finishedAt: new Date(), error: message } })
  await emit(runId, 'error', `Failed: ${message}`, { error: message })
  await stampCost(runId)
  return message
}
