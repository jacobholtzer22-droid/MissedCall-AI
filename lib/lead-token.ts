// ===========================================
// SIGNED LEAD TOKEN for /calendar?l=…
// ===========================================
// Identifies a lead in a link we text them. Self-verifying: `leadId.exp.sig`,
// HMAC-SHA256 over `leadId.exp`, base64url. Nothing sensitive is encoded — the
// signature is what stops someone incrementing an id and reading a stranger's
// details.
//
// It is ALSO stored on the row so a token can be revoked by clearing the column,
// but verification never depends on the lookup succeeding. Every failure mode
// here — bad signature, expiry, unknown id, missing secret — degrades to direct
// mode. A booking page must never show an error because a link went stale.

import { createHmac, timingSafeEqual } from 'crypto'

/** Long enough to outlive the follow-up sequence, short enough to expire. */
export const LEAD_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000

function secret(): string | null {
  // Reuses the OTP secret rather than adding another env var to keep in sync.
  return process.env.OTP_SECRET?.trim() || process.env.QUICKBOOKS_STATE_SECRET?.trim() || null
}

function sign(payload: string, key: string): string {
  return createHmac('sha256', key).update(payload).digest('base64url')
}

/** Returns null when no secret is configured — callers then omit the link param. */
export function mintLeadToken(leadId: string, now = Date.now()): string | null {
  const key = secret()
  if (!key) {
    console.warn('[lead-token] no OTP_SECRET; /calendar links will be unprefilled')
    return null
  }
  const exp = String(now + LEAD_TOKEN_TTL_MS)
  const payload = `${leadId}.${exp}`
  return `${payload}.${sign(payload, key)}`
}

export type TokenVerdict =
  | { ok: true; leadId: string }
  | { ok: false; reason: 'no_secret' | 'malformed' | 'bad_signature' | 'expired' }

export function verifyLeadToken(token: string | null | undefined, now = Date.now()): TokenVerdict {
  if (!token) return { ok: false, reason: 'malformed' }
  const key = secret()
  if (!key) return { ok: false, reason: 'no_secret' }

  const parts = token.split('.')
  if (parts.length !== 3) return { ok: false, reason: 'malformed' }
  const [leadId, exp, sig] = parts
  if (!leadId || !exp || !sig) return { ok: false, reason: 'malformed' }

  const expected = sign(`${leadId}.${exp}`, key)
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(sig, 'utf8')
  // Length first: timingSafeEqual throws on a mismatch.
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: 'bad_signature' }

  const expiresAt = Number(exp)
  if (!Number.isFinite(expiresAt) || expiresAt < now) return { ok: false, reason: 'expired' }

  return { ok: true, leadId }
}

/** The link we put in every text. Falls back to the bare page when unsigned. */
export function calendarLink(token: string | null): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.alignandacquire.com').replace(/\/$/, '')
  return token ? `${base}/calendar?l=${encodeURIComponent(token)}` : `${base}/calendar`
}
