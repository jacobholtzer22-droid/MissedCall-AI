// ===========================================
// OPS_AUTOFLOW: build credit is out
// ===========================================
// Run: npm test. Pure.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { averageRunCost, creditSetupItem, isCreditFailure } from './build-credit'

test('credit failures are recognised in the run error and in the workflow failure tail', () => {
  assert.equal(isCreditFailure('Anthropic HTTP 400: Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.'), true)
  assert.equal(isCreditFailure(null, 'API Error: 400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low"}}'), true)
  assert.equal(isCreditFailure(null, 'Credit balance is too low'), true)
  assert.equal(isCreditFailure('gate red: failing #8', 'Claude stopped without a result (max turns)'), false)
  assert.equal(isCreditFailure('Anthropic HTTP 529: Overloaded'), false)
  assert.equal(isCreditFailure(null, undefined), false)
})

test('setup item: average recorded cost, or "cost not recorded"', () => {
  assert.equal(creditSetupItem(null), 'Build credit is out: add credit to the ANTHROPIC_API_KEY_BUILDS account; cost not recorded.')
  assert.equal(creditSetupItem(averageRunCost([{ costUsd: 2 }, { costUsd: 3.5 }, {}, null, { costUsd: 'x' }])), 'Build credit is out: add credit to the ANTHROPIC_API_KEY_BUILDS account; last runs cost about $2.75 each.')
  assert.equal(creditSetupItem(14.4), 'Build credit is out: add credit to the ANTHROPIC_API_KEY_BUILDS account; last runs cost about $14 each.')
  assert.equal(averageRunCost([{}, { report: 'x' }]), null)
})

test('flag off: the job report adds no setup line (gated in chief.ts)', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('./hq/chief.ts', import.meta.url), 'utf8')
  assert.match(src, /const creditCost = autoflowEnabled\(\) && /)
  assert.match(src, /creditCost !== undefined && r\.status === 'failed'/)
})
