// ===========================================
// OPS_AUTOFLOW: work done outside Ops HQ
// ===========================================
// Run: npm test. Pure; no GitHub, no Vercel, no database.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { activeDecisions, findDecision, prNumbersInCommit, prsSeenAfter, supersededMarker } from './outside-hq'
import { sitePrState } from './pr-state'

test('the PR number from a production commit message: squash and merge commits', () => {
  assert.deepEqual(prNumbersInCommit('site: first build (#12)'), [12])
  assert.deepEqual(prNumbersInCommit('site: first build (#12)\n\n* commit one\n* commit two (#3)'), [12])
  assert.deepEqual(prNumbersInCommit('Merge pull request #7 from owner/build/client-abc\n\nbuild'), [7])
  assert.deepEqual(prNumbersInCommit('fix typo on contact page'), [])
  assert.deepEqual(prNumbersInCommit(null), [])
})

test('productionPrsSeen grows only from a READY production and only when something is new', () => {
  assert.deepEqual(prsSeenAfter(undefined, 'READY', 'site: build (#4)'), [4])
  assert.deepEqual(prsSeenAfter([2, 4], 'READY', 'site: update (#5)'), [2, 4, 5])
  assert.equal(prsSeenAfter([4], 'READY', 'site: build (#4)'), null)
  assert.equal(prsSeenAfter([], 'ERROR', 'site: build (#4)'), null)
  assert.equal(prsSeenAfter([], 'READY', 'no pr here'), null)
})

test('a PR production was seen at counts as merged in pr-state; unseen stays open', () => {
  const runs = [{ kind: 'site_build', status: 'succeeded', finishedAt: '2026-10-30T10:00:00Z', output: { prUrl: 'https://github.com/o/r/pull/4', verifyPassed: true } }]
  assert.deepEqual(sitePrState(runs, []), { state: 'open', number: 4 })
  const seen = prsSeenAfter(undefined, 'READY', 'site: build (#4)')!.map((n) => ({ prNumber: n }))
  assert.deepEqual(sitePrState(runs, seen), { state: 'merged', number: 4 })
  assert.deepEqual(sitePrState(runs, [{ prNumber: 3 }]), { state: 'open', number: 4 })
})

test('supersede: the old decision stays in history, only the new one is standing', () => {
  const rows = [
    { id: 'a1', engagementId: 'e1', body: 'DECISION: keep the budget at $20/day' },
    { id: 'a2', engagementId: 'e1', body: 'DECISION: keep the Maps campaign off' },
    { id: 'a3', engagementId: 'e1', body: 'DECISION: the budget cap is now $30/day' },
  ]
  const marker = supersededMarker('a1', 'keep the budget at $20/day', 'the budget cap is now $30/day')
  assert.equal(marker, 'DECISION SUPERSEDED [a1]: "keep the budget at $20/day" is replaced by "the budget cap is now $30/day"')
  assert.equal(marker.startsWith('DECISION:'), false)
  assert.deepEqual(activeDecisions(rows, [marker]).map((r) => r.id), ['a2', 'a3'])
  assert.deepEqual(activeDecisions(rows, []).map((r) => r.id), ['a1', 'a2', 'a3'])
})

test('findDecision: exact, unique part, none, or ambiguous', () => {
  const rows = [
    { id: 'a1', text: 'keep the budget at $20/day' },
    { id: 'a2', text: 'keep the Maps campaign off' },
  ]
  assert.deepEqual(findDecision(rows, 'Keep the budget at $20/day'), rows[0])
  assert.deepEqual(findDecision(rows, 'Maps'), rows[1])
  assert.match((findDecision(rows, 'billing') as { error: string }).error, /no standing decision matches "billing"/)
  assert.match((findDecision(rows, 'keep the') as { error: string }).error, /2 standing decisions match/)
  assert.match((findDecision(rows, ' ') as { error: string }).error, /say which/)
})

test('flag off: no commit message kept, decisions read as before, tools not offered', () => {
  const discover = readFileSync(new URL('./checks/discover.ts', import.meta.url), 'utf8')
  assert.match(discover, /\.\.\.\(process\.env\.OPS_AUTOFLOW === 'true' \? \{ commitMessage: /)
  const decisions = readFileSync(new URL('./hq/decisions.ts', import.meta.url), 'utf8')
  assert.match(decisions, /if \(autoflowEnabled\(\)\) return standingDecisions\(ids\)/)
  const chief = readFileSync(new URL('./hq/chief.ts', import.meta.url), 'utf8')
  assert.match(chief, /\.\.\.\(autoflowEnabled\(\) \? outsideHqTools\(\) : \[\]\)/)
  const runWeb = readFileSync(new URL('./checks/run-web.ts', import.meta.url), 'utf8')
  assert.match(runWeb, /const targets = engs\.filter\(\(e\) => \(e\.website \|\| e\.domain\) && \(!only \|\| e\.id === only\)\)/)
})
