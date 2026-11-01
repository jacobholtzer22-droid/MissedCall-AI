// ===========================================
// POST /api/intake/[token]/assets/token: browser upload token (CLIENT_INTAKE_LINK)
// ===========================================
// The client's half of the admin .../assets/token route, same rules through
// lib/ops/intake-server.ts uploadTokenOptions, narrower: photos (and videos)
// and the logo only, no documents; the path must sit under this client's own
// ops-intake/{id}/ prefix; and the link refuses once the client holds
// CLIENT_LINK_MAX_FILES files. The engagement comes from the token, never the body.

import { NextResponse } from 'next/server'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { CLIENT_LINK_MAX_FILES, LINK_UPLOAD_KINDS } from '@/lib/ops/client-intake'
import { guard, resolveClientLink } from '@/lib/ops/client-intake-server'
import { uploadTokenOptions } from '@/lib/ops/intake-server'

export const dynamic = 'force-dynamic'

export async function POST(request: Request, context: { params: { token: string } }) {
  const g = await guard(request, context.params.token, 'token')
  if ('response' in g) return g.response
  const id = g.client.id
  try {
    const body = (await request.json()) as HandleUploadBody
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        // Re-read: a long upload session must not outlive a revoked link or the file cap.
        const fresh = await resolveClientLink(context.params.token)
        if (!fresh || fresh.id !== id) throw new Error('This link no longer works')
        if ((fresh.intake.assets ?? []).length >= CLIENT_LINK_MAX_FILES) throw new Error(`No more files can be added here (${CLIENT_LINK_MAX_FILES} on file)`)
        return uploadTokenOptions(id, pathname, clientPayload, LINK_UPLOAD_KINDS)
      },
    })
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Upload refused' }, { status: 400 })
  }
}
