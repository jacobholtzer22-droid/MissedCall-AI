// ===========================================
// POST /api/admin/ops/engagements/[id]/assets: register an uploaded file
// ===========================================
// Body { url, filename, kind, width?, height?, caption?, heroCandidate?,
// service?, beforeAfter? } after the browser uploaded to Blob (see ./token).
// The URL must be a public Blob URL under ops-intake/{id}/: assets are never
// taken from anywhere else, and the record is written only once Blob confirms
// the file exists (head). Appends to Engagement.intake.assets under a row
// lock; a filename already used by this client gets " (2)", " (3)" (the blob
// paths never collide: each carries a uuid). A new logo replaces the old one
// (its blob is deleted).

import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { BlobNotFoundError, del, head } from '@vercel/blob'
import { requireAdmin } from '@/lib/pipeline-server'
import { uniqueFilename, type IntakeAsset } from '@/lib/ops/intake'
import { HEIC_MESSAGE, isOwnAssetUrl, updateIntake } from '@/lib/ops/intake-server'
import { BadRequest, oneOf, optionalString, readJsonObject, rejectUnknownKeys } from '@/lib/ops/validate'

export const dynamic = 'force-dynamic'

export async function POST(request: Request, context: { params: { id: string } }) {
  const denied = await requireAdmin()
  if (denied) return denied
  const id = context.params.id
  try {
    const body = readJsonObject(await request.json())
    rejectUnknownKeys(body, ['url', 'filename', 'kind', 'width', 'height', 'caption', 'heroCandidate', 'service', 'beforeAfter'])
    const url = typeof body.url === 'string' ? body.url : ''
    if (!isOwnAssetUrl(url, id)) throw new BadRequest('url is not an upload for this client')
    const filename = optionalString(body.filename, 'filename', 200) ?? url.split('/').pop()!
    if (/\.(heic|heif)$/i.test(filename)) throw new BadRequest(HEIC_MESSAGE)
    const kind = oneOf(body.kind, ['photo', 'logo', 'document'] as const, 'kind')
    const width = pixels(body.width, 'width')
    const height = pixels(body.height, 'height')
    try {
      await head(url)
    } catch (err) {
      if (err instanceof BlobNotFoundError) throw new BadRequest('That file is not in storage; upload it again')
      throw err
    }
    const asset: IntakeAsset = {
      id: randomUUID(),
      url,
      filename,
      kind,
      ...(width && height ? { width, height } : {}),
      ...(optionalString(body.caption, 'caption', 300) ? { caption: optionalString(body.caption, 'caption', 300)! } : {}),
      ...(body.heroCandidate === true ? { heroCandidate: true } : {}),
      ...(optionalString(body.service, 'service', 200) ? { service: optionalString(body.service, 'service', 200)! } : {}),
      ...(body.beforeAfter === 'before' || body.beforeAfter === 'after' ? { beforeAfter: body.beforeAfter } : {}),
      uploadedAt: new Date().toISOString(),
    }
    let replaced: string[] = []
    const intake = await updateIntake(id, (cur) => {
      const others = (cur.assets ?? []).filter((a) => !(kind === 'logo' && a.kind === 'logo'))
      replaced = (cur.assets ?? []).filter((a) => kind === 'logo' && a.kind === 'logo').map((a) => a.url)
      asset.filename = uniqueFilename(filename, others.map((a) => a.filename))
      return { ...cur, assets: [...others, asset], updatedAt: new Date().toISOString() }
    })
    if (replaced.length) await del(replaced).catch(() => undefined)
    return NextResponse.json({ ok: true, asset, intake })
  } catch (err) {
    if (err instanceof BadRequest) return NextResponse.json({ error: err.message }, { status: 400 })
    if (err instanceof Error && err.message === 'Engagement not found') return NextResponse.json({ error: err.message }, { status: 404 })
    console.error('[admin/ops/assets] POST failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to save the file' }, { status: 500 })
  }
}

/** An optional pixel size: a whole number from 1 to 50000, or left out. */
function pixels(v: unknown, field: string): number | null {
  if (v === undefined || v === null) return null
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 50_000) throw new BadRequest(`${field} must be a whole number of pixels`)
  return v
}
