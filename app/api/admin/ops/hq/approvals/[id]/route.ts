// ===========================================
// POST /api/admin/ops/hq/approvals/[id] — Jacob pushes or rejects a proposal
// ===========================================
// Body { decision: 'approve' | 'reject' }. The decision itself is
// decideApproval() in lib/ops/hq/approvals.ts. An approved ads_change answers
// at once with { applyRunId }; the apply run continues under waitUntil and
// streams into the feed.

import { NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { requireAdmin } from '@/lib/pipeline-server'
import { runAdsTask } from '@/lib/ops/hq/ads'
import { decideApproval } from '@/lib/ops/hq/approvals'
import { BadRequest, oneOf, readJsonObject, rejectUnknownKeys } from '@/lib/ops/validate'

export const dynamic = 'force-dynamic'
export const maxDuration = 800

export async function POST(request: Request, context: { params: { id: string } }) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const body = readJsonObject(await request.json())
    rejectUnknownKeys(body, ['decision'])
    const decision = oneOf(body.decision, ['approve', 'reject'] as const, 'decision')

    const result = await decideApproval(context.params.id, decision)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.httpStatus })
    if (result.status === 'approved') waitUntil(runAdsTask(result.applyRunId))
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof BadRequest) return NextResponse.json({ error: err.message }, { status: 400 })
    console.error('[admin/ops/hq/approvals] failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to decide' }, { status: 500 })
  }
}
