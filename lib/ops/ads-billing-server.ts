// ADS_BILLING_INVITE, server side: propose the one billing invite card when the
// ads account is bound, or record the fallback for the Ready-to-send draft; copy
// the wizard's legal details onto the ads deliverable. Never sends anything:
// the invite goes out only when Jacob pushes the ads_invite card
// (decideApproval -> applyAccountCard -> applyInvite).

import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { readIntake } from '@/lib/ops/intake'
import { mergeEvidence } from '@/lib/ops/agents/shared'
import { createRun } from '@/lib/ops/hq/runs'
import { isNeverTouch, missingAdsEnv } from '@/lib/ops/hq/ads-tools'
import { adsBillingInviteEnabled, advertiserLegalFrom, billingInviteDecision, q17Email, type InviteDecision } from '@/lib/ops/ads-billing'

type IntakeLike = ReturnType<typeof readIntake> & { legal?: { legalName?: string; address?: string; zip?: string }; questionnaire?: { answers?: Record<string, string> } }

/** The wizard's legal details on the ads deliverable (evidence.advertiserLegal), when there are any. */
export async function syncAdvertiserLegal(engagementId: string, legal: IntakeLike['legal']): Promise<void> {
  if (!adsBillingInviteEnabled()) return
  const l = advertiserLegalFrom(legal)
  if (!l) return
  const ads = await db.deliverable.findUnique({ where: { engagementId_type: { engagementId, type: 'ads' } }, select: { id: true } })
  if (ads) await mergeEvidence(ads.id, { advertiserLegal: l })
}

/** When the ads account is bound: the card, the fallback draft, or nothing. Idempotent. */
export async function proposeBillingInvite(engagementId: string): Promise<InviteDecision & { approvalId?: string }> {
  if (!adsBillingInviteEnabled()) return { action: 'none', reason: 'ADS_BILLING_INVITE is off' }
  const e = await db.engagement.findUnique({
    where: { id: engagementId },
    select: { displayName: true, intake: true, business: { select: { googleAdsCustomerId: true } }, deliverables: { where: { type: 'ads' }, select: { id: true, evidence: true } } },
  })
  const ads = e?.deliverables[0]
  if (!e || !ads) return { action: 'none', reason: 'no ads deliverable' }
  const intake = readIntake(e.intake) as IntakeLike
  const ev = (ads.evidence ?? {}) as Record<string, unknown>
  const customerId = (e.business?.googleAdsCustomerId || (typeof ev.adsCustomerId === 'string' ? ev.adsCustomerId : '') || '').replace(/-/g, '') || null
  const email = q17Email(intake.ads?.accountEmail, intake.questionnaire?.answers?.['17'])
  const cards = await db.opsApproval.findMany({ where: { kind: 'ads_invite', detail: { path: ['engagementId'], equals: engagementId } }, select: { kind: true, status: true, detail: true } })
  const decision = billingInviteDecision({
    engagementId,
    client: e.displayName.trim(),
    customerId,
    email,
    apiReady: missingAdsEnv().length === 0,
    neverTouch: isNeverTouch(e.displayName),
    inviteCards: cards.map((c) => ({ kind: c.kind, status: c.status, detail: (c.detail ?? {}) as Record<string, unknown> })),
  })
  const legal = advertiserLegalFrom(intake.legal)
  if (legal) await mergeEvidence(ads.id, { advertiserLegal: legal })
  if (decision.action === 'draft') {
    const prev = ev.billingInvite as { mode?: string; reason?: string } | undefined
    if (prev?.mode !== 'draft' || prev.reason !== decision.reason) {
      await mergeEvidence(ads.id, { billingInvite: { mode: 'draft', reason: decision.reason, email, customerId, at: new Date().toISOString() } })
      await db.opsActivity.create({ data: { engagementId, kind: 'note', body: `Google Ads billing: ${decision.reason}, so the billing steps are a Ready-to-send draft for you to check. Nothing was sent.` } })
    }
    return decision
  }
  if (decision.action !== 'card') return decision
  const job = await db.opsJob.create({ data: { prompt: `Google Ads billing invite for ${e.displayName.trim()}`, status: 'awaiting_approval', engagementIds: [engagementId] } })
  const run = await createRun({ agent: 'ads', kind: 'ads_task', mode: 'work', engagementId, jobId: job.id, input: { billingInvite: true, customerId } })
  const a = await db.opsApproval.create({
    data: { jobId: job.id, runId: run.id, agent: 'ads', kind: 'ads_invite', title: decision.title, detail: decision.detail as Prisma.InputJsonObject, expected: decision.expected },
  })
  await mergeEvidence(ads.id, { billingInvite: { mode: 'card', approvalId: a.id, at: new Date().toISOString() } })
  return { ...decision, approvalId: a.id }
}

/** Push of an ads_invite failed: the steps become a Ready-to-send draft. */
export async function inviteRefused(engagementId: string, message: string): Promise<void> {
  if (!adsBillingInviteEnabled()) return
  const ads = await db.deliverable.findUnique({ where: { engagementId_type: { engagementId, type: 'ads' } }, select: { id: true, evidence: true } })
  if (!ads) return
  const ev = (ads.evidence ?? {}) as Record<string, unknown>
  const c = await db.engagement.findUnique({ where: { id: engagementId }, select: { intake: true } })
  const intake = readIntake(c?.intake) as IntakeLike
  await mergeEvidence(ads.id, {
    billingInvite: { mode: 'draft', reason: 'Google refused the invite', detail: message.slice(0, 300), email: q17Email(intake.ads?.accountEmail, intake.questionnaire?.answers?.['17']), customerId: ev.adsCustomerId ?? null, at: new Date().toISOString() },
  })
  await db.opsActivity.create({ data: { engagementId, kind: 'note', body: 'Google Ads billing invite refused by Google; the billing steps are a Ready-to-send draft for you to check. Nothing was sent.' } })
}
