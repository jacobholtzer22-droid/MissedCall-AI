// ===========================================
// /intake/<token>: server side of the client's intake link (CLIENT_INTAKE_LINK)
// ===========================================
// Every /api/intake route calls guard() first:
//   1. flag off            -> 404 (the feature does not exist)
//   2. per-IP rate limit   -> 429
//   3. token signature, expiry, and the engagement's current nonce -> else 404
// and then works only on the engagement id that came out of the token. The
// token decides the client; nothing in the request body or query can.
//
// Reads and writes go through lib/ops/intake-server.ts (row-locked
// updateIntake, registerIntakeAsset, uploadTokenOptions), the same code the
// admin intake page uses.

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getClientIp, rateLimit } from '@/lib/rate-limit'
import { readIntake } from '@/lib/ops/intake'
import { updateIntake } from '@/lib/ops/intake-server'
import {
  CLIENT_LINK_LIMITS,
  CLIENT_LINK_TTL_MS,
  claimIsCurrent,
  clientIntakeEnabled,
  clientIntakeKey,
  clientLinkUrl,
  newNonce,
  signClientLink,
  verifyClientLink,
  type ClientLinkRoute,
  type ClientLinkState,
  type IntakeWithLink,
} from '@/lib/ops/client-intake'

export type LinkedClient = { id: string; displayName: string; contactName: string | null; intake: IntakeWithLink }

const notFound = () => NextResponse.json({ error: 'Not found' }, { status: 404 })

/** The client a token opens, or null for any bad, expired, replaced or revoked token. */
export async function resolveClientLink(token: string | null | undefined, now = Date.now()): Promise<LinkedClient | null> {
  const claim = verifyClientLink(token, clientIntakeKey(), now)
  if (!claim.ok) return null
  const e = await db.engagement.findUnique({
    where: { id: claim.engagementId },
    select: { id: true, displayName: true, contactName: true, intake: true, stage: true },
  })
  if (!e || e.stage === 'ignored' || e.stage === 'churned') return null
  const intake = readIntake(e.intake) as IntakeWithLink
  if (!claimIsCurrent(claim, { id: e.id, intake })) return null
  return { id: e.id, displayName: e.displayName, contactName: e.contactName, intake }
}

/**
 * The checks every public route makes, in order. Returns the client or the
 * response to send. Any token problem is a plain 404, so a probe learns
 * nothing about which part failed.
 */
export async function guard(request: Request, token: string, route: ClientLinkRoute): Promise<{ client: LinkedClient } | { response: NextResponse }> {
  if (!clientIntakeEnabled()) return { response: notFound() }
  const limit = rateLimit(`client-intake:${route}:${getClientIp(request)}`, CLIENT_LINK_LIMITS[route], 60_000)
  if (!limit.allowed) {
    return {
      response: NextResponse.json(
        { error: 'Too many requests. Wait a minute and try again.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
      ),
    }
  }
  const client = await resolveClientLink(token)
  if (!client) return { response: notFound() }
  return { client }
}

/**
 * The link for a client, for Jacob (the chief's client_intake_link tool).
 * 'get' returns the current link while it is valid, else issues one; 'new'
 * always issues a fresh one (every older link stops working); 'revoke' kills
 * the current one and issues none. Sends nothing.
 */
export async function clientLinkFor(
  engagementId: string,
  mode: 'get' | 'new' | 'revoke',
  now = new Date()
): Promise<{ url: string | null; expiresAt: string | null; issued: boolean }> {
  if (!clientIntakeEnabled()) throw new Error('The client intake link is off (CLIENT_INTAKE_LINK).')
  const key = clientIntakeKey()
  if (!key && mode !== 'revoke') throw new Error('No signing key: set CLIENT_INTAKE_SECRET (or OTP_SECRET) in the environment.')
  let state: ClientLinkState | undefined
  let issued = false
  await updateIntake(engagementId, (cur) => {
    const i = cur as IntakeWithLink
    if (mode === 'revoke') {
      const { clientLink: _gone, ...rest } = i
      state = undefined
      return rest
    }
    const current = i.clientLink
    if (mode === 'get' && current && Date.parse(current.expiresAt) > now.getTime() + 24 * 60 * 60 * 1000) {
      state = current
      return i
    }
    state = { nonce: newNonce(), issuedAt: now.toISOString(), expiresAt: new Date(now.getTime() + CLIENT_LINK_TTL_MS).toISOString() }
    issued = true
    return { ...i, clientLink: state }
  })
  if (issued || mode === 'revoke') {
    await db.opsActivity.create({
      data: {
        engagementId,
        kind: 'system',
        body: mode === 'revoke' ? 'Client intake link revoked.' : `Client intake link issued (expires ${state!.expiresAt.slice(0, 10)}); any earlier link stopped working. Nothing was sent.`,
      },
    })
  }
  if (!state) return { url: null, expiresAt: null, issued: false }
  return { url: clientLinkUrl(signClientLink(engagementId, state.nonce, Date.parse(state.expiresAt), key!)), expiresAt: state.expiresAt, issued }
}
