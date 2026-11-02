// ===========================================
// Ops HQ: "ready to bill" (READY_TO_BILL, off by default)
// ===========================================
// Pure rule over the board. Monthly billing starts when everything the client
// bought is live; nothing told Jacob when that moment came. One row per client:
//   - every deliverable the client bought is live: the same all-live test as the
//     "you're live" draft (lib/ops/send-drafts.ts), without its 14-day window,
//     because an older client who was never billed is the money this is for;
//   - no live Stripe subscription seen: Engagement.stripeSubscriptionStatus, which
//     the ops sync writes from Stripe (read only, lib/ops/sync.ts). active, trialing,
//     past_due, unpaid and scheduled all count as seen. With no Stripe customer
//     linked or never synced, the board cannot tell, and the row says "check Stripe";
//   - not dismissed: a "[ready-to-bill] dismissed" activity, written only by Jacob's tap.
// The amount is Engagement.monthlyAmount (set_client_amounts / the money fields),
// the setup fee upfrontAmount and upfrontPaidAt. Nothing here calls or writes Stripe.

export function readyToBillEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.READY_TO_BILL === 'true'
}

export const DISMISS_MARKER = '[ready-to-bill] dismissed'
const SEEN = ['active', 'trialing', 'past_due', 'unpaid', 'scheduled']

export type BillFacts = {
  id: string
  displayName: string
  stage: string
  deliverables: { effectiveStatus: string }[]
  stripeCustomerId: string | null
  stripeSyncedAt: string | null
  stripeSubscriptionStatus: string | null
  monthlyAmount: number | null
  upfrontAmount: number | null
  upfrontPaidAt: string | null
}

export type BoardBillRow = {
  engagementId: string
  client: string
  text: string
  details: string[]
  checkStripe: boolean
  /** STRIPE_CARD_AT_SIGNUP: the client saved a card with Stripe, so Start subscription can be proposed. */
  cardOnFile?: true
}

const dollars = (n: number) => (Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`)
const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Detroit' })

export function billRow(e: BillFacts, dismissed: boolean): BoardBillRow | null {
  if (dismissed || e.stage === 'churned' || e.stage === 'ignored') return null
  if (!e.deliverables.length || !e.deliverables.every((d) => d.effectiveStatus === 'live')) return null
  const status = e.stripeSubscriptionStatus?.trim().toLowerCase() ?? ''
  const known = Boolean(e.stripeCustomerId && e.stripeSyncedAt)
  if (known && SEEN.includes(status)) return null
  const client = e.displayName.trim()
  const amount = typeof e.monthlyAmount === 'number' && e.monthlyAmount > 0 ? e.monthlyAmount : null
  const text = amount ? `All live: start the ${dollars(amount)}/mo subscription for ${client}` : `All live: start the subscription for ${client} (amount not recorded)`
  const details: string[] = []
  if (typeof e.upfrontAmount === 'number' && e.upfrontAmount > 0) {
    details.push(e.upfrontPaidAt ? `Setup fee: ${dollars(e.upfrontAmount)} paid ${day(e.upfrontPaidAt)}` : `Setup fee: ${dollars(e.upfrontAmount)} recorded, not seen paid`)
  }
  if (!e.stripeCustomerId) details.push('Check Stripe: no Stripe customer is linked, so the board cannot see a subscription')
  else if (!e.stripeSyncedAt) details.push('Check Stripe: not synced yet')
  else if (status === 'canceled') details.push('Stripe shows the last subscription canceled')
  return { engagementId: e.id, client, text, details, checkStripe: !known }
}
