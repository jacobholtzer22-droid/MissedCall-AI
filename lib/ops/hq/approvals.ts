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
//            admin_change: the chief's change to a platform account routing
//            field (lib/ops/hq/admin-change.ts), written at once through the
//            same rules as the admin Business PATCH; applied or failed.
//            web_push: merge, go_live or connect_domain for a client site
//            (lib/ops/hq/web.ts applyWebPush); applied or failed.
// Either way the approval's detail records who decided and through what
// ({ decidedBy: 'jacob', decidedVia: 'hq' }), so the timeline and the chief
// can say who pushed it.

import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { AdsOffline, startAdsRun } from './ads'
import { applyAdminChange } from './admin-change'
import { applyWebPush } from './web'
import { closeJobIfSettled } from './jobs'

export type DecideResult =
  | { ok: true; status: 'rejected' }
  | { ok: true; status: 'applied' }
  | { ok: true; status: 'approved'; applyRunId: string }
  | { ok: false; httpStatus: number; error: string }

export type DecidedBy = { decidedBy: string; decidedVia: string }

export async function decideApproval(
  id: string,
  decision: 'approve' | 'reject',
  by: DecidedBy = { decidedBy: 'jacob', decidedVia: 'hq' }
): Promise<DecideResult> {
  const approval = await db.opsApproval.findUnique({
    where: { id },
    include: { run: { select: { engagementId: true } } },
  })
  if (!approval) return { ok: false, httpStatus: 404, error: 'Approval not found' }
  if (approval.status !== 'pending') return { ok: false, httpStatus: 409, error: `Approval is already ${approval.status}` }
  if (decision === 'approve' && !['ads_change', 'admin_change', 'web_push'].includes(approval.kind)) {
    return { ok: false, httpStatus: 400, error: `Pushing a ${approval.kind} is not wired` }
  }

  const flipped = await db.opsApproval.updateMany({
    where: { id, status: 'pending' },
    data: { status: decision === 'approve' ? 'approved' : 'rejected', decidedAt: new Date() },
  })
  if (flipped.count === 0) return { ok: false, httpStatus: 409, error: 'Approval was decided a moment ago' }

  const detail: Record<string, unknown> = { ...(approval.detail as Record<string, unknown>), decidedBy: by.decidedBy, decidedVia: by.decidedVia }
  await db.opsApproval.update({ where: { id }, data: { detail: detail as Prisma.InputJsonObject } })
  if (decision === 'reject') {
    await closeJobIfSettled(approval.jobId)
    return { ok: true, status: 'rejected' }
  }

  if (approval.kind === 'web_push') {
    try {
      await applyWebPush({ id, jobId: approval.jobId, detail })
      await db.opsApproval.update({ where: { id }, data: { status: 'applied', appliedAt: new Date() } })
      await closeJobIfSettled(approval.jobId)
      return { ok: true, status: 'applied' }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await db.opsApproval.update({ where: { id }, data: { status: 'failed', error: message } })
      await closeJobIfSettled(approval.jobId)
      return { ok: false, httpStatus: 422, error: message }
    }
  }

  if (approval.kind === 'admin_change') {
    try {
      await applyAdminChange(detail)
      await db.opsApproval.update({ where: { id }, data: { status: 'applied', appliedAt: new Date() } })
      await closeJobIfSettled(approval.jobId)
      return { ok: true, status: 'applied' }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await db.opsApproval.update({ where: { id }, data: { status: 'failed', error: message } })
      await closeJobIfSettled(approval.jobId)
      return { ok: false, httpStatus: 422, error: message }
    }
  }

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
