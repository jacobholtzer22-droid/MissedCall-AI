// ===========================================
// SIGNED WATCH TOKEN for /book/watch?t=…
// ===========================================
// Encodes the lead id and the arm, expires in 7 days. Signed rather than looked
// up because it also travels in the post-OTP SMS: the lead may open it days
// later on a handset that has no cookie, and the page must know which arm's
// video to play without a database round trip deciding whether they get in.
//
// Secret: OTP_SECRET (already set in production). Deliberately reuses that
// rather than adding a second secret to keep in sync.

import { createHmac, timingSafeEqual } from 'crypto'
import type { FunnelVariant } from '@/lib/funnel-variant'

export const WATCH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000

function secret(): string | null {
  return process.env.OTP_SECRET?.trim() || null
}

function sign(payload: string, key: string): string {
  return createHmac('sha256', key).update(payload).digest('base64url').slice(0, 22)
}

/** Returns null when unconfigured; callers then fall back to /book. */
export function mintWatchToken(leadId: string, arm: FunnelVariant, now = Date.now()): string | null {
  const key = secret()
  if (!key) {
    console.warn('[watch-token] OTP_SECRET unset; cannot mint a watch link')
    return null
  }
  const exp = (now + WATCH_TOKEN_TTL_MS).toString(36)
  const payload = `${leadId}.${arm}.${exp}`
  return `${payload}.${sign(payload, key)}`
}

export type WatchClaim =
  | { ok: true; leadId: string; arm: FunnelVariant }
  | { ok: false; reason: 'missing' | 'malformed' | 'bad_signature' | 'expired' | 'no_secret' }

export function verifyWatchToken(token: string | null | undefined, now = Date.now()): WatchClaim {
  if (!token) return { ok: false, reason: 'missing' }
  const key = secret()
  if (!key) return { ok: false, reason: 'no_secret' }

  const parts = token.split('.')
  if (parts.length !== 4) return { ok: false, reason: 'malformed' }
  const [leadId, arm, exp, sig] = parts
  if (!leadId || (arm !== 'A' && arm !== 'B') || !exp || !sig) return { ok: false, reason: 'malformed' }

  const expected = sign(`${leadId}.${arm}.${exp}`, key)
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(sig, 'utf8')
  // Length first: timingSafeEqual throws on a mismatch.
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: 'bad_signature' }

  const expiresAt = parseInt(exp, 36)
  if (!Number.isFinite(expiresAt) || expiresAt < now) return { ok: false, reason: 'expired' }

  return { ok: true, leadId, arm }
}

/**
 * Same-origin path for an in-app redirect. The absolute form below is for the
 * SMS only: pushing an absolute NEXT_PUBLIC_APP_URL from the client sends a
 * local or preview visitor to production mid-funnel.
 */
export function watchPath(token: string | null): string {
  return token ? `/book/watch?t=${encodeURIComponent(token)}` : '/book'
}

export function watchLink(token: string | null): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.alignandacquire.com').replace(/\/$/, '')
  return token ? `${base}/book/watch?t=${encodeURIComponent(token)}` : `${base}/book`
}
