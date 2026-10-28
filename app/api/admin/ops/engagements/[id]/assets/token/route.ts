// ===========================================
// POST /api/admin/ops/engagements/[id]/assets/token — browser upload token
// ===========================================
// The intake page uploads files straight from the browser to Vercel Blob
// (a route body is capped near 4.5 MB on Vercel; photos are up to 15 MB).
// This answers @vercel/blob/client's upload() with a short-lived token that
// only allows a path under ops-intake/{id}/, the kind's content types and
// 15 MB. The file is then registered with POST .../assets.

import { NextResponse } from 'next/server'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { requireAdmin } from '@/lib/pipeline-server'
import { db } from '@/lib/db'
import { ASSET_TYPES, MAX_ASSET_BYTES, assetPrefix } from '@/lib/ops/intake-server'

export const dynamic = 'force-dynamic'

export async function POST(request: Request, context: { params: { id: string } }) {
  const denied = await requireAdmin()
  if (denied) return denied
  const id = context.params.id
  const exists = await db.engagement.findUnique({ where: { id }, select: { id: true } })
  if (!exists) return NextResponse.json({ error: 'Engagement not found' }, { status: 404 })
  try {
    const body = (await request.json()) as HandleUploadBody
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        if (!pathname.startsWith(assetPrefix(id))) throw new Error('upload path is not this client')
        if (/\.(heic|heif)$/i.test(pathname)) throw new Error('HEIC is not accepted; export as JPG')
        const kind = (JSON.parse(clientPayload || '{}') as { kind?: string }).kind
        const types = ASSET_TYPES[kind as keyof typeof ASSET_TYPES]
        if (!types) throw new Error('kind must be photo, logo or document')
        return { allowedContentTypes: types, maximumSizeInBytes: MAX_ASSET_BYTES, addRandomSuffix: false }
      },
    })
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Upload refused' }, { status: 400 })
  }
}
