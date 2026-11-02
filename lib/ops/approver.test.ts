// ===========================================
// M14: every apply carries the approval and who pushed it
// ===========================================
// Run: npm test. Pure, plus source checks for the paths that need the database.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { applyRunLine, approvalStamp, approverOf, pushedByLine } from './approver'

const src = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8')

test('the approver from an approval detail', () => {
  assert.deepEqual(approverOf({ decidedBy: 'jacob', decidedVia: 'hq' }), { decidedBy: 'jacob', decidedVia: 'hq' })
  assert.deepEqual(approverOf({ decidedBy: 'jacob' }), { decidedBy: 'jacob', decidedVia: 'unknown' })
  assert.equal(approverOf({}), null)
  assert.equal(approverOf(null), null)
})

test('the activity line for every applied card', () => {
  assert.equal(pushedByLine('ap1', 'Merge the site PR #4', { decidedBy: 'jacob', decidedVia: 'hq' }), 'Pushed by jacob via hq (approval ap1): Merge the site PR #4')
  assert.equal(pushedByLine('ap1', 'X', null), 'Pushed by jacob (not recorded) via unknown (approval ap1): X')
})

test('apply run input: ads (approval object) and go_live (flat stamp) both print', () => {
  const by = { decidedBy: 'jacob', decidedVia: 'telegram' }
  assert.deepEqual(approvalStamp('ap2', by), { approvalId: 'ap2', decidedBy: 'jacob', decidedVia: 'telegram' })
  const ads = { allow: ['pause_keyword'], approval: { id: 'ap2', action: 'pause_keyword', args: {}, ...by }, approvalId: 'ap2' }
  assert.equal(applyRunLine(ads), 'Applied approval ap2, pushed by jacob via telegram')
  assert.equal(applyRunLine({ kind: 'go_live', ...approvalStamp('ap3', { decidedBy: 'jacob', decidedVia: 'hq' }) }), 'Applied approval ap3, pushed by jacob via hq')
  assert.equal(applyRunLine({ approvalId: 'ap4' }), 'Applied approval ap4, pushed by jacob (not recorded) via unknown')
  assert.equal(applyRunLine({ instructions: 'x' }), null)
})

test('decideApproval stamps every apply path (OPS_AUTOFLOW)', () => {
  const s = src('./hq/approvals.ts')
  assert.match(s, /const stamp = autoflowEnabled\(\) \? approvalStamp\(id, by\) : null/)
  // ads apply run: the approver rides on input.approval
  assert.match(s, /\.\.\.\(stamp \? \{ decidedBy: stamp\.decidedBy, decidedVia: stamp\.decidedVia \} : \{\}\)/)
  // web_push gets the stamp in its detail (go_live puts it on the dispatched run)
  assert.match(s, /applyWebPush\(\{ id, jobId: approval\.jobId, detail: stamp \? \{ \.\.\.detail, \.\.\.stamp \} : detail \}\)/)
  // one "Pushed by" activity per applied card: web_push, account cards, link cards, stripe_subscription, admin_change, ads apply start
  assert.equal(s.match(/await pushedNote\(\)/g)?.length, 6)
  const w = src('./hq/web.ts')
  assert.match(w, /approvalId: d\.approvalId, decidedBy: d\.decidedBy \?\? null, decidedVia: d\.decidedVia \?\? null/)
})

test('the ads apply run already carried the approval id; it still does', () => {
  assert.match(src('./hq/ads.ts'), /allow: \[opts\.approval\.action\], approval: opts\.approval, approvalId: opts\.approval\.id/)
})

test('the job report prints the approval and the approver (OPS_AUTOFLOW)', () => {
  const c = src('./hq/chief.ts')
  assert.match(c, /pushedBy: pushedByLine\(a\.id, a\.title, approverOf\(a\.detail\)\)/)
  assert.match(c, /appliedApproval: applyRunLine\(r\.input\)/)
  assert.match(c, /the report always says which approval a change came from and who pushed it/)
})
