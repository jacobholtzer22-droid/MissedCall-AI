// ===========================================
// /admin/ops — MRR classification
// ===========================================
// Pure and client-safe, shared by lib/ops/board.ts (totals) and the Money tab
// (the by-stage table), so the two can never classify a row differently.

/** Stripe statuses that count as verified MRR. */
export const VERIFIED_SUB_STATUSES = ['active', 'past_due'] as const
export const isVerifiedMrr = (status: string | null) => (VERIFIED_SUB_STATUSES as readonly (string | null)[]).includes(status)

/**
 * Which MRR bucket a row belongs to. A churned row is always Churned, even when
 * Stripe still shows something 'scheduled' (e.g. an open invoice for a lost
 * client's unpaid balance). Otherwise a 'scheduled' subscription is Pending
 * whatever the stage says, and the stage decides the rest. null = not in MRR.
 */
export function mrrBucketOf(e: { stage: string; stripeSubscriptionStatus: string | null }): 'active' | 'pending' | 'churned' | null {
  if (e.stage === 'ignored') return null
  if (e.stage === 'churned') return 'churned'
  if (e.stripeSubscriptionStatus === 'scheduled') return 'pending'
  if (e.stage === 'active') return 'active'
  if (e.stage === 'paid_upfront' || e.stage === 'onboarding') return 'pending'
  return null
}
