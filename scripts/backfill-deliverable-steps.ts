/**
 * One-off: give step-less deliverables their first catalog step (Nov 2026).
 *
 * New deliverables start at their first step since ensureDeliverables sets it on
 * create (lib/ops/steps.ts INITIAL_STEP). This brings older step-less rows in line,
 * with the rules in lib/ops/step-backfill.ts planStepBackfill: only rows whose
 * step is null; never a client that is ignored or churned, a row with a hand-set
 * status, a row the checks already call live or in progress, or one whose evidence
 * shows the first step done. A deliverable that already has a step is never
 * touched: the write is conditional on step still being null.
 *
 * Writes only Deliverable (step, waitingOn, stepUpdatedAt) and one OpsActivity
 * (system) per client it changes.
 *
 * Usage:
 *   npx tsx scripts/backfill-deliverable-steps.ts           # dry run: print the plan, write nothing
 *   npx tsx scripts/backfill-deliverable-steps.ts --apply   # write it
 *
 * Requires: DATABASE_URL (read from .env / .env.local)
 */

import * as dotenv from 'dotenv'

dotenv.config({ path: '.env' })
dotenv.config({ path: '.env.local' })

const APPLY = process.argv.includes('--apply')

async function main() {
  const { db } = await import('@/lib/db')
  const { formatBackfillPlan, planStepBackfill } = await import('@/lib/ops/step-backfill')

  const rows = await db.deliverable.findMany({
    where: { step: null },
    select: {
      id: true,
      type: true,
      step: true,
      computedStatus: true,
      manualStatus: true,
      evidence: true,
      engagementId: true,
      engagement: { select: { displayName: true, stage: true } },
    },
  })
  const plan = planStepBackfill(
    rows.map((r) => ({
      id: r.id,
      type: r.type,
      step: r.step,
      computedStatus: r.computedStatus,
      manualStatus: r.manualStatus,
      evidence: r.evidence && typeof r.evidence === 'object' && !Array.isArray(r.evidence) ? (r.evidence as Record<string, unknown>) : {},
      engagementId: r.engagementId,
      engagementName: r.engagement.displayName.trim(),
      stage: r.engagement.stage,
    }))
  )
  console.log(formatBackfillPlan(plan, APPLY))
  if (!APPLY) {
    await db.$disconnect()
    return
  }

  const now = new Date()
  const changed = new Map<string, string[]>()
  for (const s of plan.set) {
    // Conditional: a step set since the read (by Jacob or the chief) wins.
    const r = await db.deliverable.updateMany({
      where: { id: s.row.id, step: null },
      data: { step: s.step, waitingOn: s.waitingOn, stepUpdatedAt: now },
    })
    if (r.count === 1) changed.set(s.row.engagementId, [...(changed.get(s.row.engagementId) ?? []), `${s.row.type} ${s.step}`])
    else console.log(`LATE  ${s.row.engagementName} | ${s.row.type}: got a step after the read, left alone`)
  }
  for (const [engagementId, items] of Array.from(changed.entries())) {
    await db.opsActivity.create({ data: { engagementId, kind: 'system', body: `Backfill: first step set on ${items.join(', ')} (were unset).` } })
  }
  console.log(`\nDone: ${Array.from(changed.values()).reduce((n, x) => n + x.length, 0)} deliverables on ${changed.size} clients.`)
  await db.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
