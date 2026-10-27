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

export async function createRun(data: {
  agent: HqAgent
  kind: AgentRunKind
  mode: AgentRunMode
  engagementId: string | null
  jobId?: string | null
  deliverableId?: string | null
  input: Record<string, unknown>
}) {
  const run = await db.agentRun.create({
    data: {
      agent: data.agent,
      kind: data.kind,
      mode: data.mode,
      engagementId: data.engagementId,
      jobId: data.jobId ?? null,
      deliverableId: data.deliverableId ?? null,
      status: 'running',
      startedAt: new Date(),
      input: data.input as Prisma.InputJsonObject,
    },
  })
  await emit(run.id, 'status', 'Started')
  return run
}

export async function finishRun(runId: string, output: Record<string, unknown>) {
  // A run cancelled mid-turn keeps cancelled; only a running run becomes succeeded.
  await db.agentRun.updateMany({
    where: { id: runId, status: 'running' },
    data: { status: 'succeeded', finishedAt: new Date(), output: output as Prisma.InputJsonObject },
  })
  await db.agentRun.updateMany({ where: { id: runId, status: 'cancelled', finishedAt: null }, data: { finishedAt: new Date() } })
  await emit(runId, 'status', 'Finished')
}

export async function failRun(runId: string, err: unknown) {
  const message = oneLine(err instanceof Error ? err.message : String(err), 500)
  await db.agentRun.update({ where: { id: runId }, data: { status: 'failed', finishedAt: new Date(), error: message } })
  await emit(runId, 'error', `Failed: ${message}`, { error: message })
  return message
}
