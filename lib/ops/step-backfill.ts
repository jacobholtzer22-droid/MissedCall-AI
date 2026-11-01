// ===========================================
// /admin/ops: which step-less deliverables get their first step (one-off backfill)
// ===========================================
// Pure. scripts/backfill-deliverable-steps.ts reads the rows, prints this
// plan, and with --apply writes it. Only a deliverable whose step is null can
// be in `set`; one that already has a step is always skipped and never written.
//
// Conservative on purpose: a step-less row with progress already (computed
// live or in progress), a hand-set status, or evidence that the first step is
// done is skipped with the reason, because giving it a first step would move
// a working client backwards on the board.

import { initialStepFor, defaultWaitingOn, type WaitingOn } from '@/lib/ops/steps'

export type BackfillRow = {
  id: string
  type: string
  step: string | null
  computedStatus: string
  manualStatus: string | null
  evidence: Record<string, unknown>
  engagementId: string
  engagementName: string
  stage: string
}

export type BackfillSet = { row: BackfillRow; step: string; waitingOn: WaitingOn | null }
export type BackfillSkip = { row: BackfillRow; reason: string }

export function planStepBackfill(rows: BackfillRow[]): { set: BackfillSet[]; skip: BackfillSkip[] } {
  const set: BackfillSet[] = []
  const skip: BackfillSkip[] = []
  for (const row of rows) {
    if (row.step) {
      skip.push({ row, reason: `already at step ${row.step}` })
      continue
    }
    if (row.stage === 'ignored' || row.stage === 'churned') {
      skip.push({ row, reason: `client is ${row.stage}` })
      continue
    }
    if (row.manualStatus) {
      skip.push({ row, reason: `status set by hand (${row.manualStatus})` })
      continue
    }
    if (row.computedStatus === 'live' || row.computedStatus === 'in_progress') {
      skip.push({ row, reason: `checks say ${row.computedStatus}` })
      continue
    }
    const s = initialStepFor(row.type, row.evidence)
    if (!s) {
      skip.push({ row, reason: 'evidence shows the first step done, or no catalog for this type' })
      continue
    }
    set.push({ row, step: s.key, waitingOn: defaultWaitingOn(row.type, s.key) })
  }
  const order = (r: BackfillRow) => `${r.engagementName.toLowerCase()}|${r.type}`
  set.sort((a, b) => order(a.row).localeCompare(order(b.row)))
  skip.sort((a, b) => order(a.row).localeCompare(order(b.row)))
  return { set, skip }
}

/** The printed plan: one line per deliverable, grouped by client. */
export function formatBackfillPlan(plan: { set: BackfillSet[]; skip: BackfillSkip[] }, apply: boolean): string {
  const lines = [`${apply ? 'APPLYING' : 'DRY RUN (nothing written; add --apply to write)'}: ${plan.set.length} to set, ${plan.skip.length} skipped`, '']
  for (const s of plan.set) lines.push(`SET   ${s.row.engagementName} | ${s.row.type} -> ${s.step} (waiting on ${s.waitingOn ?? 'nobody'})`)
  if (plan.skip.length) lines.push('')
  for (const s of plan.skip) lines.push(`SKIP  ${s.row.engagementName} | ${s.row.type}: ${s.reason}`)
  return lines.join('\n')
}
