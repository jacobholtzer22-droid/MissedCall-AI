// ===========================================
// Ops HQ — closing a job
// ===========================================
// Called when a specialist run (ads, web, photo) ends, and when the chief's own turn
// ends (it may still be starting specialists: a report written before the last
// one starts would cover only some, and the late one would report again).
// When no chief turn is active and it was the last active specialist run, the job is claimed (status running → reporting,
// a conditional update, so two runs ending together report once) and the
// chief is re-invoked once: after a photo run to file the captioned photos
// (runChiefAfterPhotos), and when ads or web runs were in the job to write the
// report. A job with only photo runs closes as done after that. A job that already reported
// (awaiting_approval) closes as done when its last approval is no longer
// pending or being applied.

import { db } from '@/lib/db'

const ACTIVE = ['queued', 'running', 'dispatched']
const SPECIALISTS = ['ads', 'web', 'photo']

export async function onSpecialistRunEnded(jobId: string) {
  const runs = await db.agentRun.findMany({ where: { jobId, agent: { in: SPECIALISTS } }, select: { status: true, agent: true } })
  if (!runs.length || runs.some((r) => ACTIVE.includes(r.status))) return
  const chiefBusy = await db.agentRun.count({ where: { jobId, agent: 'chief', status: { in: ACTIVE } } })
  if (chiefBusy) return

  const claimed = await db.opsJob.updateMany({ where: { id: jobId, status: { in: ['planning', 'running'] } }, data: { status: 'reporting' } })
  if (claimed.count === 0) {
    const waiting = await db.opsApproval.count({ where: { jobId, status: { in: ['pending', 'approved'] } } })
    if (!waiting) await db.opsJob.updateMany({ where: { id: jobId, status: 'awaiting_approval' }, data: { status: 'done' } })
    return
  }
  // chief.ts imports ads.ts, which imports this file: load the chief lazily.
  const { runChiefAfterPhotos, runChiefReport } = await import('./chief')
  if (runs.some((r) => r.agent === 'photo')) await runChiefAfterPhotos(jobId)
  if (runs.some((r) => r.agent !== 'photo')) {
    // Filing may have touched the job (ensureJob sets running); the report expects reporting.
    await db.opsJob.updateMany({ where: { id: jobId, status: { in: ['planning', 'running'] } }, data: { status: 'reporting' } })
    await runChiefReport(jobId)
  } else {
    await db.opsJob.updateMany({ where: { id: jobId, status: { in: ['planning', 'running', 'reporting'] } }, data: { status: 'done' } })
  }
}

/**
 * A job waiting on approvals with no specialist run (e.g. the chief's
 * admin_change) closes as done once none is pending or being applied.
 */
export async function closeJobIfSettled(jobId: string) {
  const [active, waiting] = await Promise.all([
    db.agentRun.count({ where: { jobId, agent: { in: SPECIALISTS }, status: { in: ACTIVE } } }),
    db.opsApproval.count({ where: { jobId, status: { in: ['pending', 'approved'] } } }),
  ])
  if (!active && !waiting) await db.opsJob.updateMany({ where: { id: jobId, status: 'awaiting_approval' }, data: { status: 'done' } })
}
