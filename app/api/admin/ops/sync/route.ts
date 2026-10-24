// ===========================================
// ADMIN: RUN THE /admin/ops SYNC NOW
// ===========================================
// POST /api/admin/ops/sync[?dry=1]
// Admin only. Same lib/ops/sync.ts run as the cron, for the /admin/ops button.

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/pipeline-server'
import { runOpsSync } from '@/lib/ops/sync'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(request: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied

  const dryRun = request.nextUrl.searchParams.get('dry') === '1'
  try {
    return NextResponse.json(await runOpsSync({ dryRun }))
  } catch (error) {
    console.error('[admin/ops/sync] failed:', error)
    return NextResponse.json({ error: 'Ops sync failed', detail: String(error) }, { status: 500 })
  }
}
