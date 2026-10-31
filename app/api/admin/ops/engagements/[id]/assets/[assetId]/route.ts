// ===========================================
// /api/admin/ops/engagements/[id]/assets/[assetId]
//   PATCH  — caption, heroCandidate, service, beforeAfter of one asset; for a
//            video also happens and heroVideo (one per client: setting it
//            clears it on every other video), never heroCandidate
//   DELETE — remove the entry and its blobs (a video's frames too)
// ===========================================

import { NextResponse } from 'next/server'
import { del } from '@vercel/blob'
import { requireAdmin } from '@/lib/pipeline-server'
import { assetUrls, type IntakeAsset } from '@/lib/ops/intake'
import { isOwnAssetUrl, updateIntake } from '@/lib/ops/intake-server'
import { BadRequest, optionalString, readJsonObject, rejectUnknownKeys } from '@/lib/ops/validate'

export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string; assetId: string } }

export async function PATCH(request: Request, context: Ctx) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const body = readJsonObject(await request.json())
    rejectUnknownKeys(body, ['caption', 'heroCandidate', 'service', 'beforeAfter', 'happens', 'heroVideo'])
    let found = false
    let notVideo = false
    const intake = await updateIntake(context.params.id, (cur) => ({
      ...cur,
      assets: (cur.assets ?? []).map((a) => {
        // One hero video per client: turning it on for this one turns it off everywhere else.
        if (a.id !== context.params.assetId) return body.heroVideo === true && a.heroVideo ? { ...a, heroVideo: undefined } : a
        found = true
        const next: IntakeAsset = { ...a }
        const video = a.kind === 'video'
        if (!video && ('happens' in body || 'heroVideo' in body)) notVideo = true
        if (video && body.heroCandidate === true) notVideo = true
        if ('caption' in body) next.caption = optionalString(body.caption, 'caption', 300) ?? undefined
        if ('heroCandidate' in body && !video) next.heroCandidate = body.heroCandidate === true || undefined
        if ('happens' in body && video) next.happens = optionalString(body.happens, 'happens', 300) ?? undefined
        if ('heroVideo' in body && video) next.heroVideo = body.heroVideo === true || undefined
        if ('service' in body) next.service = optionalString(body.service, 'service', 200) ?? undefined
        if ('beforeAfter' in body) next.beforeAfter = body.beforeAfter === 'before' || body.beforeAfter === 'after' ? body.beforeAfter : undefined
        return next
      }),
      updatedAt: new Date().toISOString(),
    }))
    if (!found) return NextResponse.json({ error: 'Asset not found' }, { status: 404 })
    if (notVideo) return NextResponse.json({ error: 'happens and heroVideo are for videos; heroCandidate is for photos' }, { status: 400 })
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
    let urls: string[] = []
    const intake = await updateIntake(context.params.id, (cur) => {
      const found = (cur.assets ?? []).find((a) => a.id === context.params.assetId)
      urls = found ? assetUrls(found) : []
      return { ...cur, assets: (cur.assets ?? []).filter((a) => a.id !== context.params.assetId), updatedAt: new Date().toISOString() }
    })
    if (!urls.length) return NextResponse.json({ error: 'Asset not found' }, { status: 404 })
    // Only ever delete a blob under this client's own prefix.
    const own = urls.filter((u) => isOwnAssetUrl(u, context.params.id))
    if (own.length) await del(own).catch(() => undefined)
    return NextResponse.json({ ok: true, intake })
  } catch (err) {
    console.error('[admin/ops/assets] DELETE failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  }
}
