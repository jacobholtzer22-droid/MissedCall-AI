// The records lib/ops/pr-state.ts reads, for one or many clients. Database only.

import { db } from '@/lib/db'
import { sitePrState, type PrState } from '@/lib/ops/pr-state'
import { autoflowEnabled } from '@/lib/ops/autoflow'

export async function prStatesFor(engagementIds: string[]): Promise<Map<string, PrState>> {
  const out = new Map<string, PrState>()
  if (!engagementIds.length) return out
  const [runs, merges] = await Promise.all([
    db.agentRun.findMany({
      where: { engagementId: { in: engagementIds }, kind: { in: ['site_build', 'site_update'] }, status: 'succeeded' },
      select: { engagementId: true, kind: true, status: true, finishedAt: true, output: true },
    }),
    db.opsApproval.findMany({
      where: { kind: 'web_push', status: 'applied', detail: { path: ['action'], equals: 'merge' } },
      select: { detail: true },
    }),
  ])
  // OPS_AUTOFLOW: a PR production was seen at (merged by hand in GitHub) counts as merged.
  const seen = autoflowEnabled()
    ? await db.deliverable.findMany({ where: { engagementId: { in: engagementIds }, type: 'website' }, select: { engagementId: true, evidence: true } })
    : []
  for (const id of engagementIds) {
    const own = merges
      .map((m) => (m.detail ?? {}) as Record<string, unknown>)
      .filter((d) => d.engagementId === id)
      .map((d) => ({ prNumber: Number(d.prNumber) }))
    const ev = (seen.find((s) => s.engagementId === id)?.evidence ?? {}) as Record<string, unknown>
    if (Array.isArray(ev.productionPrsSeen)) for (const n of ev.productionPrsSeen) if (typeof n === 'number') own.push({ prNumber: n })
    out.set(id, sitePrState(runs.filter((r) => r.engagementId === id), own))
  }
  return out
}
