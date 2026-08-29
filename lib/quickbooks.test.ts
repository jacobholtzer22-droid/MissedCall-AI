// ===========================================
// QUICKBOOKS OAUTH STATE + WEBHOOK SIGNATURE TESTS
// ===========================================
// Run: npm test
//
// Both functions under test are security boundaries that fail SILENTLY when they
// are wrong. A broken state check does not throw — it just accepts a forged
// callback and binds someone else's QuickBooks company to a tenant. A broken
// signature check does not throw either — it just accepts unauthenticated
// webhooks that will queue review texts to strangers' customers. So the
// interesting assertions here are the REJECTIONS, not the happy paths.

import { test } from 'node:test'
import assert from 'node:assert/strict'

// Set before import so the module's per-call env reads see them. These are test
// fixtures, not real credentials.
process.env.QUICKBOOKS_STATE_SECRET = 'test-state-secret-do-not-use'
process.env.QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN = 'test-verifier-token-do-not-use'
process.env.QUICKBOOKS_CLIENT_ID = 'test-client-id'
process.env.QUICKBOOKS_CLIENT_SECRET = 'test-client-secret'
process.env.QUICKBOOKS_REDIRECT_URI = 'https://www.alignandacquire.com/api/auth/quickbooks/callback'

import crypto from 'crypto'
import {
  getQbAuthUrl,
  verifyQbState,
  verifyIntuitSignature,
  buildRefreshUpdateData,
} from './quickbooks'

const BUSINESS_ID = 'clx1234567890abcdefghijk'

/** Pull the state parameter back out of a generated consent URL. */
function stateFromAuthUrl(businessId: string): string {
  const url = new URL(getQbAuthUrl(businessId))
  const state = url.searchParams.get('state')
  assert.ok(state, 'auth url must carry a state parameter')
  return state
}

/** Re-encode a state after mutating one of its three fields. */
function reassembleState(businessId: string, nonce: string, signature: string): string {
  return Buffer.from(`${businessId}.${nonce}.${signature}`, 'utf8').toString('base64url')
}

function decodeState(state: string): [string, string, string] {
  const parts = Buffer.from(state, 'base64url').toString('utf8').split('.')
  assert.equal(parts.length, 3, 'state should decode to exactly three fields')
  return [parts[0], parts[1], parts[2]]
}

// ── verifyQbState ────────────────────────────────────────────────────────────

test('verifyQbState: accepts a state produced by getQbAuthUrl', () => {
  const state = stateFromAuthUrl(BUSINESS_ID)
  assert.equal(verifyQbState(state), BUSINESS_ID)
})

test('verifyQbState: rejects a tampered businessId', () => {
  // The whole point. An attacker swaps in their own tenant id and keeps the
  // signature, hoping the callback trusts the payload — the exact hole left open
  // by the bare-businessId state in app/api/auth/google/route.ts.
  const [businessId, nonce, signature] = decodeState(stateFromAuthUrl(BUSINESS_ID))
  assert.equal(businessId, BUSINESS_ID)
  const forged = reassembleState('clxVICTIMbusinessid00000', nonce, signature)
  assert.equal(verifyQbState(forged), null)
})

test('verifyQbState: rejects a tampered nonce', () => {
  const [businessId, nonce, signature] = decodeState(stateFromAuthUrl(BUSINESS_ID))
  const flipped = nonce.slice(0, -1) + (nonce.endsWith('a') ? 'b' : 'a')
  assert.notEqual(flipped, nonce)
  assert.equal(verifyQbState(reassembleState(businessId, flipped, signature)), null)
})

test('verifyQbState: rejects a tampered signature', () => {
  const [businessId, nonce, signature] = decodeState(stateFromAuthUrl(BUSINESS_ID))
  const flipped = signature.slice(0, -1) + (signature.endsWith('A') ? 'B' : 'A')
  assert.notEqual(flipped, signature)
  assert.equal(verifyQbState(reassembleState(businessId, nonce, flipped)), null)
})

test('verifyQbState: rejects a signature of the right shape from the wrong secret', () => {
  // A same-length, correctly-formatted HMAC computed with a different key. This
  // is what a length-only check or a truthiness check would wave through.
  const [businessId, nonce] = decodeState(stateFromAuthUrl(BUSINESS_ID))
  const wrong = crypto
    .createHmac('sha256', 'a-different-secret')
    .update(`${businessId}.${nonce}`)
    .digest('base64url')
  assert.equal(verifyQbState(reassembleState(businessId, nonce, wrong)), null)
})

test('verifyQbState: rejects garbage input', () => {
  for (const garbage of [
    '',
    'not-base64url-at-all!!!',
    'YWJjZGVm', // valid base64url, decodes to "abcdef" — no dots
    Buffer.from('only.two', 'utf8').toString('base64url'),
    Buffer.from('a.b.c.d', 'utf8').toString('base64url'),
    Buffer.from('..', 'utf8').toString('base64url'), // three empty fields
  ]) {
    assert.equal(verifyQbState(garbage), null, `expected null for ${JSON.stringify(garbage)}`)
  }
})

test('verifyQbState: fails closed when the state secret is unset', () => {
  const state = stateFromAuthUrl(BUSINESS_ID)
  const saved = process.env.QUICKBOOKS_STATE_SECRET
  delete process.env.QUICKBOOKS_STATE_SECRET
  try {
    assert.equal(verifyQbState(state), null)
  } finally {
    process.env.QUICKBOOKS_STATE_SECRET = saved
  }
})

test('getQbAuthUrl: carries the accounting scope and a fresh nonce each call', () => {
  const url = new URL(getQbAuthUrl(BUSINESS_ID))
  assert.equal(url.origin + url.pathname, 'https://appcenter.intuit.com/connect/oauth2')
  assert.equal(url.searchParams.get('scope'), 'com.intuit.quickbooks.accounting')
  assert.equal(url.searchParams.get('response_type'), 'code')
  assert.equal(url.searchParams.get('client_id'), 'test-client-id')

  // Two consecutive calls must not produce the same state.
  assert.notEqual(stateFromAuthUrl(BUSINESS_ID), stateFromAuthUrl(BUSINESS_ID))
})

test('getQbAuthUrl: rejects a businessId containing the state delimiter', () => {
  assert.throws(() => getQbAuthUrl('has.a.dot'), /Invalid businessId/)
})

// ── verifyIntuitSignature ────────────────────────────────────────────────────

const WEBHOOK_BODY = JSON.stringify({
  eventNotifications: [
    {
      realmId: '1234567890',
      dataChangeEvent: {
        entities: [
          { name: 'Payment', id: '42', operation: 'Create', lastUpdated: '2026-08-29T12:00:00-0700' },
        ],
      },
    },
  ],
})

function sign(body: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(body, 'utf8').digest('base64')
}

test('verifyIntuitSignature: accepts a correct base64 HMAC-SHA256 of the raw body', () => {
  const signature = sign(WEBHOOK_BODY, 'test-verifier-token-do-not-use')
  assert.equal(verifyIntuitSignature(WEBHOOK_BODY, signature), true)
})

test('verifyIntuitSignature: rejects a signature made with the wrong secret', () => {
  const signature = sign(WEBHOOK_BODY, 'attacker-guessed-token')
  assert.equal(verifyIntuitSignature(WEBHOOK_BODY, signature), false)
})

test('verifyIntuitSignature: rejects a missing header', () => {
  assert.equal(verifyIntuitSignature(WEBHOOK_BODY, null), false)
  assert.equal(verifyIntuitSignature(WEBHOOK_BODY, ''), false)
})

test('verifyIntuitSignature: rejects an empty body', () => {
  // Even when the header is a genuine HMAC of the empty string. An empty webhook
  // carries nothing to act on, so there is no reason to accept it.
  assert.equal(verifyIntuitSignature('', sign('', 'test-verifier-token-do-not-use')), false)
})

test('verifyIntuitSignature: rejects a body modified after signing', () => {
  const signature = sign(WEBHOOK_BODY, 'test-verifier-token-do-not-use')
  const tampered = WEBHOOK_BODY.replace('"42"', '"43"')
  assert.notEqual(tampered, WEBHOOK_BODY)
  assert.equal(verifyIntuitSignature(tampered, signature), false)
})

test('verifyIntuitSignature: rejects hex encoding of the correct HMAC', () => {
  // Intuit sends base64. A hex digest is the most likely implementation slip and
  // would otherwise be a same-secret, same-algorithm near miss.
  const hex = crypto
    .createHmac('sha256', 'test-verifier-token-do-not-use')
    .update(WEBHOOK_BODY, 'utf8')
    .digest('hex')
  assert.equal(verifyIntuitSignature(WEBHOOK_BODY, hex), false)
})

test('verifyIntuitSignature: fails closed when the verifier token is unset', () => {
  const signature = sign(WEBHOOK_BODY, 'test-verifier-token-do-not-use')
  const saved = process.env.QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN
  delete process.env.QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN
  try {
    assert.equal(verifyIntuitSignature(WEBHOOK_BODY, signature), false)
  } finally {
    process.env.QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN = saved
  }
})

// ── buildRefreshUpdateData ───────────────────────────────────────────────────
// The refresh path itself needs a database, so these cover the one piece of it
// that is pure. Everything asserted here is a silent-failure mode: the write
// still succeeds, it just persists the wrong thing.

const REFRESHED_AT = 1_800_000_000_000 // fixed epoch ms, no wall clock in tests

test('buildRefreshUpdateData: always re-asserts quickbooksConnected: true', () => {
  // Regression. The failure path sets quickbooksConnected false and NOTHING else
  // ever sets it back, so omitting it here means one transient Intuit 5xx marks a
  // business permanently disconnected while every later refresh quietly succeeds.
  const data = buildRefreshUpdateData(
    { access_token: 'at', refresh_token: 'rt', expires_in: 3600, x_refresh_token_expires_in: 8726400 },
    REFRESHED_AT
  )
  assert.equal(data.quickbooksConnected, true)
  assert.equal(data.qbLastRefreshError, null)
})

test('buildRefreshUpdateData: reconnects even when the response carries only a refresh token', () => {
  // The degenerate success: refresh accepted, rotation issued, no access token.
  // The connection is alive and must not stay flagged as broken.
  const data = buildRefreshUpdateData({ refresh_token: 'rotated' }, REFRESHED_AT)
  assert.equal(data.quickbooksConnected, true)
  assert.equal(data.qbLastRefreshError, null)
  assert.equal(data.qbRefreshToken, 'rotated')
  assert.equal(data.qbAccessToken, undefined)
})

test('buildRefreshUpdateData: persists a rotated refresh token independently of the access token', () => {
  // The Google bug this module exists to avoid: google-calendar.ts writes the
  // rotated refresh token only inside `if (credentials.access_token)`.
  const data = buildRefreshUpdateData(
    { refresh_token: 'rotated', x_refresh_token_expires_in: 8726400 },
    REFRESHED_AT
  )
  assert.equal(data.qbRefreshToken, 'rotated')
  assert.deepEqual(data.qbRefreshTokenExpiresAt, new Date(REFRESHED_AT + 8726400 * 1000))
})

test('buildRefreshUpdateData: never nulls a known refresh expiry when Intuit omits one', () => {
  // Absent x_refresh_token_expires_in must leave the stored expiry alone. Writing
  // null would disable the fail-fast check in getValidQbAccessToken.
  const data = buildRefreshUpdateData({ access_token: 'at', refresh_token: 'rt' }, REFRESHED_AT)
  assert.ok(!('qbRefreshTokenExpiresAt' in data))
})

test('buildRefreshUpdateData: computes the access token expiry from expires_in', () => {
  const data = buildRefreshUpdateData({ access_token: 'at', expires_in: 3600 }, REFRESHED_AT)
  assert.equal(data.qbAccessToken, 'at')
  assert.deepEqual(data.qbAccessTokenExpiresAt, new Date(REFRESHED_AT + 3_600_000))
})

test('buildRefreshUpdateData: leaves the access expiry null when expires_in is absent', () => {
  const data = buildRefreshUpdateData({ access_token: 'at' }, REFRESHED_AT)
  assert.equal(data.qbAccessTokenExpiresAt, null)
})

test('verifyIntuitSignature: a re-serialised body does not verify', () => {
  // Guards the raw-body contract. Intuit's own sample hashes
  // JSON.stringify(req.body); this asserts why that is wrong — key order alone
  // changes the digest, so the caller must pass the bytes Intuit actually sent.
  const signature = sign(WEBHOOK_BODY, 'test-verifier-token-do-not-use')
  const reserialised = JSON.stringify(JSON.parse(WEBHOOK_BODY), ['eventNotifications', 'realmId'])
  assert.notEqual(reserialised, WEBHOOK_BODY)
  assert.equal(verifyIntuitSignature(reserialised, signature), false)
})
