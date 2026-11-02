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
import { autoflowEnabled } from '@/lib/ops/autoflow'
import { ACCOUNT_APPROVAL_KINDS, adsAccountCreateEnabled } from '@/lib/ops/ads-account'
import { applyAccountCard } from '@/lib/ops/ads-account-server'
import { autoflowAfterPush } from '@/lib/ops/autoflow-server'
import { LINK_CARD_KIND, duplicateGuardEnabled } from '@/lib/ops/duplicate-guard'
import { applyLinkCard } from '@/lib/ops/duplicate-guard-server'
import { approvalStamp, pushedByLine } from '@/lib/ops/approver'
import { portalIntakeWizardEnabled } from '@/lib/ops/intake-wizard'
import { applyPortalMerge } from '@/lib/ops/intake-wizard-server'
import { SUBSCRIPTION_CARD_KIND, stripeCardAtSignupEnabled } from '@/lib/ops/stripe-billing'
import { adsBillingInviteEnabled } from '@/lib/ops/ads-billing'

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
  // ADS_ACCOUNT_CREATE (off by default) adds its two card kinds; off, the list is as before.
  const pushable = ['ads_change', 'admin_change', 'web_push', ...(adsAccountCreateEnabled() ? ACCOUNT_APPROVAL_KINDS : adsBillingInviteEnabled() ? ['ads_invite'] : []), ...(duplicateGuardEnabled() || portalIntakeWizardEnabled() ? [LINK_CARD_KIND] : []), ...(stripeCardAtSignupEnabled() ? [SUBSCRIPTION_CARD_KIND] : [])]
  if (decision === 'approve' && !pushable.includes(approval.kind)) {
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
  // OPS_AUTOFLOW (off by default): who pushed it goes with what the Push did (lib/ops/approver.ts).
  const stamp = autoflowEnabled() ? approvalStamp(id, by) : null
  const pushedNote = async () => {
    const engagementId = approval.run.engagementId ?? (typeof detail.engagementId === 'string' ? detail.engagementId : null)
    if (stamp && engagementId) await db.opsActivity.create({ data: { engagementId, kind: 'system', body: pushedByLine(id, approval.title, by) } }).catch(() => undefined)
  }

  if (approval.kind === 'web_push') {
    try {
      await applyWebPush({ id, jobId: approval.jobId, detail: stamp ? { ...detail, ...stamp } : detail })
      await db.opsApproval.update({ where: { id }, data: { status: 'applied', appliedAt: new Date() } })
      await pushedNote()
      await closeJobIfSettled(approval.jobId)
      // OPS_AUTOFLOW (off by default): one next step from the fixed table. Never throws.
      if (autoflowEnabled()) await autoflowAfterPush({ id, jobId: approval.jobId, runId: approval.runId }, detail)
      return { ok: true, status: 'applied' }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await db.opsApproval.update({ where: { id }, data: { status: 'failed', error: message } })
      await closeJobIfSettled(approval.jobId)
      return { ok: false, httpStatus: 422, error: message }
    }
  }

  // ADS_BILLING_INVITE (off by default) also pushes ads_invite, through the same applyAccountCard.
  if ((adsAccountCreateEnabled() && (ACCOUNT_APPROVAL_KINDS as readonly string[]).includes(approval.kind)) || (adsBillingInviteEnabled() && approval.kind === 'ads_invite')) {
    try {
      const line = await applyAccountCard({ kind: approval.kind, runId: approval.runId, jobId: approval.jobId }, detail)
      await db.opsApproval.update({ where: { id }, data: { status: 'applied', appliedAt: new Date(), detail: { ...detail, result: line } as Prisma.InputJsonObject } })
      await pushedNote()
      await closeJobIfSettled(approval.jobId)
      return { ok: true, status: 'applied' }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await db.opsApproval.update({ where: { id }, data: { status: 'failed', error: message } })
      // ADS_BILLING_INVITE: Google refused the invite, so the billing steps become a Ready-to-send draft.
      if (adsBillingInviteEnabled() && approval.kind === 'ads_invite' && typeof detail.engagementId === 'string') {
        await import('@/lib/ops/ads-billing-server').then((m) => m.inviteRefused(detail.engagementId as string, message)).catch(() => undefined)
      }
      await closeJobIfSettled(approval.jobId)
      return { ok: false, httpStatus: 422, error: message }
    }
  }

  // DUPLICATE_GUARD: Jacob says the two are the same client. PORTAL_INTAKE_WIZARD: a portal sign-up merges in.
  if ((duplicateGuardEnabled() || portalIntakeWizardEnabled()) && approval.kind === LINK_CARD_KIND) {
    try {
      const line = detail.action === 'merge_portal' && portalIntakeWizardEnabled() ? await applyPortalMerge(detail) : await applyLinkCard(detail)
      await db.opsApproval.update({ where: { id }, data: { status: 'applied', appliedAt: new Date(), detail: { ...detail, result: line } as Prisma.InputJsonObject } })
      await pushedNote()
      await closeJobIfSettled(approval.jobId)
      return { ok: true, status: 'applied' }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await db.opsApproval.update({ where: { id }, data: { status: 'failed', error: message } })
      await closeJobIfSettled(approval.jobId)
      return { ok: false, httpStatus: 422, error: message }
    }
  }

  // STRIPE_CARD_AT_SIGNUP: Jacob's Push starts the subscription on the saved card. Idempotent per approval.
  if (stripeCardAtSignupEnabled() && approval.kind === SUBSCRIPTION_CARD_KIND) {
    try {
      const { applySubscriptionCard } = await import('@/lib/ops/stripe-billing-server')
      const line = await applySubscriptionCard(detail, id)
      await db.opsApproval.update({ where: { id }, data: { status: 'applied', appliedAt: new Date(), detail: { ...detail, result: line } as Prisma.InputJsonObject } })
      await pushedNote()
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
      await pushedNote()
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
      // A check-up's proposal may name one of its cut-waste work tools (lib/ops/hq/ads-tools.ts CHECKUP_PROPOSABLE).
      approval: { id, action, args, ...(detail.checkup === true ? { checkup: true } : {}), ...(detail.review === true ? { review: true } : {}), ...(stamp ? { decidedBy: stamp.decidedBy, decidedVia: stamp.decidedVia } : {}) },
      instructions: [`Jacob approved: ${approval.title}.`, detail.why ? `Why: ${String(detail.why)}` : '', approval.expected ? `Expected: ${approval.expected}` : '']
        .filter(Boolean)
        .join('\n'),
    })
    await db.opsApproval.update({ where: { id }, data: { detail: { ...detail, applyRunId: run.id } as Prisma.InputJsonObject } })
    await pushedNote()
    return { ok: true, status: 'approved', applyRunId: run.id }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await db.opsApproval.update({ where: { id }, data: { status: 'failed', error: message } })
    return { ok: false, httpStatus: err instanceof AdsOffline ? 503 : 422, error: message }
  }
}
