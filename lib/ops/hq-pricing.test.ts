// ===========================================
// Ops HQ: what a model turn cost
// ===========================================
// Run: npm test. Pure. (Lives in lib/ops so the npm test glob picks it up.)

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { formatUsd, priceFor, sumUsage, turnCost, usageLabel } from './hq/pricing'

const close = (a: number | null, b: number) => assert.ok(a !== null && Math.abs(a - b) < 1e-9, `${a} != ${b}`)

test('Opus 5.5: input, output, cache reads and 5-minute cache writes each at their own rate', () => {
  const u = turnCost('claude-opus-5-5', { input_tokens: 1_000_000, output_tokens: 1_000_000, cache_read_input_tokens: 1_000_000, cache_creation_input_tokens: 1_000_000 })
  // 4 + 20 + 0.20 + 4 * 1.25
  close(u.costUsd, 29.2)
  assert.equal(u.cacheReadTokens, 1_000_000)
})

test('Sonnet 5.5 at its own prices, and 1-hour cache writes at 2x input', () => {
  const u = turnCost('claude-sonnet-5-5', {
    input_tokens: 500_000,
    output_tokens: 100_000,
    cache_creation_input_tokens: 400_000,
    cache_creation: { ephemeral_5m_input_tokens: 300_000, ephemeral_1h_input_tokens: 100_000 },
  })
  // 0.5*2 + 0.1*10 + 0.3*2*1.25 + 0.1*2*2
  close(u.costUsd, 1 + 1 + 0.75 + 0.4)
})

test('a dated or prefixed model id prices as its base model; an unknown one prices as null but still counts tokens', () => {
  assert.deepEqual(priceFor('claude-opus-5-5-20260401'), priceFor('claude-opus-5-5'))
  assert.deepEqual(priceFor('anthropic.claude-sonnet-5-5'), priceFor('claude-sonnet-5-5'))
  // claude-opus-5-5 must not be matched as claude-opus-5
  assert.equal(priceFor('claude-opus-5-5')?.input, 4)
  const u = turnCost('claude-future-9', { input_tokens: 10, output_tokens: 5 })
  assert.equal(u.costUsd, null)
  assert.equal(u.inputTokens, 10)
})

test('a fallback turn prices each iteration on the model that ran it', () => {
  const u = turnCost('claude-opus-5', {
    input_tokens: 999,
    output_tokens: 999,
    iterations: [
      { type: 'message', model: 'claude-opus-5-5', input_tokens: 1_000_000, output_tokens: 0 },
      { type: 'fallback_message', model: 'claude-opus-5', input_tokens: 1_000_000, output_tokens: 0 },
    ],
  })
  close(u.costUsd, 4 + 5)
  assert.equal(u.inputTokens, 2_000_000)
})

test('missing or junk usage costs nothing, and sums carry a null through', () => {
  assert.equal(turnCost('claude-opus-5-5', null).costUsd, 0)
  assert.equal(turnCost('claude-opus-5-5', { input_tokens: -5, output_tokens: 'x' }).costUsd, 0)
  const a = turnCost('claude-opus-5-5', { input_tokens: 1000 })
  const b = turnCost('unknown', { input_tokens: 1000 })
  assert.equal(sumUsage([a, a]).inputTokens, 2000)
  assert.equal(sumUsage([a, b]).costUsd, null)
})

test('labels and dollar formatting', () => {
  assert.equal(formatUsd(0.0421), '$0.042')
  assert.equal(formatUsd(3.456), '$3.46')
  assert.equal(formatUsd(1234.4), '$1,234')
  const u = turnCost('claude-sonnet-5-5', { input_tokens: 1200, cache_read_input_tokens: 40000, output_tokens: 800 })
  assert.equal(usageLabel(3, u), 'Turn 3 $0.018: 1,200 in, 40,000 cached, 800 out')
  assert.ok(!/\u2014/.test(usageLabel(null, turnCost('x', {}))))
})
