// ===========================================
// CRON: /admin/ops SYNC
// ===========================================
// Runs every 4 hours (vercel.json). Creates and links Engagements, pulls
// payment truth from Stripe (read only), runs the database checks and derives
// each Deliverable's status. All of it lives in lib/ops/sync.ts.
//
// ?dry=1 computes everything and writes nothing.
//
// Auth: same as the appointment-reminders cron. Vercel sends
// `Authorization: Bearer ${CRON_SECRET}`; the super-admin can trigger manually.
// Unlike lead-follow-up, an unset CRON_SECRET does NOT open the route.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { runOpsSync } from '@/lib/ops/sync'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function isAuthorized(request: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET?.trim()
  const authHeader = request.headers.get('authorization')
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true
  try {
    const { userId } = await auth()
    if (userId && process.env.ADMIN_USER_ID && userId === process.env.ADMIN_USER_ID) return true
  } catch {
    // No Clerk context (cron request without a session) — fall through
  }
  return false
}

export async function GET(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const dryRun = request.nextUrl.searchParams.get('dry') === '1'
  try {
    const summary = await runOpsSync({ dryRun })
    console.log(
      `[cron/ops-sync] dryRun=${dryRun} created=${summary.engagementsCreated.length} links=${summary.links.length} ` +
        `checks=${summary.checksWritten} stripeErrors=${summary.stripe.errors.length} ms=${summary.durationMs}`
    )
    return NextResponse.json(summary)
  } catch (error) {
    console.error('[cron/ops-sync] failed:', error)
    return NextResponse.json({ error: 'Ops sync failed', detail: String(error) }, { status: 500 })
  }
}
