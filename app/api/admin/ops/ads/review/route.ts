// ===========================================
// ADMIN: RUN THE WEEKLY ADS REVIEW NOW
// ===========================================
// POST /api/admin/ops/ads/review[?dry=1]  body { engagementId? }
// Admin only. The same lib/ops/hq/ads-review.ts run as the Monday cron, for the
// "Run weekly review" button on the HQ tab's Ads desk: every running ads client,
// or one client with engagementId. Answers once the runs are queued; the
// workers run them 3 at a time and the report lands in the HQ chat.

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/pipeline-server'
import { AdsOffline } from '@/lib/ops/hq/ads'
import { runAdsReview } from '@/lib/ops/hq/ads-review'

export const dynamic = 'force-dynamic'
export const maxDuration = 800

export async function POST(request: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied

  const body = (await request.json().catch(() => ({}))) as { engagementId?: unknown }
  const engagementId = typeof body.engagementId === 'string' && body.engagementId.trim() ? body.engagementId.trim() : undefined
  const dryRun = request.nextUrl.searchParams.get('dry') === '1'
  try {
    return NextResponse.json(await runAdsReview({ dryRun, engagementId }))
  } catch (error) {
    if (error instanceof AdsOffline) return NextResponse.json({ error: error.message }, { status: 503 })
    console.error('[admin/ops/ads/review] failed:', error)
    return NextResponse.json({ error: 'Weekly ads review failed', detail: String(error) }, { status: 500 })
  }
}
