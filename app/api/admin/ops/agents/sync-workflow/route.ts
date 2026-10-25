// ===========================================
// POST /api/admin/ops/agents/sync-workflow — workflow + secrets into existing repos
// ===========================================
// Body: { mode: "pr" | "direct", only?: [engagementIds], dry }. See
// lib/ops/agents/sync-workflow.ts. dry (the default) lists each repo and what
// it would get, and writes nothing.

import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/pipeline-server'
import { syncWorkflow } from '@/lib/ops/agents/sync-workflow'
import { BadRequest, oneOf, readJsonObject, rejectUnknownKeys } from '@/lib/ops/validate'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const body = readJsonObject(await request.json())
    rejectUnknownKeys(body, ['mode', 'only', 'dry'])
    const mode = oneOf(body.mode ?? 'pr', ['pr', 'direct'] as const, 'mode')
    if (body.only !== undefined && (!Array.isArray(body.only) || body.only.some((x) => typeof x !== 'string'))) {
      throw new BadRequest('only must be an array of engagement ids')
    }
    const result = await syncWorkflow({ mode, only: body.only as string[] | undefined, dry: body.dry !== false })
    return NextResponse.json(result, { status: result.blocked.length > 0 && body.dry === false ? 409 : 200 })
  } catch (err) {
    if (err instanceof BadRequest) return NextResponse.json({ error: err.message }, { status: 400 })
    console.error('[admin/ops/agents/sync-workflow] failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Workflow sync failed' }, { status: 500 })
  }
}
