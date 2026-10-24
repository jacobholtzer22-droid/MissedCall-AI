// ===========================================
// PATCH /api/admin/ops/deliverables/[id] — step, manual status and evidence
// ===========================================
// Body (any of):
//   manualStatus      DeliverableStatus, or null to clear. Stamps manualStatusAt
//                     (null when cleared). Wins over computedStatus in the UI.
//   manualStatusNote  string or null
//   evidence          { key: string | null } merged key by key into the stored
//                     object, never replacing it. null removes that one key.
//                     Only EVIDENCE_KEYS; the sync-owned keys (telnyxNumber,
//                     adsCustomerId) are not editable here.
//   step              a key from STEP_CATALOG for this deliverable's type, or
//                     null to clear. Stamps stepUpdatedAt and sets waitingOn to
//                     the step's owner (null for 'none'), unless waitingOn is
//                     also sent.
//   waitingOn         jacob | client | vendor | null: override who it waits on.
//   waitingNote       string or null: the specifics ("phone plan change").
// computedStatus is never written here; that is the sync's.

import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/pipeline-server'
import { DELIVERABLE_STATUSES } from '@/lib/ops/types'
import { EVIDENCE_KEYS } from '@/lib/ops/evidence'
import { STEP_CATALOG, WAITING_ON, defaultWaitingOn, stepFor } from '@/lib/ops/steps'
import { BadRequest, nullableString, oneOf, readJsonObject, rejectUnknownKeys } from '@/lib/ops/validate'

export const dynamic = 'force-dynamic'

export async function PATCH(request: Request, context: { params: { id: string } }) {
  const denied = await requireAdmin()
  if (denied) return denied
  const id = context.params.id

  try {
    const body = readJsonObject(await request.json())
    rejectUnknownKeys(body, ['manualStatus', 'manualStatusNote', 'evidence', 'step', 'waitingOn', 'waitingNote'])

    const current = await db.deliverable.findUnique({ where: { id }, select: { evidence: true, type: true } })
    if (!current) return NextResponse.json({ error: 'Deliverable not found' }, { status: 404 })

    const data: Prisma.DeliverableUpdateInput = {}
    if ('manualStatus' in body) {
      const status = body.manualStatus === null ? null : oneOf(body.manualStatus, DELIVERABLE_STATUSES, 'manualStatus')
      data.manualStatus = status
      data.manualStatusAt = status ? new Date() : null
    }
    if ('manualStatusNote' in body) data.manualStatusNote = nullableString(body.manualStatusNote, 'manualStatusNote', 500)
    if ('step' in body) {
      const key = body.step === null ? null : nullableString(body.step, 'step', 64)
      if (key !== null && !stepFor(current.type, key)) {
        const valid = (STEP_CATALOG[current.type as keyof typeof STEP_CATALOG] ?? []).map((st) => st.key)
        throw new BadRequest(`step "${key}" is not a ${current.type} step. Valid: ${valid.join(', ')}`)
      }
      data.step = key
      data.stepUpdatedAt = new Date()
      if (!('waitingOn' in body)) data.waitingOn = defaultWaitingOn(current.type, key)
    }
    if ('waitingOn' in body) data.waitingOn = body.waitingOn === null ? null : oneOf(body.waitingOn, WAITING_ON, 'waitingOn')
    if ('waitingNote' in body) data.waitingNote = nullableString(body.waitingNote, 'waitingNote', 500)
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
