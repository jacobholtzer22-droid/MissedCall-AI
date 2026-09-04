// ===========================================
// LEAD TOKEN for /calendar?l=…
// ===========================================
// A 16-character random token stored on the lead row and verified by LOOKUP.
//
// It was a signed `leadId.exp.hmac` string, which pushed the post-OTP text to
// 334 characters — three SMS segments instead of two, on every lead text and
// every follow-up. Since the token was already stored, the signature was
// belt-and-braces: the row is the proof. 16 characters from a 62-character
// alphabet is ~95 bits, so guessing one is not a threat model, and the column
// is unique so a collision fails the write instead of aliasing two leads.
//
// Expiry rides on the lead's own verification time rather than a column of its
// own: a link is good for LEAD_TOKEN_TTL_MS after the number was proven.
//
// Every failure — unknown token, expired, malformed, database error — resolves
// to null and the page falls back to direct mode. A stale link must never show
// an error to someone trying to give us money.

import { randomInt } from 'crypto'
import { db } from '@/lib/db'
import { withSmsUtms } from '@/lib/attribution'

export const LEAD_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000
const TOKEN_LENGTH = 16
const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

/** Cryptographically random, not Math.random. */
export function newCalendarToken(): string {
  let out = ''
  for (let i = 0; i < TOKEN_LENGTH; i++) out += ALPHABET[randomInt(0, ALPHABET.length)]
  return out
}

export type TokenResolution =
  | { ok: true; leadId: string }
  | { ok: false; reason: 'missing' | 'not_found' | 'expired' | 'error' }

/**
 * Resolve a token to its lead. Async by nature now: the lookup IS the check.
 *
 * Scoped to a businessId so a token can only ever resolve within the business
 * that issued it.
 */
export async function resolveCalendarToken(
  token: string | null | undefined,
  businessId: string,
  now = Date.now()
): Promise<TokenResolution> {
  const clean = typeof token === 'string' ? token.trim() : ''
  // Length-checked before touching the database so a junk query string cannot
  // turn every stale link into a round trip.
  if (!clean || clean.length !== TOKEN_LENGTH) return { ok: false, reason: 'missing' }

  try {
    const lead = await db.websiteLead.findFirst({
      where: { calendarToken: clean, businessId },
      select: { id: true, otpVerifiedAt: true, createdAt: true },
    })
    if (!lead) return { ok: false, reason: 'not_found' }

    // Verification time when we have it, row creation otherwise.
    const issuedAt = (lead.otpVerifiedAt ?? lead.createdAt).getTime()
    if (now - issuedAt > LEAD_TOKEN_TTL_MS) return { ok: false, reason: 'expired' }

    return { ok: true, leadId: lead.id }
  } catch (err) {
    console.error('[lead-token] lookup failed, falling back to direct:', err)
    return { ok: false, reason: 'error' }
  }
}

/**
 * The link we put in every text. Falls back to the bare page without a token.
 * Carries the return UTMs, so a booking off this link stops reading as direct.
 */
export function calendarLink(token: string | null, arm?: string | null): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.alignandacquire.com').replace(/\/$/, '')
  const url = token ? `${base}/calendar?l=${encodeURIComponent(token)}` : `${base}/calendar`
  return withSmsUtms(url, arm)
}
