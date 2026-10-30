// ===========================================
// POST /api/admin/ops/engagements/[id]/assets/token: browser upload token
// ===========================================
// The intake page uploads files straight from the browser to Vercel Blob, so
// no file ever passes through a function body (Vercel caps those near 4.5 MB).
// This answers @vercel/blob/client's upload() with a short-lived token that
// only allows a path under ops-intake/{id}/, the kind's content types
// (UPLOAD_TYPES) and MAX_SOURCE_BYTES. The page converts HEIC and shrinks big
// photos first; the file is then registered with POST .../assets.

import { NextResponse } from 'next/server'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { requireAdmin } from '@/lib/pipeline-server'
import { db } from '@/lib/db'
import { MAX_SOURCE_BYTES, UPLOAD_TYPES } from '@/lib/ops/intake'
import { assetPrefix } from '@/lib/ops/intake-server'

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
        const kind = (JSON.parse(clientPayload || '{}') as { kind?: string }).kind
        const types = UPLOAD_TYPES[kind as keyof typeof UPLOAD_TYPES]
        if (!types) throw new Error('kind must be photo, logo or document')
        return { allowedContentTypes: types, maximumSizeInBytes: MAX_SOURCE_BYTES, addRandomSuffix: false }
      },
    })
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Upload refused' }, { status: 400 })
  }
}
