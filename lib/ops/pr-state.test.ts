import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mergeFirstNote, onLooksGood, sitePrState, type PrRun } from './pr-state'
import { sendDraftsFor, type SendFacts } from './send-drafts'

const run = (n: number | null, at: string, p: Partial<PrRun> = {}): PrRun => ({
  kind: 'site_build',
  status: 'succeeded',
  finishedAt: at,
  output: n ? { prUrl: `https://github.com/x/y/pull/${n}`, verifyPassed: true } : {},
  ...p,
})

test('PR state from the records: unknown, open, merged, newest wins', () => {
  assert.deepEqual(sitePrState([], []), { state: 'unknown' })
  assert.deepEqual(sitePrState([run(null, '2026-10-30')], []), { state: 'unknown' })
  assert.deepEqual(sitePrState([run(1, '2026-10-30')], []), { state: 'open', number: 1 })
  assert.deepEqual(sitePrState([run(1, '2026-10-30')], [{ prNumber: 1 }]), { state: 'merged', number: 1 })
  // A revision after the merge opens a new PR.
  assert.deepEqual(sitePrState([run(1, '2026-10-30'), run(2, '2026-10-31', { kind: 'site_update' })], [{ prNumber: 1 }]), { state: 'open', number: 2 })
  // A red gate or a failed run is not the site's PR.
  assert.deepEqual(sitePrState([run(1, '2026-10-30'), run(3, '2026-10-31', { output: { prUrl: 'https://github.com/x/y/pull/3', verifyPassed: false } })], [{ prNumber: 1 }]), { state: 'merged', number: 1 })
  assert.deepEqual(sitePrState([run(1, '2026-10-30'), run(4, '2026-10-31', { status: 'failed' })], [{ prNumber: 1 }]), { state: 'merged', number: 1 })
  // go_live runs are not site PRs.
  assert.deepEqual(sitePrState([run(5, '2026-10-31', { kind: 'go_live' })], []), { state: 'unknown' })
})

test('looks good: approved only with the recorded PR merged; otherwise merge first', () => {
  assert.deepEqual(onLooksGood('send_preview', { state: 'merged', number: 1 }), { step: 'approved', waitingNote: 'Client approved the preview; the merge is your Push' })
  assert.deepEqual(onLooksGood('client_review', { state: 'open', number: 7 }), { step: null, waitingNote: 'Client approved the preview; merge the open PR (#7) first' })
  assert.deepEqual(onLooksGood('send_preview', { state: 'unknown' }), { step: null, waitingNote: 'Client approved the preview; merge the open PR first' })
  for (const s of ['build', 'review', 'approved', 'live', null]) assert.equal(onLooksGood(s, { state: 'merged', number: 1 }), null)
  assert.equal(mergeFirstNote({ state: 'open', number: 3 }), 'Client approved the preview; merge the open PR (#3) first')
})

test("you're live never shows while a recorded PR is unmerged", () => {
  const f: SendFacts = {
    engagementId: 'e1',
    client: 'Client A',
    contactName: 'Pat',
    phone: null,
    stage: 'active',
    deliverables: [{ type: 'website', step: 'live', effectiveStatus: 'live', stepUpdatedAt: new Date(Date.now() - 86_400_000).toISOString(), evidence: {} }],
    business: null,
    intakeMissing: [],
    hasClientAnswers: true,
    marks: {},
    intakeLinkUrl: null,
  }
  assert.deepEqual(sendDraftsFor(f).map((d) => d.kind), ['live'])
  assert.deepEqual(sendDraftsFor({ ...f, openPr: true }), [])
  assert.deepEqual(sendDraftsFor({ ...f, openPr: false }).map((d) => d.kind), ['live'])
})
