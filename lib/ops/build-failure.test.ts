// ===========================================
// /admin/ops build failure excerpt tests
// ===========================================
// Run: npm test.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { failureReason, readFailureTail } from './build-failure'

test('readFailureTail keeps text and drops empties and non-strings', () => {
  assert.equal(readFailureTail('  npm run build failed\n'), 'npm run build failed')
  assert.equal(readFailureTail(''), null)
  assert.equal(readFailureTail('   \n '), null)
  assert.equal(readFailureTail(null), null)
  assert.equal(readFailureTail(42), null)
})

test('readFailureTail keeps the end of an oversized tail', () => {
  const t = readFailureTail(`${'a'.repeat(5000)}END`)!
  assert.equal(t.length, 4000)
  assert.ok(t.endsWith('END'))
})

test('failureReason is the last non-empty line, capped', () => {
  assert.equal(failureReason('Type error in app/page.tsx\n\nverify: 2 checks failed\n  '), 'verify: 2 checks failed')
  assert.equal(failureReason('Claude stopped without a result (error_max_turns)'), 'Claude stopped without a result (error_max_turns)')
  assert.equal(failureReason(null), null)
  const long = failureReason('x'.repeat(400))!
  assert.equal(long.length, 300)
  assert.ok(long.endsWith('...'))
})
