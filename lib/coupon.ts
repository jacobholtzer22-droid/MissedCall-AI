// ===========================================
// $200 OFF THE SETUP FEE, 24 HOURS TO BOOK
// ===========================================
// Every number here is real and every deadline is server-stored.
//
// Anchor is $400 because that is the actual setup fee and what the live ads
// say. $500 must never render anywhere: inflating the anchor to make the
// discount look bigger would be a fabricated price.
//
// The countdown the visitor sees reads expiresAt from the database, so a
// refresh, a cleared cache, or a second visit cannot restart it, and an expired
// claim reports as expired rather than quietly rolling over.

import { db } from '@/lib/db'

/**
 * Monthly price quoted in the founder video, so /book must state the same
 * number. NOTE: /pricing lists MissedCall AI at $299/mo and /missedcall-ai
 * says $300/month. Those are not reconciled. If this changes, change them too.
 */
export const MONTHLY_FEE = 250

export const SETUP_FEE_FULL = 400
export const SETUP_FEE_DISCOUNTED = 200
/** Both derived, so nothing can drift from the two real numbers. */
export const DISCOUNT_PERCENT = Math.round(
  ((SETUP_FEE_FULL - SETUP_FEE_DISCOUNTED) / SETUP_FEE_FULL) * 100
)
export const SETUP_SAVINGS = SETUP_FEE_FULL - SETUP_FEE_DISCOUNTED
export const COUPON_WINDOW_HOURS = 24

/** Unambiguous alphabet: no O/0, no I/1. These get read off a phone screen. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function randomCode(): string {
  let out = ''
  for (let i = 0; i < 6; i++) out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  return `AA-${out}`
}

export type CouponState =
  | { status: 'none' }
  | { status: 'active'; code: string; expiresAt: string; setupFee: number }
  | { status: 'expired'; code: string; expiresAt: string }

/**
 * Existing claim for this visitor, active or expired. One claim per visitor:
 * re-claiming returns the original so the deadline cannot be extended by
 * clicking again.
 */
export async function getClaimForVisitor(visitorId: string) {
  if (!visitorId) return null
  return db.couponClaim.findFirst({
    where: { visitorId },
    orderBy: { claimedAt: 'desc' },
  })
}

export async function claimCoupon(visitorId: string, variant: string | null) {
  const existing = await getClaimForVisitor(visitorId)
  if (existing) return existing

  // Retry on the astronomically unlikely code collision rather than throwing.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await db.couponClaim.create({
        data: {
          code: randomCode(),
          visitorId,
          variant,
          expiresAt: new Date(Date.now() + COUPON_WINDOW_HOURS * 60 * 60 * 1000),
        },
      })
    } catch (err) {
      if (attempt === 4) throw err
    }
  }
  return null
}

export function toState(claim: { code: string; expiresAt: Date } | null): CouponState {
  if (!claim) return { status: 'none' }
  const live = claim.expiresAt.getTime() > Date.now()
  return live
    ? {
        status: 'active',
        code: claim.code,
        expiresAt: claim.expiresAt.toISOString(),
        setupFee: SETUP_FEE_DISCOUNTED,
      }
    : { status: 'expired', code: claim.code, expiresAt: claim.expiresAt.toISOString() }
}

/** Line quoted in the booking record, owner alert, confirmation SMS and email. */
export function setupFeeLine(claim: { code: string } | null, valid: boolean): string {
  return valid && claim
    ? `Setup: $${SETUP_FEE_DISCOUNTED} (coupon ${claim.code})`
    : `Setup: $${SETUP_FEE_FULL}`
}
