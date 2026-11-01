// DUPLICATE_GUARD: the board rows lib/ops/duplicate-guard.ts matches against, the
// "Link to existing" card, and what Push does with it. Database only.

import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { createRun } from '@/lib/ops/hq/runs'
import { LINK_CARD_KIND, likelyMatches, linkCardExpected, linkCardTitle, type Candidate, type DuplicateMatch, type PoolEntry } from '@/lib/ops/duplicate-guard'

export async function loadPool(): Promise<PoolEntry[]> {
  const [engs, biz] = await Promise.all([
    db.engagement.findMany({ where: { stage: { not: 'ignored' } }, select: { id: true, displayName: true, email: true, phone: true, businessId: true } }),
    db.business.findMany({ select: { id: true, name: true, ownerEmail: true, ownerPhone: true, forwardingNumber: true } }),
  ])
  const engFor = new Map(engs.filter((e) => e.businessId).map((e) => [e.businessId!, e.id]))
  return [
    ...engs.map((e): PoolEntry => ({ kind: 'engagement', id: e.id, name: e.displayName, email: e.email, phones: [e.phone], engagementId: e.id, businessId: e.businessId })),
    ...biz.map((b): PoolEntry => ({ kind: 'business', id: b.id, name: b.name, email: b.ownerEmail, phones: [b.ownerPhone, b.forwardingNumber], engagementId: engFor.get(b.id) ?? null, businessId: b.id })),
  ]
}

export async function findLikely(c: Candidate, skip?: { engagementId?: string | null; businessId?: string | null }): Promise<DuplicateMatch[]> {
  return likelyMatches(c, await loadPool(), skip)
}

/** The card. detail.action: same_client (from create_client) or link_business (a platform signup). */
export async function proposeLink(card: { jobId: string; runId: string }, newName: string, m: DuplicateMatch, detail: Record<string, unknown>): Promise<string> {
  const a = await db.opsApproval.create({
    data: {
      jobId: card.jobId,
      runId: card.runId,
      agent: 'chief',
      kind: LINK_CARD_KIND,
      title: linkCardTitle(m.entry.name),
      detail: { ...detail, newName, existing: { kind: m.entry.kind, id: m.entry.id, name: m.entry.name, engagementId: m.entry.engagementId, businessId: m.entry.businessId }, matchedOn: m.on } as Prisma.InputJsonObject,
      expected: linkCardExpected(newName, m),
    },
  })
  await db.opsJob.update({ where: { id: card.jobId }, data: { status: 'awaiting_approval' } })
  if (m.entry.engagementId) {
    await db.opsActivity.create({ data: { engagementId: m.entry.engagementId, kind: 'note', body: `Possible duplicate: ${newName.trim()} looks like this client (same ${m.on.join(', ')}). Nothing new was created; the Link card waits for Jacob.` } })
  }
  return a.id
}

/**
 * Push. same_client: nothing is created, a note says so. link_business: the
 * existing client gains the signup's platform account only when it has none
 * (conditional, never repoints); otherwise both accounts stay and a note says
 * to merge them by hand. Nothing is deleted.
 */
export async function applyLinkCard(detail: Record<string, unknown>): Promise<string> {
  const existing = (detail.existing ?? {}) as { engagementId?: string | null; name?: string }
  const engagementId = typeof existing.engagementId === 'string' ? existing.engagementId : null
  const newName = String(detail.newName ?? 'the new client')
  if (detail.action === 'link_business' && typeof detail.businessId === 'string' && engagementId) {
    const linked = await db.engagement.updateMany({ where: { id: engagementId, businessId: null }, data: { businessId: detail.businessId } })
    const line = linked.count
      ? `Linked the platform signup ${newName} to this client (Jacob pushed the Link card).`
      : `Jacob confirmed the platform signup ${newName} is this client. This client already has a platform account, so the second one stays as it is: merge them by hand.`
    await db.opsActivity.create({ data: { engagementId, kind: 'note', body: line } })
    return line
  }
  const line = `Jacob confirmed ${newName} is this client; no second client was created.`
  if (engagementId) await db.opsActivity.create({ data: { engagementId, kind: 'note', body: line } })
  return line
}

/**
 * The sync is about to make an Engagement for an unlinked platform signup. With a
 * likely match, propose the card once (under its own job) and skip; a rejected card
 * means "different client", so the sync goes ahead.
 */
export async function holdSignupIfDuplicate(b: { id: string; name: string; ownerEmail: string | null; ownerPhone: string | null; forwardingNumber: string | null }, dryRun: boolean): Promise<string | null> {
  const matches = await findLikely({ name: b.name, email: b.ownerEmail, phones: [b.ownerPhone, b.forwardingNumber] }, { businessId: b.id })
  if (!matches.length) return null
  const cards = await db.opsApproval.findMany({ where: { kind: LINK_CARD_KIND, detail: { path: ['businessId'], equals: b.id } }, select: { status: true } })
  if (cards.length && cards.every((c) => c.status === 'rejected')) return null
  const m = matches[0]
  const reason = `likely the same client as ${m.entry.name.trim()} (same ${m.on.join(', ')}); not creating a second client`
  if (dryRun || cards.length) return reason
  const job = await db.opsJob.create({ data: { prompt: `Possible duplicate platform signup: ${b.name}`, status: 'running', engagementIds: m.entry.engagementId ? [m.entry.engagementId] : [] } })
  const run = await createRun({ agent: 'chief', kind: 'chief', mode: 'work', engagementId: m.entry.engagementId, jobId: job.id, input: { duplicateGuard: true, businessId: b.id } })
  await proposeLink({ jobId: job.id, runId: run.id }, b.name, m, { action: 'link_business', businessId: b.id })
  return reason
}
