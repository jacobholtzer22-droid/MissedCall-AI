// ===========================================
// /admin/ops — MRR classification
// ===========================================
// Pure and client-safe, shared by lib/ops/board.ts (totals) and the Money tab
// (the by-stage table), so the two can never classify a row differently.

/** Stripe statuses that count as verified MRR. */
export const VERIFIED_SUB_STATUSES = ['active', 'past_due'] as const
export const isVerifiedMrr = (status: string | null) => (VERIFIED_SUB_STATUSES as readonly (string | null)[]).includes(status)

/**
 * Which MRR bucket a row belongs to. A 'scheduled' subscription is Pending
 * whatever the stage says; otherwise the stage decides. null = not in MRR.
 */
export function mrrBucketOf(e: { stage: string; stripeSubscriptionStatus: string | null }): 'active' | 'pending' | 'churned' | null {
  if (e.stage === 'ignored') return null
  if (e.stripeSubscriptionStatus === 'scheduled') return 'pending'
  if (e.stage === 'active') return 'active'
  if (e.stage === 'paid_upfront' || e.stage === 'onboarding') return 'pending'
  if (e.stage === 'churned') return 'churned'
  return null
}
