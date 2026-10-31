// ===========================================
// /admin/ops build failure excerpt tests
// ===========================================
// Run: npm test.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { failureReason, gateErrorLine, gateReason, readFailureTail } from './build-failure'

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

test('gateErrorLine picks the build error out of next build noise', () => {
  const tail = [
    '> aa-site@1.0.0 verify',
    '> next build && tsx scripts/verify.ts',
    'Failed to compile.',
    '',
    './content/services/decks.mdx',
    "Module not found: Can't resolve '/images/stock-deck-3.jpg'",
    '> Build failed because of webpack errors',
    'npm error Lifecycle script `verify` failed with error:',
  ].join('\n')
  assert.equal(gateErrorLine(tail), "Module not found: Can't resolve '/images/stock-deck-3.jpg'")
  assert.equal(gateErrorLine('Error occurred prerendering page "/gallery".\nError: no image stock-2.jpg in manifest'), 'Error occurred prerendering page "/gallery".')
  assert.equal(gateErrorLine(''), null)
  assert.equal(gateErrorLine(null), null)
})

test('gateReason says what broke on a red gate and nothing otherwise', () => {
  const tail = "Failed to compile.\nModule not found: Can't resolve '/images/stock-a.jpg'"
  assert.equal(gateReason(false, ['next build'], tail), "gate red: next build failed on Module not found: Can't resolve '/images/stock-a.jpg'")
  assert.equal(gateReason(false, ['#4', '#21'], 'FAILED: #4, #21. Do not deploy.'), 'gate red: failing #4, #21')
  assert.equal(gateReason(false, [], null), 'gate red')
  assert.equal(gateReason(true, [], tail), null)
  assert.equal(gateReason(null, [], tail), null)
})
