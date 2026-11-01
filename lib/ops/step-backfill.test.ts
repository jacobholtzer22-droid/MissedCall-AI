import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatBackfillPlan, planStepBackfill, type BackfillRow } from './step-backfill'

const row = (p: Partial<BackfillRow>): BackfillRow => ({
  id: 'd1',
  type: 'website',
  step: null,
  computedStatus: 'unknown',
  manualStatus: null,
  evidence: {},
  engagementId: 'e1',
  engagementName: 'Client A',
  stage: 'onboarding',
  ...p,
})

test('selection: only step-less rows with no progress get a first step', () => {
  const plan = planStepBackfill([
    row({ id: 'new-site' }),
    row({ id: 'gbp', type: 'gbp', computedStatus: 'not_started' }),
    row({ id: 'has-step', step: 'build' }),
    row({ id: 'live', computedStatus: 'live' }),
    row({ id: 'progress', type: 'domain', computedStatus: 'in_progress' }),
    row({ id: 'manual', type: 'email', manualStatus: 'blocked' }),
    row({ id: 'churned', stage: 'churned' }),
    row({ id: 'ignored', stage: 'ignored' }),
    row({ id: 'ads-known', type: 'ads', evidence: { adsCustomerId: '1234567890' } }),
    row({ id: 'mc-known', type: 'missedcall', evidence: { telnyxNumber: '+15555550100' } }),
  ])
  assert.deepEqual(
    plan.set.map((s) => [s.row.id, s.step, s.waitingOn]),
    [
      ['gbp', 'manager_access', 'client'],
      ['new-site', 'brief', 'client'],
    ]
  )
  assert.deepEqual(Object.fromEntries(plan.skip.map((s) => [s.row.id, s.reason])), {
    'has-step': 'already at step build',
    live: 'checks say live',
    progress: 'checks say in_progress',
    manual: 'status set by hand (blocked)',
    churned: 'client is churned',
    ignored: 'client is ignored',
    'ads-known': 'evidence shows the first step done, or no catalog for this type',
    'mc-known': 'evidence shows the first step done, or no catalog for this type',
  })
  // A row with a step is never in the set, whatever else it has.
  assert.ok(!plan.set.some((s) => s.row.step))
})

test('dry run output: one line per deliverable, says nothing is written', () => {
  const plan = planStepBackfill([row({}), row({ id: 'd2', type: 'ads', engagementName: 'Client B' }), row({ id: 'd3', step: 'review' })])
  const text = formatBackfillPlan(plan, false)
  assert.equal(
    text,
    [
      'DRY RUN (nothing written; add --apply to write): 2 to set, 1 skipped',
      '',
      'SET   Client A | website -> brief (waiting on client)',
      'SET   Client B | ads -> account (waiting on jacob)',
      '',
      'SKIP  Client A | website: already at step review',
    ].join('\n')
  )
  assert.match(formatBackfillPlan(plan, true), /^APPLYING: 2 to set, 1 skipped/)
})
