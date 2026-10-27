// ===========================================
// Ops HQ — deciding an approval
// ===========================================
// Shared by POST /api/admin/ops/hq/approvals/[id] and scripts. Only a pending
// approval can be decided; the status flip is conditional, so a double click
// cannot start two runs.
//
//   reject   status rejected, decidedAt
//   approve  ads_change: status approved, then an ads specialist run in apply
//            mode under the same job, allowed exactly the proposal's tool with
//            exactly its args. The caller runs runAdsTask(applyRunId) (the
//            route under waitUntil); the run marks the approval applied or
//            failed. If the run cannot start, the approval fails with the reason.
//            web_push: wired at checkpoint 5.

import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { AdsOffline, startAdsRun } from './ads'

export type DecideResult =
  | { ok: true; status: 'rejected' }
  | { ok: true; status: 'approved'; applyRunId: string }
  | { ok: false; httpStatus: number; error: string }

export async function decideApproval(id: string, decision: 'approve' | 'reject'): Promise<DecideResult> {
  const approval = await db.opsApproval.findUnique({
    where: { id },
    include: { run: { select: { engagementId: true } } },
  })
  if (!approval) return { ok: false, httpStatus: 404, error: 'Approval not found' }
  if (approval.status !== 'pending') return { ok: false, httpStatus: 409, error: `Approval is already ${approval.status}` }
  if (decision === 'approve' && approval.kind !== 'ads_change') {
    return { ok: false, httpStatus: 400, error: 'Pushing a web change is not wired yet' }
  }

  const flipped = await db.opsApproval.updateMany({
    where: { id, status: 'pending' },
    data: { status: decision === 'approve' ? 'approved' : 'rejected', decidedAt: new Date() },
  })
  if (flipped.count === 0) return { ok: false, httpStatus: 409, error: 'Approval was decided a moment ago' }
  if (decision === 'reject') return { ok: true, status: 'rejected' }

  const detail = approval.detail as Record<string, unknown>
  const action = String(detail.action ?? '')
  const args = (detail.args && typeof detail.args === 'object' ? detail.args : {}) as Record<string, unknown>
  try {
    const engagementId = approval.run.engagementId
    if (!engagementId) throw new Error('the proposing run has no client')
    const run = await startAdsRun({
      engagementId,
      jobId: approval.jobId,
      mode: 'apply',
      approval: { id, action, args },
      instructions: [`Jacob approved: ${approval.title}.`, detail.why ? `Why: ${String(detail.why)}` : '', approval.expected ? `Expected: ${approval.expected}` : '']
        .filter(Boolean)
        .join('\n'),
    })
    await db.opsApproval.update({ where: { id }, data: { detail: { ...detail, applyRunId: run.id } as Prisma.InputJsonObject } })
    return { ok: true, status: 'approved', applyRunId: run.id }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await db.opsApproval.update({ where: { id }, data: { status: 'failed', error: message } })
    return { ok: false, httpStatus: err instanceof AdsOffline ? 503 : 422, error: message }
  }
}
