// ===========================================
// ADMIN: RUN THE /admin/ops WEB CHECKS NOW
// ===========================================
// POST /api/admin/ops/checks/web[?dry=1]
// Admin only. Same lib/ops/checks/run-web.ts run as the daily cron, for the
// "Run web checks" button.

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/pipeline-server'
import { runWebChecks } from '@/lib/ops/checks/run-web'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(request: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied

  const dryRun = request.nextUrl.searchParams.get('dry') === '1'
  try {
    return NextResponse.json(await runWebChecks({ dryRun }))
  } catch (error) {
    console.error('[admin/ops/checks/web] failed:', error)
    return NextResponse.json({ error: 'Web checks failed', detail: String(error) }, { status: 500 })
  }
}
