// ===========================================
// QUICKBOOKS / INTUIT - OAuth, token lifecycle, webhook signature, entity reads
// ===========================================
// Module shape mirrors lib/google-calendar.ts, but deliberately diverges from it
// in three places that are bugs there and would be fatal here. Each divergence is
// marked "DIVERGES FROM GOOGLE" below. Read those before editing:
//
//   1. State is SIGNED. The Google flow puts a bare businessId in `state` with no
//      verification, so anyone who can reach the callback can attach their own
//      QuickBooks company to any business row.
//   2. Access tokens are cached and only refreshed when actually expired.
//      getValidAccessToken() in google-calendar.ts calls refreshAccessToken() on
//      EVERY invocation, which works only because Google's refresh tokens do not
//      rotate and do not idle-expire. Both are false for QuickBooks.
//   3. A rotated refresh_token is persisted OUTSIDE any "if access token present"
//      guard. QBO issues a NEW refresh token on every single refresh and expires
//      an idle one after 100 days. Dropping one rotation bricks the connection
//      permanently and the only recovery is a fresh consent.
//
// Endpoints, scope, token field names and the signature scheme below were verified
// against current Intuit sources — see the citation block in each section.
//
// This module NEVER sends SMS, and never writes ReviewRequest, Contact, or
// Conversation rows. It is transport and token plumbing only.

import crypto from 'crypto'
import { db } from '@/lib/db'

const LOG = '[QUICKBOOKS]'

// Verified 2026-08-29 against the Intuit OIDC discovery documents:
//   https://developer.api.intuit.com/.well-known/openid_configuration
//   https://developer.api.intuit.com/.well-known/openid_sandbox_configuration
// Both documents return the SAME authorization_endpoint and token_endpoint — only
// the userinfo endpoint and the API base URL differ by environment. Do not
// "fix" this by inventing a sandbox token endpoint; there isn't one.
const AUTHORIZE_ENDPOINT = 'https://appcenter.intuit.com/connect/oauth2'
const TOKEN_ENDPOINT = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer'

// Verified against intuit/oauth-jsclient (Intuit's own SDK), src/OAuthClient.js.
const ACCOUNTING_SCOPE = 'com.intuit.quickbooks.accounting'
const API_BASE_URL = {
  sandbox: 'https://sandbox-quickbooks.api.intuit.com',
  production: 'https://quickbooks.api.intuit.com',
} as const

export type QbEnvironment = keyof typeof API_BASE_URL
export type QbEntity = 'Invoice' | 'Payment' | 'Customer'

// Refresh this far BEFORE the stored expiry, so a token cannot die mid-request.
const ACCESS_TOKEN_SKEW_MS = 5 * 60 * 1000

const HTTP_TIMEOUT_MS = 15_000

const STATE_NONCE_BYTES = 16

/** Intuit's token response. Field names verified against intuit/oauth-jsclient
 *  src/access-token/Token.js, which stores exactly these keys. Note the
 *  non-standard `x_refresh_token_expires_in` — it has no OAuth2 equivalent and is
 *  the only signal for the 100-day idle expiry. */
type QbTokenResponse = {
  access_token?: string
  refresh_token?: string
  token_type?: string
  expires_in?: number
  x_refresh_token_expires_in?: number
}

// ── env ──────────────────────────────────────────────────────────────────────
// Read per call, not at module load, so a value can be changed without a code
// change (same reasoning as getSpamThreshold in lib/spam-score.ts).

const MISSING_ENV_MESSAGE = 'Missing required env var'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${LOG} ${MISSING_ENV_MESSAGE} ${name}`)
  return value
}

/**
 * True when an error is "this integration was never configured" rather than
 * "the integration failed". The OAuth routes use it to redirect to a
 * ?qb_error=not_configured message instead of returning a 500, so a half-set-up
 * tenant sees an explanation rather than a crash.
 */
export function isQbNotConfiguredError(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith(`${LOG} ${MISSING_ENV_MESSAGE}`)
}

/**
 * sandbox | production. Throws when unset or unrecognised — deliberately loud.
 * Defaulting either way is worse than failing: defaulting to production would
 * have a misconfigured deploy read a real company's books, and defaulting to
 * sandbox would have production silently read an empty test company forever.
 */
export function getQbEnvironment(): QbEnvironment {
  const raw = (process.env.QUICKBOOKS_ENVIRONMENT ?? '').trim().toLowerCase()
  if (raw === 'sandbox' || raw === 'production') return raw
  throw new Error(
    `${LOG} QUICKBOOKS_ENVIRONMENT must be "sandbox" or "production" (got ${raw ? `"${raw}"` : 'empty'})`
  )
}

export function getQbApiBaseUrl(): string {
  return API_BASE_URL[getQbEnvironment()]
}

// ── signed state ─────────────────────────────────────────────────────────────

function signState(businessId: string, nonce: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(`${businessId}.${nonce}`).digest('base64url')
}

/**
 * Intuit consent URL for one business.
 *
 * DIVERGES FROM GOOGLE: `state` is businessId + random nonce + an HMAC-SHA256 of
 * both, base64url encoded. app/api/auth/google/route.ts passes a bare businessId
 * and its callback trusts whatever comes back, so a crafted callback can bind an
 * attacker's calendar to any tenant. Here the callback rejects anything it did
 * not sign. The nonce makes each URL single-use-looking and keeps two consent
 * attempts for the same business from producing an identical state string.
 */
export function getQbAuthUrl(businessId: string): string {
  const clientId = requireEnv('QUICKBOOKS_CLIENT_ID')
  const redirectUri = requireEnv('QUICKBOOKS_REDIRECT_URI')
  const stateSecret = requireEnv('QUICKBOOKS_STATE_SECRET')

  // '.' is the state delimiter. cuid() never emits one, but a caller could pass
  // anything, and a businessId containing '.' would silently split wrong.
  if (!businessId || businessId.includes('.')) {
    throw new Error(`${LOG} Invalid businessId for OAuth state`)
  }

  const nonce = crypto.randomBytes(STATE_NONCE_BYTES).toString('hex')
  const signature = signState(businessId, nonce, stateSecret)
  const state = Buffer.from(`${businessId}.${nonce}.${signature}`, 'utf8').toString('base64url')

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    scope: ACCOUNTING_SCOPE,
    redirect_uri: redirectUri,
    state,
  })
  return `${AUTHORIZE_ENDPOINT}?${params.toString()}`
}

/**
 * Verify a state parameter and recover the businessId. Returns null on anything
 * that does not verify — tampering, truncation, garbage, or a missing secret.
 * Never throws: a bad callback is an expected condition, not an exception.
 */
export function verifyQbState(state: string): string | null {
  if (!state) return null

  const stateSecret = process.env.QUICKBOOKS_STATE_SECRET
  if (!stateSecret) {
    // Fail closed. Without the secret nothing can be verified, and accepting the
    // state anyway would hand back exactly the vulnerability this function exists
    // to close.
    console.error(`${LOG} QUICKBOOKS_STATE_SECRET is not set — rejecting OAuth state`)
    return null
  }

  let decoded: string
  try {
    decoded = Buffer.from(state, 'base64url').toString('utf8')
  } catch {
    return null
  }

  const parts = decoded.split('.')
  if (parts.length !== 3) return null

  const [businessId, nonce, signature] = parts
  if (!businessId || !nonce || !signature) return null

  const expected = signState(businessId, nonce, stateSecret)
  const provided = Buffer.from(signature, 'utf8')
  const computed = Buffer.from(expected, 'utf8')
  // timingSafeEqual throws on a length mismatch, so length is checked first. The
  // length itself is not secret — it is a fixed function of the HMAC.
  if (provided.length !== computed.length) return null
  if (!crypto.timingSafeEqual(provided, computed)) return null

  return businessId
}

// ── token endpoint ───────────────────────────────────────────────────────────

/**
 * POST to Intuit's token endpoint. HTTP Basic with the client id and secret plus
 * application/x-www-form-urlencoded — verified against intuit/oauth-jsclient
 * src/OAuthClient.js, and allowed by token_endpoint_auth_methods_supported
 * ("client_secret_basic") in the discovery document.
 */
async function postToken(body: URLSearchParams): Promise<QbTokenResponse> {
  const clientId = requireEnv('QUICKBOOKS_CLIENT_ID')
  const clientSecret = requireEnv('QUICKBOOKS_CLIENT_SECRET')
  const basic = Buffer.from(`${clientId}:${clientSecret}`, 'utf8').toString('base64')

  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  })

  const text = await res.text()
  if (!res.ok) {
    // Intuit puts the reason in the body (invalid_grant, invalid_client...). The
    // body carries no token on an error path, so it is safe to surface.
    throw new Error(`${LOG} Token endpoint returned ${res.status} ${res.statusText}: ${text.slice(0, 300)}`)
  }

  try {
    return JSON.parse(text) as QbTokenResponse
  } catch {
    throw new Error(`${LOG} Token endpoint returned unparseable JSON (${res.status})`)
  }
}

function expiryFrom(seconds: number | undefined, now: number): Date | null {
  return typeof seconds === 'number' && Number.isFinite(seconds) ? new Date(now + seconds * 1000) : null
}

/** The Business update a successful refresh produces. */
export type QbRefreshUpdate = {
  quickbooksConnected: true
  qbLastRefreshError: null
  qbRefreshToken?: string
  qbRefreshTokenExpiresAt?: Date
  qbAccessToken?: string
  qbAccessTokenExpiresAt?: Date | null
}

/**
 * Build the Business update for a successful refresh. Extracted from
 * getValidQbAccessToken purely so it can be tested without a database — it is
 * the one piece of that function with branching worth asserting.
 *
 * Two invariants live here, both regressions waiting to happen:
 *
 *   - `quickbooksConnected: true` is ALWAYS set. The failure path sets it false,
 *     so without this a single transient Intuit 5xx would mark a business
 *     disconnected permanently, even though every later refresh succeeds. There
 *     is no other code path that flips it back.
 *   - A rotated `refresh_token` is copied whenever the response carries one,
 *     independent of whether an access token came with it. QBO rotates on every
 *     refresh and invalidates the previous token immediately.
 */
export function buildRefreshUpdateData(tokens: QbTokenResponse, refreshedAt: number): QbRefreshUpdate {
  const data: QbRefreshUpdate = { quickbooksConnected: true, qbLastRefreshError: null }

  if (tokens.refresh_token) {
    data.qbRefreshToken = tokens.refresh_token
    const rotatedExpiry = expiryFrom(tokens.x_refresh_token_expires_in, refreshedAt)
    // Only overwrite when Intuit told us; never null out a known expiry.
    if (rotatedExpiry) data.qbRefreshTokenExpiresAt = rotatedExpiry
  }
  if (tokens.access_token) {
    data.qbAccessToken = tokens.access_token
    data.qbAccessTokenExpiresAt = expiryFrom(tokens.expires_in, refreshedAt)
  }

  return data
}

/**
 * Exchange an authorization code for tokens and persist the connection.
 *
 * realmId is the Intuit company id. It arrives ONLY as a query parameter on the
 * callback — it is not in the token response and cannot be recovered later — so
 * it is written in the same statement as the tokens.
 *
 * Throws on an incomplete response rather than marking the business connected.
 * exchangeCodeForTokens in lib/google-calendar.ts learned this the hard way: a
 * consent returning no refresh token used to flag a business connected while
 * every later call failed.
 */
export async function exchangeQbCodeForTokens(
  code: string,
  realmId: string,
  businessId: string
): Promise<void> {
  if (!code) throw new Error(`${LOG} Missing authorization code`)
  if (!realmId) {
    throw new Error(`${LOG} Callback carried no realmId — the company id cannot be recovered later`)
  }

  const redirectUri = requireEnv('QUICKBOOKS_REDIRECT_URI')
  const tokens = await postToken(
    new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri })
  )

  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error(
      `${LOG} Token response was incomplete (access_token: ${tokens.access_token ? 'present' : 'MISSING'}, ` +
        `refresh_token: ${tokens.refresh_token ? 'present' : 'MISSING'}) — not marking business connected`
    )
  }

  const now = Date.now()
  await db.business.update({
    where: { id: businessId },
    data: {
      qbRealmId: realmId,
      qbAccessToken: tokens.access_token,
      qbRefreshToken: tokens.refresh_token,
      qbAccessTokenExpiresAt: expiryFrom(tokens.expires_in, now),
      qbRefreshTokenExpiresAt: expiryFrom(tokens.x_refresh_token_expires_in, now),
      quickbooksConnected: true,
      qbLastRefreshError: null,
    },
  })

  console.log(`${LOG} Connected business ${businessId} to realm ${realmId}`)
}

/**
 * Return a usable access token, refreshing only when necessary.
 *
 * DIVERGES FROM GOOGLE, three ways — see the module header. Do not "simplify"
 * this into the google-calendar.ts shape.
 */
export async function getValidQbAccessToken(businessId: string): Promise<string | null> {
  const business = await db.business.findUnique({
    where: { id: businessId },
    select: {
      qbAccessToken: true,
      qbRefreshToken: true,
      qbAccessTokenExpiresAt: true,
      qbRefreshTokenExpiresAt: true,
    },
  })

  if (!business?.qbRefreshToken) {
    console.error(`${LOG} No refresh token stored for business ${businessId}`)
    return null
  }

  const now = Date.now()

  // (1) A dead refresh token cannot be revived by asking. Skip the network call
  // entirely, flag the business, and let the UI prompt for a reconnect.
  if (business.qbRefreshTokenExpiresAt && business.qbRefreshTokenExpiresAt.getTime() <= now) {
    const message =
      `Refresh token expired at ${business.qbRefreshTokenExpiresAt.toISOString()}. ` +
      `QuickBooks must be reconnected (QBO expires a refresh token after 100 days idle).`
    console.error(`${LOG} ${message} businessId=${businessId}`)
    try {
      await db.business.update({
        where: { id: businessId },
        data: { quickbooksConnected: false, qbLastRefreshError: message },
      })
    } catch (e) {
      console.error(`${LOG} Failed to flag business as disconnected:`, e)
    }
    return null
  }

  // (2) Cached token still good? Use it. A refresh per call would burn a token
  // rotation every time and multiply the chance of losing one.
  if (
    business.qbAccessToken &&
    business.qbAccessTokenExpiresAt &&
    business.qbAccessTokenExpiresAt.getTime() - ACCESS_TOKEN_SKEW_MS > now
  ) {
    return business.qbAccessToken
  }

  let tokens: QbTokenResponse
  try {
    tokens = await postToken(
      new URLSearchParams({ grant_type: 'refresh_token', refresh_token: business.qbRefreshToken })
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`${LOG} Token refresh failed for business ${businessId}:`, message)
    try {
      await db.business.update({
        where: { id: businessId },
        data: { quickbooksConnected: false, qbLastRefreshError: message },
      })
    } catch (e) {
      console.error(`${LOG} Failed to flag business as disconnected:`, e)
    }
    throw error
  }

  // (3) Persist the rotation unconditionally, BEFORE any decision about the
  // access token. QBO rotates refresh_token on every refresh; a response that
  // carries a new one and nothing else must still be written, or the stored
  // token is already dead and the connection is unrecoverable.
  //
  // This also re-asserts quickbooksConnected: true. The failure path above sets
  // it false, and nothing else ever sets it back, so a transient Intuit outage
  // would otherwise leave the business flagged disconnected forever.
  //
  // KNOWN GAP: if this update fails after the refresh succeeded, the rotated
  // refresh token is lost and Intuit has already invalidated the old one. The
  // connection is then unrecoverable without re-consent. No mitigation today.
  const data = buildRefreshUpdateData(tokens, Date.now())
  await db.business.update({ where: { id: businessId }, data })

  if (!tokens.access_token) {
    console.error(`${LOG} Refresh succeeded but returned no access_token for business ${businessId}`)
    return null
  }
  return tokens.access_token
}

// ── webhook signature ────────────────────────────────────────────────────────

/**
 * Verify an Intuit webhook against the `intuit-signature` header.
 *
 * Scheme verified 2026-08-29 against Intuit's own sample app,
 * IntuitDeveloper/SampleApp-WebhookNotifications-nodejs, app.js:124-143:
 *
 *     var signature = req.get('intuit-signature');
 *     var hash = crypto.createHmac('sha256', config.webhooksVerifier)
 *                      .update(webhookPayload).digest('base64');
 *     if (signature === hash) { ... }
 *
 * Two deliberate departures from that sample:
 *   - It hashes JSON.stringify(req.body), i.e. a re-serialised body. Any key
 *     reordering, whitespace or unicode-escaping difference between Intuit's
 *     bytes and Node's re-serialisation breaks the comparison. This function
 *     takes the RAW body string; the caller must read the body before parsing it.
 *   - `signature === hash` is a short-circuiting string compare. This uses
 *     timingSafeEqual.
 *
 * Nothing else in this repo verifies any webhook signature (the Telnyx webhooks
 * are unauthenticated and TELNYX_PUBLIC_KEY is referenced nowhere), so there is
 * no in-repo pattern to follow and none to copy this into blindly.
 *
 * Fails closed on every uncertainty, including a missing verifier token.
 */
export function verifyIntuitSignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader) {
    console.error(`${LOG} Webhook rejected: no intuit-signature header`)
    return false
  }
  if (!rawBody) {
    console.error(`${LOG} Webhook rejected: empty body`)
    return false
  }

  const verifierToken = process.env.QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN
  if (!verifierToken) {
    console.error(`${LOG} Webhook rejected: QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN is not set`)
    return false
  }

  const expected = crypto.createHmac('sha256', verifierToken).update(rawBody, 'utf8').digest('base64')
  const provided = Buffer.from(signatureHeader, 'utf8')
  const computed = Buffer.from(expected, 'utf8')
  if (provided.length !== computed.length) return false
  return crypto.timingSafeEqual(provided, computed)
}

// ── entity reads ─────────────────────────────────────────────────────────────

/**
 * Authenticated GET of a single QuickBooks entity. Transport only — no parsing,
 * no field extraction, no business rules. Callers own the shape.
 *
 * URL form verified against intuit/oauth-jsclient sample/app.js:
 *   {base}/v3/company/{realmId}/{entity}/{id}
 *
 * minorversion is intentionally NOT hardcoded. Intuit's own sample sends none,
 * and the current minor version could not be verified from the docs (the pages
 * are client-rendered and returned no content). Set QUICKBOOKS_MINOR_VERSION to
 * pin one; unset, Intuit applies the base version.
 */
export async function fetchQbEntity(
  businessId: string,
  entity: QbEntity,
  id: string
): Promise<unknown> {
  if (!id) throw new Error(`${LOG} fetchQbEntity called without an id`)

  const business = await db.business.findUnique({
    where: { id: businessId },
    select: { qbRealmId: true },
  })
  if (!business?.qbRealmId) {
    throw new Error(`${LOG} Business ${businessId} has no qbRealmId — QuickBooks is not connected`)
  }

  const accessToken = await getValidQbAccessToken(businessId)
  if (!accessToken) {
    throw new Error(`${LOG} No valid access token for business ${businessId}`)
  }

  const url = new URL(
    `${getQbApiBaseUrl()}/v3/company/${encodeURIComponent(business.qbRealmId)}/` +
      `${entity.toLowerCase()}/${encodeURIComponent(id)}`
  )
  const minorVersion = process.env.QUICKBOOKS_MINOR_VERSION
  if (minorVersion) url.searchParams.set('minorversion', minorVersion)

  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(
      `${LOG} GET ${entity}/${id} failed for business ${businessId}: ` +
        `${res.status} ${res.statusText} ${body.slice(0, 300)}`
    )
  }

  return res.json()
}
