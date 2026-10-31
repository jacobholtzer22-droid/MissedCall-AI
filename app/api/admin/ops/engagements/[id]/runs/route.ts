// ===========================================
// POST /api/admin/ops/engagements/[id]/runs — dispatch the web designer agent
// ===========================================
// Body: { kind: site_build | site_update | go_live, brief?, instructions?, dry }.
// site_build needs brief; site_update needs instructions. Creates the
// AgentRun and sends repository_dispatch aa-build. See
// lib/ops/agents/dispatch.ts. dry (the default) returns the payload only.

import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/pipeline-server'
import { dispatchRun } from '@/lib/ops/agents/dispatch'
import { RUN_KINDS } from '@/lib/ops/agents/shared'
import { BadRequest, nullableString, oneOf, readJsonObject, rejectUnknownKeys } from '@/lib/ops/validate'

export const dynamic = 'force-dynamic'
// 800: the dispatch keeps watching for the GitHub Actions run (up to 10 minutes) after responding.
export const maxDuration = 800

export async function POST(request: Request, context: { params: { id: string } }) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const body = readJsonObject(await request.json())
    rejectUnknownKeys(body, ['kind', 'brief', 'instructions', 'dry'])
    const kind = oneOf(body.kind, RUN_KINDS, 'kind')
    const brief = 'brief' in body ? nullableString(body.brief, 'brief', 100_000) ?? undefined : undefined
    const instructions = 'instructions' in body ? nullableString(body.instructions, 'instructions', 100_000) ?? undefined : undefined
    const result = await dispatchRun(context.params.id, { kind, brief, instructions, dry: body.dry !== false })
    const status = result.blocked.length > 0 ? 409 : result.ok ? 200 : 502
    return NextResponse.json(result, { status })
  } catch (err) {
    if (err instanceof BadRequest) return NextResponse.json({ error: err.message }, { status: 400 })
    console.error('[admin/ops/runs] failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Dispatch failed' }, { status: 500 })
  }
}
