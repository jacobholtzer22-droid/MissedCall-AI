// ===========================================
// PATCH /api/admin/ops/deliverables/[id] — manual status and evidence
// ===========================================
// Body (any of):
//   manualStatus      DeliverableStatus, or null to clear. Stamps manualStatusAt
//                     (null when cleared). Wins over computedStatus in the UI.
//   manualStatusNote  string or null
//   evidence          { key: string | null } merged key by key into the stored
//                     object, never replacing it. null removes that one key.
//                     Only EVIDENCE_KEYS; the sync-owned keys (telnyxNumber,
//                     adsCustomerId) are not editable here.
// computedStatus is never written here; that is the sync's.

import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/pipeline-server'
import { DELIVERABLE_STATUSES } from '@/lib/ops/types'
import { EVIDENCE_KEYS } from '@/lib/ops/evidence'
import { BadRequest, nullableString, oneOf, readJsonObject, rejectUnknownKeys } from '@/lib/ops/validate'

export const dynamic = 'force-dynamic'

export async function PATCH(request: Request, context: { params: { id: string } }) {
  const denied = await requireAdmin()
  if (denied) return denied
  const id = context.params.id

  try {
    const body = readJsonObject(await request.json())
    rejectUnknownKeys(body, ['manualStatus', 'manualStatusNote', 'evidence'])

    const current = await db.deliverable.findUnique({ where: { id }, select: { evidence: true } })
    if (!current) return NextResponse.json({ error: 'Deliverable not found' }, { status: 404 })

    const data: Prisma.DeliverableUpdateInput = {}
    if ('manualStatus' in body) {
      const status = body.manualStatus === null ? null : oneOf(body.manualStatus, DELIVERABLE_STATUSES, 'manualStatus')
      data.manualStatus = status
      data.manualStatusAt = status ? new Date() : null
    }
    if ('manualStatusNote' in body) data.manualStatusNote = nullableString(body.manualStatusNote, 'manualStatusNote', 500)
    if ('evidence' in body) {
      const patch = readJsonObject(body.evidence)
      rejectUnknownKeys(patch, EVIDENCE_KEYS, 'evidence key')
      const merged: Record<string, unknown> =
        current.evidence && typeof current.evidence === 'object' && !Array.isArray(current.evidence)
          ? { ...(current.evidence as Record<string, unknown>) }
          : {}
      for (const [k, v] of Object.entries(patch)) {
        const value = nullableString(v, `evidence.${k}`, 500)
        if (value === null) delete merged[k]
        else merged[k] = value
      }
      data.evidence = merged as Prisma.InputJsonObject
    }

    await db.deliverable.update({ where: { id }, data })
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof BadRequest) return NextResponse.json({ error: err.message }, { status: 400 })
    console.error('[admin/ops/deliverables] PATCH failed:', err)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}
