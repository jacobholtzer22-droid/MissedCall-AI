// ===========================================
// POST /api/admin/ops/agents/sync-template-files: template-owned files into client repos
// ===========================================
// Body: { only?: [engagementIds], dry }. See
// lib/ops/agents/sync-template-files.ts. dry (the default) lists each repo and
// which files differ, and writes nothing; a real run opens a chore/template-sync
// PR per repo and never commits to a default branch.

import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/pipeline-server'
import { syncTemplateFiles } from '@/lib/ops/agents/sync-template-files'
import { BadRequest, readJsonObject, rejectUnknownKeys } from '@/lib/ops/validate'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const body = readJsonObject(await request.json())
    rejectUnknownKeys(body, ['only', 'dry'])
    if (body.only !== undefined && (!Array.isArray(body.only) || body.only.some((x) => typeof x !== 'string'))) {
      throw new BadRequest('only must be an array of engagement ids')
    }
    const result = await syncTemplateFiles({ only: body.only as string[] | undefined, dry: body.dry !== false })
    return NextResponse.json(result, { status: result.blocked.length > 0 && body.dry === false ? 409 : 200 })
  } catch (err) {
    if (err instanceof BadRequest) return NextResponse.json({ error: err.message }, { status: 400 })
    console.error('[admin/ops/agents/sync-template-files] failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Template file sync failed' }, { status: 500 })
  }
}
