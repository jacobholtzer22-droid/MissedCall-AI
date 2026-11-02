// ===========================================
// POST /api/portal/intake/assets: register an uploaded file (PORTAL_INTAKE_WIZARD)
// ===========================================
// The intake link's rules exactly (registerIntakeAsset narrowed to photo, logo
// and video, no caption or hero from the client, the file cap), on the
// signed-in client's own record only.

import { NextResponse } from 'next/server'
import { CLIENT_LINK_MAX_FILES } from '@/lib/ops/client-intake'
import { portalGuard } from '@/lib/ops/intake-wizard-server'
import { registerIntakeAsset } from '@/lib/ops/intake-server'
import { wizardView, type IntakeWithWizard } from '@/lib/ops/intake-wizard'
import { BadRequest } from '@/lib/ops/validate'

export const dynamic = 'force-dynamic'

const CLIENT_KEYS = ['url', 'filename', 'kind', 'width', 'height', 'frames', 'posterUrl', 'duration', 'codec', 'bytes']

export async function POST(request: Request) {
  const g = await portalGuard(request, 'register')
  if ('response' in g) return g.response
  try {
    const { asset, intake } = await registerIntakeAsset(g.client.id, await request.json(), {
      kinds: ['photo', 'logo', 'video'],
      keys: CLIENT_KEYS,
      maxFiles: CLIENT_LINK_MAX_FILES,
      via: 'client_link',
    })
    const view = wizardView({ ...g.client, intake: intake as IntakeWithWizard })
    return NextResponse.json({ ok: true, asset: { filename: asset.filename, kind: asset.kind }, intake: { assets: view.files }, view })
  } catch (err) {
    if (err instanceof BadRequest) return NextResponse.json({ error: err.message }, { status: 400 })
    console.error('[portal intake] file save failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Could not save the file. Try again.' }, { status: 500 })
  }
}
