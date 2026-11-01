// ===========================================
// POST /api/admin/ops/engagements/[id]/assets: register an uploaded file
// ===========================================
// Body { url, filename, kind, width?, height?, caption?, heroCandidate?,
// service?, beforeAfter? } after the browser uploaded to Blob (see ./token).
// A video (kind video) also brings frames [{ url, time }], posterUrl?,
// duration?, codec? and bytes? (lib/ops/intake readVideoFields); its frames
// must sit beside it under the same prefix. A video is never a hero
// candidate.
// The URL must be a public Blob URL under ops-intake/{id}/: assets are never
// taken from anywhere else, and the record is written only once Blob confirms
// the file exists (head). Appends to Engagement.intake.assets under a row
// lock; a filename already used by this client gets " (2)", " (3)" (the blob
// paths never collide: each carries a uuid). A new logo replaces the old one
// (its blob is deleted).

import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/pipeline-server'
import { registerIntakeAsset } from '@/lib/ops/intake-server'
import { BadRequest } from '@/lib/ops/validate'

export const dynamic = 'force-dynamic'

export async function POST(request: Request, context: { params: { id: string } }) {
  const denied = await requireAdmin()
  if (denied) return denied
  const id = context.params.id
  try {
    // The checks and the write live in lib/ops/intake-server.ts registerIntakeAsset,
    // shared with the client's intake link.
    const { asset, intake } = await registerIntakeAsset(id, await request.json())
    return NextResponse.json({ ok: true, asset, intake })
  } catch (err) {
    if (err instanceof BadRequest) return NextResponse.json({ error: err.message }, { status: 400 })
    if (err instanceof Error && err.message === 'Engagement not found') return NextResponse.json({ error: err.message }, { status: 404 })
    console.error('[admin/ops/assets] POST failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to save the file' }, { status: 500 })
  }
}
