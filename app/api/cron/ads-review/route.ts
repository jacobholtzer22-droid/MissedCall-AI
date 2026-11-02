// ===========================================
// CRON: OPS HQ WEEKLY ADS REVIEW
// ===========================================
// Mondays 14:00 UTC (vercel.json). Opens one OpsJob and queues one ads review
// run per running ads client (lib/ops/hq/ads-review.ts runAdsReview), then
// starts 3 workers. ?dry=1 runs the same review with every Google write sent
// validate_only and writes no AdsReview and no approval.
//
// ?worker=<jobId> is a worker: it claims the job's next queued run, answers at
// once and runs that one account under waitUntil, then asks for the next
// worker. CRON_SECRET bearer only (workers are started by the platform itself).
//
// Auth: same as the ops-sync cron. Vercel sends `Authorization: Bearer
// ${CRON_SECRET}`; the super-admin can also trigger it by hand. An unset
// CRON_SECRET does NOT open the route.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { waitUntil } from '@vercel/functions'
import { AdsOffline } from '@/lib/ops/hq/ads'
import { kickWorkers, runAdsReview, runReviewWorker } from '@/lib/ops/hq/ads-review'

export const dynamic = 'force-dynamic'
export const maxDuration = 800

const bearer = (request: NextRequest) => {
  const cronSecret = process.env.CRON_SECRET?.trim()
  return Boolean(cronSecret) && request.headers.get('authorization') === `Bearer ${cronSecret}`
}

async function isAuthorized(request: NextRequest): Promise<boolean> {
  if (bearer(request)) return true
  try {
    const { userId } = await auth()
    if (userId && process.env.ADMIN_USER_ID && userId === process.env.ADMIN_USER_ID) return true
  } catch {
    // No Clerk context (cron request without a session): fall through
  }
  return false
}

export async function GET(request: NextRequest) {
  const worker = request.nextUrl.searchParams.get('worker')
  if (worker) {
    if (!bearer(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    waitUntil(
      (async () => {
        try {
          if (await runReviewWorker(worker)) await kickWorkers(worker, 1)
        } catch (err) {
          console.error('[cron/ads-review] worker failed:', err instanceof Error ? err.message : err)
        }
      })()
    )
    return NextResponse.json({ ok: true, worker })
  }

  if (!(await isAuthorized(request))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const dryRun = request.nextUrl.searchParams.get('dry') === '1'
  try {
    const result = await runAdsReview({ dryRun })
    console.log(`[cron/ads-review] ${dryRun ? 'dry run, ' : ''}job=${result.jobId} queued=${result.runs.length} skipped=${result.skipped.length} failed=${result.failed.length}`)
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof AdsOffline) return NextResponse.json({ error: error.message }, { status: 503 })
    console.error('[cron/ads-review] failed:', error)
    return NextResponse.json({ error: 'Weekly ads review failed', detail: String(error) }, { status: 500 })
  }
}
