// ===========================================
// POST /api/admin/ops/hq/attachments/token: browser upload token for the HQ chat
// ===========================================
// The twin of /api/admin/ops/engagements/[id]/assets/token for photos dropped
// on the chief's composer: the same @vercel/blob/client handshake, the same
// content types and size cap, but a path under ops-inbox/ (the client is not
// known yet). No file passes through this function. The chief later files
// them onto a client's intake (file_photos).

import { NextResponse } from 'next/server'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { requireAdmin } from '@/lib/pipeline-server'
import { MAX_SOURCE_BYTES, UPLOAD_TYPES } from '@/lib/ops/intake'
import { INBOX_PREFIX } from '@/lib/ops/photo-filing'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const body = (await request.json()) as HandleUploadBody
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith(INBOX_PREFIX) || pathname.slice(INBOX_PREFIX.length).includes('/')) throw new Error('upload path is not the HQ inbox')
        return { allowedContentTypes: UPLOAD_TYPES.logo, maximumSizeInBytes: MAX_SOURCE_BYTES, addRandomSuffix: false }
      },
    })
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Upload refused' }, { status: 400 })
  }
}
