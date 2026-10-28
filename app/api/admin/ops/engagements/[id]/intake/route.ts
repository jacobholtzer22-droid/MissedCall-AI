// ===========================================
// /api/admin/ops/engagements/[id]/intake
//   GET   — the client's intake (Engagement.intake)
//   PATCH — merge a partial intake: top-level keys, objects one level deep,
//           arrays replaced. assets change only through the assets routes.
// ===========================================

import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/pipeline-server'
import { INTAKE_KEYS } from '@/lib/ops/intake'
import { loadIntake, patchIntake } from '@/lib/ops/intake-server'
import { BadRequest, readJsonObject, rejectUnknownKeys } from '@/lib/ops/validate'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, context: { params: { id: string } }) {
  const denied = await requireAdmin()
  if (denied) return denied
  const r = await loadIntake(context.params.id)
  if (!r) return NextResponse.json({ error: 'Engagement not found' }, { status: 404 })
  return NextResponse.json(r)
}

export async function PATCH(request: Request, context: { params: { id: string } }) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const body = readJsonObject(await request.json())
    rejectUnknownKeys(body, INTAKE_KEYS.filter((k) => k !== 'assets'))
    if (JSON.stringify(body).length > 200_000) throw new BadRequest('intake is too large')
    const intake = await patchIntake(context.params.id, body)
    return NextResponse.json({ ok: true, intake })
  } catch (err) {
    if (err instanceof BadRequest) return NextResponse.json({ error: err.message }, { status: 400 })
    if (err instanceof Error && err.message === 'Engagement not found') return NextResponse.json({ error: err.message }, { status: 404 })
    console.error('[admin/ops/intake] PATCH failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  }
}
