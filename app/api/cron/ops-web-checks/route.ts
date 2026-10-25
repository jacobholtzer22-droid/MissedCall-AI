// ===========================================
// CRON: /admin/ops WEB CHECKS
// ===========================================
// Daily (vercel.json). Discovers every client's repo, Vercel project, domains,
// deployment, slug and indexing, writes them onto the website and domain
// deliverables as evidence and checks, and advances steps forward only. All of
// it lives in lib/ops/checks/. Read only against Vercel, GitHub, DNS and the
// live sites.
//
// ?dry=1 computes everything and writes nothing.
//
// Auth: same as the ops-sync cron. Vercel sends
// `Authorization: Bearer ${CRON_SECRET}`; the super-admin can trigger manually.
// An unset CRON_SECRET does NOT open the route.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { runWebChecks } from '@/lib/ops/checks/run-web'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

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
    const summary = await runWebChecks({ dryRun })
    console.log(
      `[cron/ops-web-checks] dryRun=${dryRun} projects=${summary.projectsSeen} repos=${summary.reposSeen} ` +
        `checks=${summary.checksWritten} advances=${summary.autoAdvances.length} apiErrors=${summary.apiErrors.length} ms=${summary.durationMs}`
    )
    return NextResponse.json(summary)
  } catch (error) {
    console.error('[cron/ops-web-checks] failed:', error)
    return NextResponse.json({ error: 'Web checks failed', detail: String(error) }, { status: 500 })
  }
}
