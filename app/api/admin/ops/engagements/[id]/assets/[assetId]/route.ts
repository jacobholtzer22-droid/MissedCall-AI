// ===========================================
// /api/admin/ops/engagements/[id]/assets/[assetId]
//   PATCH  — caption, heroCandidate, service, beforeAfter of one asset
//   DELETE — remove the entry and its blob
// ===========================================

import { NextResponse } from 'next/server'
import { del } from '@vercel/blob'
import { requireAdmin } from '@/lib/pipeline-server'
import type { IntakeAsset } from '@/lib/ops/intake'
import { isOwnAssetUrl, updateIntake } from '@/lib/ops/intake-server'
import { BadRequest, optionalString, readJsonObject, rejectUnknownKeys } from '@/lib/ops/validate'

export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string; assetId: string } }

export async function PATCH(request: Request, context: Ctx) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const body = readJsonObject(await request.json())
    rejectUnknownKeys(body, ['caption', 'heroCandidate', 'service', 'beforeAfter'])
    let found = false
    const intake = await updateIntake(context.params.id, (cur) => ({
      ...cur,
      assets: (cur.assets ?? []).map((a) => {
        if (a.id !== context.params.assetId) return a
        found = true
        const next: IntakeAsset = { ...a }
        if ('caption' in body) next.caption = optionalString(body.caption, 'caption', 300) ?? undefined
        if ('heroCandidate' in body) next.heroCandidate = body.heroCandidate === true || undefined
        if ('service' in body) next.service = optionalString(body.service, 'service', 200) ?? undefined
        if ('beforeAfter' in body) next.beforeAfter = body.beforeAfter === 'before' || body.beforeAfter === 'after' ? body.beforeAfter : undefined
        return next
      }),
      updatedAt: new Date().toISOString(),
    }))
    if (!found) return NextResponse.json({ error: 'Asset not found' }, { status: 404 })
    return NextResponse.json({ ok: true, intake })
  } catch (err) {
    if (err instanceof BadRequest) return NextResponse.json({ error: err.message }, { status: 400 })
    console.error('[admin/ops/assets] PATCH failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  }
}

export async function DELETE(_request: Request, context: Ctx) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    let url: string | null = null
    const intake = await updateIntake(context.params.id, (cur) => {
      url = (cur.assets ?? []).find((a) => a.id === context.params.assetId)?.url ?? null
      return { ...cur, assets: (cur.assets ?? []).filter((a) => a.id !== context.params.assetId), updatedAt: new Date().toISOString() }
    })
    if (!url) return NextResponse.json({ error: 'Asset not found' }, { status: 404 })
    // Only ever delete a blob under this client's own prefix.
    if (isOwnAssetUrl(url, context.params.id)) await del(url).catch(() => undefined)
    return NextResponse.json({ ok: true, intake })
  } catch (err) {
    console.error('[admin/ops/assets] DELETE failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  }
}
