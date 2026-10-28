// ===========================================
// Ops HQ: changing a client's platform Business
// ===========================================
// The chief's update_business. Every field goes through prepareBusinessPatch
// (lib/admin-business-patch.ts), the same allowlist and normalisation as PATCH
// /api/admin/businesses/[id]. Fields that reroute live calls or texts
// (ROUTING_FIELDS) are not written: each becomes an OpsApproval of kind
// 'admin_change' (detail: businessId, field, from, to, Jacob's words) and is
// written only when Jacob pushes it. Every other field is written at once and
// logged on the client as a note quoting Jacob.

import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { BUSINESS_PATCH_FIELDS, prepareBusinessPatch } from '@/lib/admin-business-patch'

export const ROUTING_FIELDS = [
  'telnyxPhoneNumber',
  'forwardingNumber',
  'notificationSenderNumber',
  'missedCallAiEnabled',
  'callScreenerEnabled',
  'spamFilterEnabled',
  'knownContactVoicemailEnabled',
] as const

const isRouting = (f: string) => (ROUTING_FIELDS as readonly string[]).includes(f)
const shown = (v: unknown) => (v === null || v === undefined || v === '' ? 'empty' : typeof v === 'object' ? JSON.stringify(v) : String(v))

export type BusinessUpdateResult = {
  business: string
  written: { field: string; from: string; to: string }[]
  waitingForPush: { approvalId: string; field: string; from: string; to: string }[]
}

export async function updateBusiness(opts: {
  businessId: string
  fields: Record<string, unknown>
  words: string
  /** The chief run and its job, which own any approval. */
  runId: string
  jobId: () => Promise<string>
}): Promise<BusinessUpdateResult> {
  const unknown = Object.keys(opts.fields).filter((k) => !(BUSINESS_PATCH_FIELDS as readonly string[]).includes(k))
  if (unknown.length) throw new Error(`not a platform account field: ${unknown.join(', ')}`)
  const prepared = await prepareBusinessPatch(opts.fields)
  if (!prepared.ok) throw new Error(prepared.error)
  const current = await db.business.findUnique({ where: { id: opts.businessId } })
  if (!current) throw new Error(`no platform account with id ${opts.businessId}`)
  const engagement = await db.engagement.findUnique({ where: { businessId: opts.businessId }, select: { id: true, displayName: true } })
  const before = current as unknown as Record<string, unknown>

  const changed = Object.entries(prepared.data).filter(([k, v]) => JSON.stringify(before[k] ?? null) !== JSON.stringify(v ?? null))
  const direct = Object.fromEntries(changed.filter(([k]) => !isRouting(k)))
  const routed = changed.filter(([k]) => isRouting(k))

  const written = Object.entries(direct).map(([field, to]) => ({ field, from: shown(before[field]), to: shown(to) }))
  if (written.length) {
    await db.business.update({ where: { id: opts.businessId }, data: direct })
    if (engagement) {
      await db.opsActivity.create({
        data: {
          engagementId: engagement.id,
          kind: 'note',
          body: `Platform account: ${written.map((w) => `${w.field} ${w.from} to ${w.to}`).join('; ')}. Jacob: "${opts.words}"`,
        },
      })
    }
  }

  const waitingForPush: BusinessUpdateResult['waitingForPush'] = []
  for (const [field, to] of routed) {
    const jobId = await opts.jobId()
    const from = shown(before[field])
    const a = await db.opsApproval.create({
      data: {
        jobId,
        runId: opts.runId,
        agent: 'chief',
        kind: 'admin_change',
        title: `${current.name}: ${field} ${from} to ${shown(to)}`,
        detail: {
          businessId: opts.businessId,
          business: current.name,
          engagementId: engagement?.id ?? null,
          client: engagement?.displayName.trim() ?? current.name,
          field,
          from: before[field] ?? null,
          to: to ?? null,
          words: opts.words,
        } as Prisma.InputJsonObject,
        expected: 'Changes how calls and texts for this client are routed as soon as it is written.',
      },
    })
    waitingForPush.push({ approvalId: a.id, field, from, to: shown(to) })
  }
  if (waitingForPush.length) await db.opsJob.update({ where: { id: await opts.jobId() }, data: { status: 'awaiting_approval' } })

  return { business: current.name, written, waitingForPush }
}

/**
 * Write a pushed admin_change: the one field, re-validated through the same
 * PATCH rules at the moment of writing, then a note on the client. Throws when
 * the value no longer validates (e.g. the number became another client's).
 */
export async function applyAdminChange(detail: Record<string, unknown>): Promise<void> {
  const businessId = String(detail.businessId ?? '')
  const field = String(detail.field ?? '')
  if (!businessId || !isRouting(field)) throw new Error('the approval does not name a platform account routing field')
  const prepared = await prepareBusinessPatch({ [field]: detail.to })
  if (!prepared.ok) throw new Error(prepared.error)
  await db.business.update({ where: { id: businessId }, data: prepared.data })
  const engagementId = typeof detail.engagementId === 'string' ? detail.engagementId : null
  if (engagementId) {
    await db.opsActivity.create({
      data: { engagementId, kind: 'note', body: `Platform account: ${field} ${shown(detail.from)} to ${shown(prepared.data[field])} (pushed by Jacob)` },
    })
  }
}
