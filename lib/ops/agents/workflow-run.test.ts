import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CALLBACK_NEVER_ARRIVED_REASON, NEVER_STARTED_REASON, lateCallbackMayFinish, pickWorkflowRun, runIdFromUrl, staleRunError } from './workflow-run'

const run = (id: number, created: string, event = 'repository_dispatch') => ({ id, html_url: `https://github.com/o/r/actions/runs/${id}`, status: 'queued', created_at: created, event })
const at = new Date('2026-10-31T12:00:00Z')

test('picks the oldest unclaimed repository_dispatch run at or after the dispatch', () => {
  const runs = [run(3, '2026-10-31T12:00:20Z'), run(2, '2026-10-31T12:00:05Z'), run(1, '2026-10-31T11:50:00Z')]
  assert.equal(pickWorkflowRun(runs, at, new Set())?.id, 2)
})

test('skips claimed runs and other events', () => {
  const runs = [run(2, '2026-10-31T12:00:05Z'), run(4, '2026-10-31T12:00:06Z', 'workflow_dispatch'), run(5, '2026-10-31T12:00:30Z')]
  assert.equal(pickWorkflowRun(runs, at, new Set(['2']))?.id, 5)
})

test('allows 30s of clock skew, not more', () => {
  assert.equal(pickWorkflowRun([run(7, '2026-10-31T11:59:40Z')], at, new Set())?.id, 7)
  assert.equal(pickWorkflowRun([run(8, '2026-10-31T11:59:20Z')], at, new Set()), null)
})

test('runIdFromUrl', () => {
  assert.equal(runIdFromUrl('https://github.com/o/r/actions/runs/12345'), '12345')
  assert.equal(runIdFromUrl('https://github.com/o/r/actions/runs/12345/job/9'), '12345')
  assert.equal(runIdFromUrl('nope'), null)
})

test('stale runs fail with the run URL when the watcher found one', () => {
  assert.equal(staleRunError('o/r', '41176503052', 'https://github.com/o/r/actions/runs/41176503052'), `${CALLBACK_NEVER_ARRIVED_REASON}: https://github.com/o/r/actions/runs/41176503052`)
})

test('stale runs build the run URL from the run id when output has none', () => {
  assert.equal(staleRunError('o/r', '77', null), `${CALLBACK_NEVER_ARRIVED_REASON}: https://github.com/o/r/actions/runs/77`)
})

test('stale runs with no run id carry the bare reason', () => {
  assert.equal(staleRunError('o/r', null, undefined), 'callback never arrived; check the workflow run')
})

test('a late callback may finish runs the platform gave up on, nothing else', () => {
  assert.equal(lateCallbackMayFinish('failed', NEVER_STARTED_REASON), true)
  assert.equal(lateCallbackMayFinish('failed', staleRunError('o/r', '1', null)), true)
  assert.equal(lateCallbackMayFinish('failed', 'workflow failure; failing: build'), false)
  assert.equal(lateCallbackMayFinish('succeeded', null), false)
  assert.equal(lateCallbackMayFinish('failed', null), false)
})
