// ===========================================
// CRON: OPS HQ PER-TRADE ADS LEARNINGS
// ===========================================
// Monthly: one AdsTradeLearning row per trade from the last 30 days of every
// bound ads account (lib/ops/hq/learnings.ts). Read only on Google Ads, at most
// 5 GAQL calls per account. Not in vercel.json yet: add
//   { "path": "/api/cron/ads-learnings", "schedule": "17 9 2 * *" }
// (9:17 UTC on the 2nd) once Jacob says so.
//
// ?dry=1 reads Google and returns the rows, writes nothing, makes no model call.
//
// Auth: same as the ops-sync cron. Vercel sends
// `Authorization: Bearer ${CRON_SECRET}`; the super-admin can trigger manually.
// An unset CRON_SECRET does NOT open the route.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { runAdsLearnings } from '@/lib/ops/hq/learnings'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

async function isAuthorized(request: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET?.trim()
  const authHeader = request.headers.get('authorization')
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true
  try {
    const { userId } = await auth()
    if (userId && process.env.ADMIN_USER_ID && userId === process.env.ADMIN_USER_ID) return true
  } catch {
    // No Clerk context (cron request without a session): fall through
  }
  return false
}

export async function GET(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const dryRun = request.nextUrl.searchParams.get('dry') === '1'
  try {
    return NextResponse.json(await runAdsLearnings({ dryRun }))
  } catch (error) {
    console.error('[cron/ads-learnings] failed:', error)
    return NextResponse.json({ error: 'Ads learnings failed', detail: String(error) }, { status: 500 })
  }
}
