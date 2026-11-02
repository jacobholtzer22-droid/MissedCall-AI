// ===========================================
// ADMIN: RUN THE PER-TRADE ADS LEARNINGS NOW
// ===========================================
// POST /api/admin/ops/ads/learnings[?dry=1]
// Admin only. Same lib/ops/hq/learnings.ts run as the monthly cron, for the
// button on the HQ tab's Research desk.

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/pipeline-server'
import { runAdsLearnings } from '@/lib/ops/hq/learnings'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(request: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied

  const dryRun = request.nextUrl.searchParams.get('dry') === '1'
  try {
    return NextResponse.json(await runAdsLearnings({ dryRun }))
  } catch (error) {
    console.error('[admin/ops/ads/learnings] failed:', error)
    return NextResponse.json({ error: 'Ads learnings failed', detail: String(error) }, { status: 500 })
  }
}
