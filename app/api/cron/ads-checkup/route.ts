// ===========================================
// CRON: weekly ads check-up (ADS_WEEKLY_CHECKUP, off by default)
// ===========================================
// Mondays 14:23 UTC (vercel.json). Flag off: 404 before anything else. Auth: the
// ops-sync pattern; Vercel sends `Authorization: Bearer ${CRON_SECRET}`, the
// super-admin can trigger it by hand, and an unset CRON_SECRET does NOT open it.
//
// Starts the existing ads specialist, check-up mode, on the accounts
// lib/ops/ads-checkup.ts planCheckup picks, under one OpsJob, so its proposals
// become Push cards and the chief writes the usual job report. No write tool is
// given to these runs (lib/ops/hq/ads-tools.ts checkupTools).

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { waitUntil } from '@vercel/functions'
import { db } from '@/lib/db'
import { isNeverTouch } from '@/lib/ops/hq/ads-tools'
import { AdsOffline, runAdsTask, startAdsRun } from '@/lib/ops/hq/ads'
import { CHECKUP_INSTRUCTIONS, adsWeeklyCheckupEnabled, planCheckup, type CheckupCandidate } from '@/lib/ops/ads-checkup'
import { effectiveStatusOf } from '@/lib/ops/steps'

export const dynamic = 'force-dynamic'
export const maxDuration = 800

async function isAuthorized(request: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET?.trim()
  const authHeader = request.headers.get('authorization')
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true
  try {
    const { userId } = await auth()
    if (userId && process.env.ADMIN_USER_ID && userId === process.env.ADMIN_USER_ID) return true
  } catch {
    // No Clerk context: fall through
  }
  return false
}

export async function GET(request: NextRequest) {
  if (!adsWeeklyCheckupEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!(await isAuthorized(request))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rows = await db.engagement.findMany({
    where: { stage: { notIn: ['ignored', 'churned'] } },
    select: {
      id: true,
      displayName: true,
      stage: true,
      services: true,
      business: { select: { googleAdsCustomerId: true } },
      deliverables: { where: { type: 'ads' }, select: { type: true, step: true, manualStatus: true, computedStatus: true, evidence: true } },
    },
  })
  const last = await db.agentRun.findMany({
    where: { agent: 'ads', input: { path: ['checkup'], equals: true } },
    orderBy: { createdAt: 'desc' },
    select: { engagementId: true, createdAt: true },
    take: 500,
  })
  const lastBy = new Map<string, string>()
  for (const r of last) if (r.engagementId && !lastBy.has(r.engagementId)) lastBy.set(r.engagementId, r.createdAt.toISOString())

  const candidates: CheckupCandidate[] = rows.map((r) => {
    const ads = r.deliverables[0]
    const ev = (ads?.evidence ?? {}) as Record<string, unknown>
    const id = r.business?.googleAdsCustomerId || (typeof ev.adsCustomerId === 'string' ? ev.adsCustomerId : null)
    return {
      engagementId: r.id,
      name: r.displayName.trim(),
      stage: r.stage,
      services: Array.isArray(r.services) ? (r.services as string[]) : [],
      customerId: id ? id.replace(/-/g, '') : null,
      adsStep: ads?.step ?? null,
      adsStatus: ads ? effectiveStatusOf({ type: 'ads', manualStatus: ads.manualStatus, computedStatus: ads.computedStatus, step: ads.step }) : null,
      neverTouch: isNeverTouch(r.displayName.trim()),
      lastCheckupAt: lastBy.get(r.id) ?? null,
    }
  })
  const plan = planCheckup(candidates)
  for (const s of plan.skipped) {
    await db.opsActivity.create({ data: { engagementId: s.candidate.engagementId, kind: 'system', body: `Weekly ads check-up skipped: ${s.reason}.` } })
  }
  if (!plan.run.length) return NextResponse.json({ ok: true, started: [], skipped: plan.skipped.map((s) => ({ client: s.candidate.name, reason: s.reason })) })

  const job = await db.opsJob.create({ data: { prompt: 'Weekly ads check-up (read and propose only)', status: 'running', engagementIds: plan.run.map((c) => c.engagementId) } })
  const started: string[] = []
  const failed: { client: string; error: string }[] = []
  for (const c of plan.run) {
    try {
      const run = await startAdsRun({ engagementId: c.engagementId, jobId: job.id, instructions: CHECKUP_INSTRUCTIONS, checkup: true })
      waitUntil(runAdsTask(run.id))
      started.push(c.name)
    } catch (err) {
      if (err instanceof AdsOffline) {
        await db.opsJob.update({ where: { id: job.id }, data: { status: 'failed', summary: err.message } })
        return NextResponse.json({ ok: false, error: err.message }, { status: 503 })
      }
      failed.push({ client: c.name, error: err instanceof Error ? err.message : String(err) })
    }
  }
  if (!started.length) await db.opsJob.update({ where: { id: job.id }, data: { status: 'failed', summary: 'no check-up run could start' } })
  console.log(`[cron/ads-checkup] started=${started.length} skipped=${plan.skipped.length} failed=${failed.length}`)
  return NextResponse.json({ ok: true, jobId: job.id, started, failed, skipped: plan.skipped.map((s) => ({ client: s.candidate.name, reason: s.reason })) })
}
