// ===========================================
// Ops HQ — closing a job
// ===========================================
// Called when a specialist run (ads, web) ends. When it was the last active
// specialist run in its job, the job is claimed (status running → reporting,
// a conditional update, so two runs ending together report once) and the
// chief is re-invoked once to write the report. A job that already reported
// (awaiting_approval) closes as done when its last approval is no longer
// pending or being applied.

import { db } from '@/lib/db'

const ACTIVE = ['queued', 'running', 'dispatched']

export async function onSpecialistRunEnded(jobId: string) {
  const runs = await db.agentRun.findMany({ where: { jobId, agent: { in: ['ads', 'web'] } }, select: { status: true } })
  if (!runs.length || runs.some((r) => ACTIVE.includes(r.status))) return

  const claimed = await db.opsJob.updateMany({ where: { id: jobId, status: { in: ['planning', 'running'] } }, data: { status: 'reporting' } })
  if (claimed.count === 0) {
    const waiting = await db.opsApproval.count({ where: { jobId, status: { in: ['pending', 'approved'] } } })
    if (!waiting) await db.opsJob.updateMany({ where: { id: jobId, status: 'awaiting_approval' }, data: { status: 'done' } })
    return
  }
  // chief.ts imports ads.ts, which imports this file: load the chief lazily.
  const { runChiefReport } = await import('./chief')
  await runChiefReport(jobId)
}
