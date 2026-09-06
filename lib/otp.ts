// ===========================================
// PHONE VERIFICATION (OTP) — both /book arms
// ===========================================
// Why this exists: the funnel texts every lead and emails the owner "call now"
// within seconds. An unverified number means both of those fire at a stranger's
// handset, and the owner calls someone who never asked. Verifying before the
// lead is written is what makes the instant SMS defensible.
//
// Design notes that are load-bearing:
//   - One DB row per SEND. The fraud caps are then plain counting queries.
//     lib/rate-limit.ts is in-memory and per-lambda on Vercel, so it CANNOT
//     enforce a real cap; it is kept only as a cheap first line against bursts.
//   - The code is never stored. Only sha256(code + phone + pepper).
//   - Verification produces a single-use ticket (verifiedAt, then consumedAt).
//     The lead-write routes redeem it, so a verified phone cannot be replayed
//     into unlimited lead writes.
//   - Caps are read BEFORE the send and counted from the database, so they hold
//     across lambda instances.

import { createHash, randomInt, timingSafeEqual } from 'crypto'
import { db } from '@/lib/db'
import { isTestPhone } from '@/lib/test-allowlist'

export const OTP_LENGTH = 6
export const OTP_TTL_MS = 10 * 60 * 1000 // 10 minutes
// 5, not 3. A code read aloud over a phone line is easy to mishear, and a
// lockout on this funnel does not mean "attacker" — it means a real contractor
// who now has to be called by hand.
export const OTP_MAX_ATTEMPTS = 5
export const OTP_MAX_SENDS_PER_PHONE_HOUR = 3 // 1 initial + 2 resends
export const OTP_MAX_SENDS_PER_IP_HOUR = 10
export const OTP_GLOBAL_DAILY_CAP = 200
export const OTP_GLOBAL_ALERT_AT = 100

/**
 * Pepper for the code hash. Optional: without it the hash is still a hash of a
 * six-digit code that lives ten minutes behind a three-attempt cap, which is
 * the real defense. With it, a database read alone cannot brute-force the code
 * offline. Set OTP_SECRET in production.
 */
function pepper(): string {
  return process.env.OTP_SECRET ?? ''
}

export function hashCode(code: string, phone: string): string {
  return createHash('sha256').update(`${code}:${phone}:${pepper()}`).digest('hex')
}

/** Cryptographically random, not Math.random. Zero-padded so it is always 6 digits. */
export function generateCode(): string {
  return String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, '0')
}

function hashesMatch(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

export type SendGate =
  | { allowed: true; test: boolean }
  | { allowed: false; reason: string; code: 'phone_cap' | 'ip_cap' | 'global_cap'; retryAfterSeconds: number }

/**
 * Every cap, counted from the database so it survives lambda recycling.
 *
 * Allowlisted test handsets bypass the caps — they still receive a real code,
 * they just are not counted out of the funnel while I am walking it. They are
 * still counted toward the GLOBAL cap, deliberately: that cap protects the
 * Telnyx bill, and my own testing spends the same money.
 */
export async function checkSendCaps(phone: string, ip: string | null): Promise<SendGate> {
  const now = Date.now()
  const hourAgo = new Date(now - 60 * 60 * 1000)
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000)
  const test = isTestPhone(phone)

  const globalCount = await db.phoneVerification.count({ where: { createdAt: { gte: dayAgo } } })
  if (globalCount >= OTP_GLOBAL_DAILY_CAP) {
    return {
      allowed: false,
      code: 'global_cap',
      reason: 'Verification is temporarily unavailable. Please try again later.',
      retryAfterSeconds: 3600,
    }
  }

  if (test) return { allowed: true, test: true }

  const phoneCount = await db.phoneVerification.count({
    where: { phone, createdAt: { gte: hourAgo } },
  })
  if (phoneCount >= OTP_MAX_SENDS_PER_PHONE_HOUR) {
    return {
      allowed: false,
      code: 'phone_cap',
      reason: 'Too many codes requested for that number. Try again in an hour.',
      retryAfterSeconds: 3600,
    }
  }

  if (ip) {
    const ipCount = await db.phoneVerification.count({ where: { ip, createdAt: { gte: hourAgo } } })
    if (ipCount >= OTP_MAX_SENDS_PER_IP_HOUR) {
      return {
        allowed: false,
        code: 'ip_cap',
        reason: 'Too many verification requests. Try again in an hour.',
        retryAfterSeconds: 3600,
      }
    }
  }

  return { allowed: true, test: false }
}

/** Rolling 24h send count, for the global cap alert. */
export async function globalSendCount(): Promise<number> {
  return db.phoneVerification.count({
    where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
  })
}

export type VerifyOutcome =
  | { ok: true; verificationId: string }
  | { ok: false; reason: string; code: 'no_code' | 'expired' | 'too_many_attempts' | 'wrong_code' }

/**
 * Check a code against the most recent send for that number.
 *
 * Only the newest row is considered: after a resend, the older code must stop
 * working, or "max 2 resends" would silently mean "three live codes at once".
 */
export async function verifyCode(phone: string, code: string): Promise<VerifyOutcome> {
  const row = await db.phoneVerification.findFirst({
    where: { phone },
    orderBy: { createdAt: 'desc' },
  })
  if (!row) return { ok: false, code: 'no_code', reason: 'Request a code first.' }

  if (row.verifiedAt && !row.consumedAt) {
    // Already verified and not yet redeemed: let the client proceed rather than
    // failing someone who double-submitted the right code.
    return { ok: true, verificationId: row.id }
  }
  if (row.expiresAt.getTime() < Date.now()) {
    return { ok: false, code: 'expired', reason: 'That code expired. Send a new one.' }
  }
  if (row.attempts >= OTP_MAX_ATTEMPTS) {
    return { ok: false, code: 'too_many_attempts', reason: 'Too many wrong tries. Send a new code.' }
  }

  const clean = code.replace(/\D/g, '')
  if (!hashesMatch(hashCode(clean, phone), row.codeHash)) {
    await db.phoneVerification.update({
      where: { id: row.id },
      data: { attempts: { increment: 1 } },
    })
    const left = OTP_MAX_ATTEMPTS - (row.attempts + 1)
    return {
      ok: false,
      code: 'wrong_code',
      reason: left > 0 ? `That code is not right. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'Too many wrong tries. Send a new code.',
    }
  }

  await db.phoneVerification.update({ where: { id: row.id }, data: { verifiedAt: new Date() } })
  return { ok: true, verificationId: row.id }
}

/**
 * Redeem a verification ticket for a lead write. Single use.
 *
 * Returns false for: unknown id, phone mismatch, never verified, already
 * consumed, or older than the TTL. Callers MUST treat false as "do not write
 * the lead" — this is the only thing standing between the funnel and an
 * unverified number receiving the instant SMS.
 */
export async function consumeVerification(verificationId: string, phone: string): Promise<boolean> {
  if (!verificationId) return false
  const claim = await db.phoneVerification.updateMany({
    where: {
      id: verificationId,
      phone,
      verifiedAt: { not: null },
      consumedAt: null,
      createdAt: { gte: new Date(Date.now() - OTP_TTL_MS * 3) },
    },
    data: { consumedAt: new Date() },
  })
  return claim.count === 1
}
