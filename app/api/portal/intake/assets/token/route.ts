// ===========================================
// POST /api/portal/intake/assets/token: browser upload token (PORTAL_INTAKE_WIZARD)
// ===========================================
// The intake link's token route on the signed-in client's own record: photos,
// videos and the logo only, under that record's own ops-intake/{id}/ prefix,
// refused at the file cap.

import { NextResponse } from 'next/server'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { CLIENT_LINK_MAX_FILES, LINK_UPLOAD_KINDS } from '@/lib/ops/client-intake'
import { portalGuard } from '@/lib/ops/intake-wizard-server'
import { uploadTokenOptions } from '@/lib/ops/intake-server'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const g = await portalGuard(request, 'token')
  if ('response' in g) return g.response
  const id = g.client.id
  try {
    const body = (await request.json()) as HandleUploadBody
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        if ((g.client.intake.assets ?? []).length >= CLIENT_LINK_MAX_FILES) throw new Error(`No more files can be added here (${CLIENT_LINK_MAX_FILES} on file)`)
        return uploadTokenOptions(id, pathname, clientPayload, LINK_UPLOAD_KINDS)
      },
    })
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Upload refused' }, { status: 400 })
  }
}
