import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PRODUCTION_ONLY_REASON, productionOnlyBlock, repoSecretsToSet } from './shared'
import { resealPlan } from './reseal'
import { readRunId, rejectionLabel, signBody, verifySignature } from './callback'
import { NO_ACTIONS_READ_REASON, NO_WORKFLOW_REASON, confirmWorkflowReady } from './workflow-run'

const prod = { NODE_ENV: 'production', VERCEL_ENV: 'production' }
const keys = { ANTHROPIC_API_KEY_BUILDS: 'k', OPS_CALLBACK_SECRET: 's', GITHUB_OPS_TOKEN: 't' }
const website = { type: 'website', evidence: { repoUrl: 'https://github.com/jacobholtzer22-droid/KA-Lights' } }

// ── 2. production only ──────────────────────────────────────────────────────

test('secrets are sealed only when NODE_ENV and VERCEL_ENV are both production', () => {
  assert.equal(productionOnlyBlock(prod), null)
  assert.equal(productionOnlyBlock({ NODE_ENV: 'development' }), PRODUCTION_ONLY_REASON)
  assert.equal(productionOnlyBlock({ NODE_ENV: 'production' }), PRODUCTION_ONLY_REASON)
  assert.equal(productionOnlyBlock({ NODE_ENV: 'production', VERCEL_ENV: 'preview' }), PRODUCTION_ONLY_REASON)
  assert.equal(PRODUCTION_ONLY_REASON, 'secrets must be sealed from production; use the Ops UI')
})

// ── 1. reseal ───────────────────────────────────────────────────────────────

test('reseal plans the two required secrets plus the stock keys that are set', () => {
  const plan = resealPlan(website, { ...prod, ...keys, PEXELS_API_KEY: 'p' })
  assert.deepEqual(plan.blocked, [])
  assert.equal(plan.repo, 'jacobholtzer22-droid/KA-Lights')
  assert.deepEqual(plan.secrets, ['ANTHROPIC_API_KEY', 'OPS_CALLBACK_SECRET', 'PEXELS_API_KEY'])
  assert.deepEqual(repoSecretsToSet({ ...keys, PIXABAY_API_KEY: 'x' }).map((s) => s.name), ['ANTHROPIC_API_KEY', 'OPS_CALLBACK_SECRET', 'PIXABAY_API_KEY'])
})

test('reseal refuses with a clear error when the env vars are missing', () => {
  const plan = resealPlan(website, { ...prod, GITHUB_OPS_TOKEN: 't' })
  assert.deepEqual(plan.blocked, ['env not set: ANTHROPIC_API_KEY_BUILDS, OPS_CALLBACK_SECRET'])
  assert.deepEqual(resealPlan(website, { ...prod, ...keys, GITHUB_OPS_TOKEN: '' }).blocked, ['env not set: GITHUB_OPS_TOKEN'])
})

test('reseal refuses off production, without a repo, and for other deliverables', () => {
  assert.deepEqual(resealPlan(website, keys).blocked, [PRODUCTION_ONLY_REASON])
  assert.deepEqual(resealPlan({ type: 'website', evidence: {} }, { ...prod, ...keys }).blocked, ['no evidence.repoUrl on the website deliverable'])
  assert.deepEqual(resealPlan({ type: 'domain', evidence: {} }, { ...prod, ...keys }).blocked, ['only a website deliverable has a repo'])
  assert.deepEqual(resealPlan(null).blocked, ['deliverable not found'])
})

// ── 3. dispatch guard ───────────────────────────────────────────────────────

async function withFetch(handler: (url: string) => Response, fn: () => Promise<void>) {
  const realFetch = globalThis.fetch
  const realToken = process.env.GITHUB_OPS_TOKEN
  process.env.GITHUB_OPS_TOKEN = 'test-token'
  globalThis.fetch = (async (input: RequestInfo | URL) => handler(String(input))) as typeof fetch
  try {
    await fn()
  } finally {
    globalThis.fetch = realFetch
    if (realToken === undefined) delete process.env.GITHUB_OPS_TOKEN
    else process.env.GITHUB_OPS_TOKEN = realToken
  }
}

test('dispatch is allowed when aa-build.yml reads back and its runs can be listed', async () => {
  await withFetch(
    (url) => (url.includes('/contents/') ? new Response('name: aa-build\n') : Response.json({ workflow_runs: [] })),
    async () => assert.equal(await confirmWorkflowReady('o/r'), null)
  )
})

test('dispatch refuses when the repo has no aa-build.yml', async () => {
  await withFetch(
    () => new Response('Not Found', { status: 404 }),
    async () => assert.equal(await confirmWorkflowReady('o/r'), NO_WORKFLOW_REASON)
  )
  assert.equal(NO_WORKFLOW_REASON, 'repo has no aa-build workflow, run sync-workflow first')
})

test('dispatch refuses when aa-build.yml cannot be read at all', async () => {
  await withFetch(
    () => new Response('boom', { status: 500 }),
    async () => assert.ok((await confirmWorkflowReady('o/r'))?.startsWith(NO_WORKFLOW_REASON))
  )
})

test('dispatch refuses when the Actions runs cannot be listed', async () => {
  await withFetch(
    (url) => (url.includes('/contents/') ? new Response('name: aa-build\n') : new Response('Forbidden', { status: 403 })),
    async () => assert.ok((await confirmWorkflowReady('o/r'))?.startsWith(NO_ACTIONS_READ_REASON))
  )
})

// ── 4. callback rejections ──────────────────────────────────────────────────

test('a rejected callback still yields its run id when the body is JSON', () => {
  assert.equal(readRunId(JSON.stringify({ run_id: 'cmvw0nv4w002rjw07ad70ylsq', status: 'success' })), 'cmvw0nv4w002rjw07ad70ylsq')
  assert.equal(readRunId('not json'), null)
  assert.equal(readRunId(JSON.stringify({ status: 'success' })), null)
  assert.equal(readRunId(JSON.stringify({ run_id: 42 })), null)
  assert.equal(readRunId(JSON.stringify({ run_id: '../../etc' })), null)
})

test('the rejection line names the repo, the status and the reason', () => {
  assert.equal(rejectionLabel('o/KA-Lights', 401, 'bad signature'), 'Callback from o/KA-Lights rejected (401): bad signature')
  assert.equal(rejectionLabel(null, 404, 'no agent run x'), 'Callback from an unknown repo rejected (404): no agent run x')
})

test('a body signed with another secret fails verification', () => {
  const body = JSON.stringify({ run_id: 'r1', status: 'success' })
  assert.equal(verifySignature(body, signBody(body, 'production'), 'production'), true)
  assert.equal(verifySignature(body, signBody(body, 'local'), 'production'), false)
  assert.equal(verifySignature(body, null, 'production'), false)
})
