// ===========================================
// POST /api/admin/ops/engagements/[id]/provision — create a client site
// ===========================================
// Body: { repoName?, dry }. Private repo from AA-Template, its two Actions
// secrets, a linked Vercel project, website evidence, step build, activity.
// See lib/ops/agents/provision.ts. dry (the default) returns the plan only.

import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/pipeline-server'
import { provisionSite } from '@/lib/ops/agents/provision'
import { BadRequest, nullableString, readJsonObject, rejectUnknownKeys } from '@/lib/ops/validate'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(request: Request, context: { params: { id: string } }) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const body = readJsonObject(await request.json())
    rejectUnknownKeys(body, ['repoName', 'dry'])
    const dry = body.dry !== false
    const repoName = 'repoName' in body ? nullableString(body.repoName, 'repoName', 100) ?? undefined : undefined
    const result = await provisionSite(context.params.id, { repoName, dry })
    const status = result.blocked.length > 0 ? 409 : result.ok ? 200 : 502
    return NextResponse.json(result, { status })
  } catch (err) {
    if (err instanceof BadRequest) return NextResponse.json({ error: err.message }, { status: 400 })
    console.error('[admin/ops/provision] failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Provisioning failed' }, { status: 500 })
  }
}
