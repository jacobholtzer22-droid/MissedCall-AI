// ===========================================
// POST /api/intake/[token]/assets: register an uploaded file (CLIENT_INTAKE_LINK)
// ===========================================
// lib/ops/intake-server.ts registerIntakeAsset, the same checks and row-locked
// write as the admin route, narrowed for a client: kinds photo, logo and
// video only; no caption, hero, service or before/after from the client (the
// Photo desk and Jacob set those); the file cap; stamped via client_link. The
// answer carries only file names, never the stored intake.

import { NextResponse } from 'next/server'
import { CLIENT_LINK_MAX_FILES, publicView, type IntakeWithLink } from '@/lib/ops/client-intake'
import { guard } from '@/lib/ops/client-intake-server'
import { registerIntakeAsset } from '@/lib/ops/intake-server'
import { BadRequest } from '@/lib/ops/validate'

export const dynamic = 'force-dynamic'

const CLIENT_KEYS = ['url', 'filename', 'kind', 'width', 'height', 'frames', 'posterUrl', 'duration', 'codec', 'bytes']

export async function POST(request: Request, context: { params: { token: string } }) {
  const g = await guard(request, context.params.token, 'register')
  if ('response' in g) return g.response
  try {
    const { asset, intake } = await registerIntakeAsset(g.client.id, await request.json(), {
      kinds: ['photo', 'logo', 'video'],
      keys: CLIENT_KEYS,
      maxFiles: CLIENT_LINK_MAX_FILES,
      via: 'client_link',
    })
    const view = publicView({ ...g.client, intake: intake as IntakeWithLink })
    // `intake.assets` keeps the shape the shared Uploader reads; names and kinds only.
    return NextResponse.json({ ok: true, asset: { filename: asset.filename, kind: asset.kind }, intake: { assets: view.files }, view })
  } catch (err) {
    if (err instanceof BadRequest) return NextResponse.json({ error: err.message }, { status: 400 })
    console.error('[intake link] file save failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Could not save the file. Try again.' }, { status: 500 })
  }
}
