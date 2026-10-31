import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pickWorkflowRun, runIdFromUrl } from './workflow-run'

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
