// ===========================================
// POST /api/admin/ops/deliverables/[id]/reseal-secrets: reseal a repo's secrets
// ===========================================
// No body. Sets ANTHROPIC_API_KEY, OPS_CALLBACK_SECRET (and the stock photo
// keys when present) on the website deliverable's repo from this deployment's
// env. See lib/ops/agents/reseal.ts. 404 unknown deliverable, 409 refused
// (with blocked[]), 502 GitHub refused a secret, 200 done.

import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/pipeline-server'
import { resealSecrets } from '@/lib/ops/agents/reseal'

export const dynamic = 'force-dynamic'

export async function POST(_request: Request, context: { params: { id: string } }) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const result = await resealSecrets(context.params.id)
    const status = result.blocked.includes('deliverable not found') ? 404 : result.blocked.length > 0 ? 409 : result.ok ? 200 : 502
    return NextResponse.json(result.blocked.length > 0 ? { ...result, error: result.blocked.join('; ') } : result, { status })
  } catch (err) {
    console.error('[admin/ops/reseal-secrets] failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Reseal failed' }, { status: 500 })
  }
}
