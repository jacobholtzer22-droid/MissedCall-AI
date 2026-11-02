// ===========================================
// Card on file for Jacob's setup fee and monthly plan (STRIPE_CARD_AT_SIGNUP, off by default)
// ===========================================
// Stripe only. The card is typed on Stripe's own hosted Checkout page in setup
// mode: no card field, input or value of ours exists anywhere. Checkout over
// Elements because the repo has no Stripe UI at all, hosted Checkout needs no
// publishable key or client script, and it keeps every card detail off our
// pages and servers.
//
// What we store (Engagement.intake.billing, not an INTAKE_KEY): the Stripe
// customer id, the payment method id, the subscription id once Jacob starts it,
// and timestamps. Never the card's number, expiry date, security code, brand or last4. The last4
// shown on Jacob's Push card is read from Stripe's payment method object at
// proposal time and lives only in that card's title.
//
// The flow:
//   1. wizard step 6: POST /api/portal/billing/setup -> ensureCustomer (reuse the
//      engagement's sync-linked customer, else the platform Business's, else the
//      one this created before, else create with an idempotency key per
//      engagement) -> a Checkout Session in setup mode -> the browser goes to
//      Stripe. Nothing is charged.
//   2. Stripe sends the client back to /onboarding/intake?card=done&session_id=...
//      and the wizard POSTs /api/portal/billing/confirm. The server retrieves
//      the session (expanding the SetupIntent), checks it is this client's
//      completed setup, and stores the two ids (readSetupReturn). No webhook:
//      app/api/webhooks/ is protected and the return retrieve is enough.
//   3. Ops HQ, Ready to bill: "Start subscription" proposes an OpsApproval
//      (kind stripe_subscription). Push creates the subscription on the saved
//      card (startSubscription), idempotency key per approval. Never automatic.
//
// The key is STRIPE_BILLING_KEY, a restricted key, server only (never
// NEXT_PUBLIC_, never sent to the page), separate from the read-only sync key
// STRIPE_SECRET_KEY. The permissions Jacob grants it, and nothing else:
export const BILLING_KEY_PERMISSIONS = [
  'Customers: Write (create the client\'s customer when none is linked)',
  'Checkout Sessions: Write (create the setup-mode session)',
  'SetupIntents: Read (read the finished setup on return)',
  'PaymentMethods: Read (the card\'s last 4 for Jacob\'s Push card)',
  'Subscriptions: Write (the Start subscription Push)',
  'Prices: Write (the subscription\'s inline monthly price and setup fee)',
  'Products: Read (the one product STRIPE_BILLING_PRODUCT_ID names)',
] as const
// Plus STRIPE_BILLING_PRODUCT_ID: one Product Jacob creates in Stripe (e.g.
// "Align and Acquire"); the monthly price and the setup fee are inline prices on it.
//
// Pure: the Stripe client is passed in (a fake in the tests).

import type Stripe from 'stripe'

export function stripeCardAtSignupEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.STRIPE_CARD_AT_SIGNUP === 'true'
}

export const SUBSCRIPTION_CARD_KIND = 'stripe_subscription'

/** The slice of the Stripe client this uses, so tests can fake it. */
export type BillingStripe = {
  customers: { create(params: Stripe.CustomerCreateParams, opts?: Stripe.RequestOptions): Promise<{ id: string }> }
  checkout: {
    sessions: {
      create(params: Stripe.Checkout.SessionCreateParams, opts?: Stripe.RequestOptions): Promise<{ id: string; url: string | null }>
      retrieve(id: string, params?: Stripe.Checkout.SessionRetrieveParams): Promise<SetupSessionLike>
    }
  }
  paymentMethods: { retrieve(id: string): Promise<{ id: string; card?: { last4?: string | null } | null }> }
  subscriptions: { create(params: Stripe.SubscriptionCreateParams, opts?: Stripe.RequestOptions): Promise<{ id: string; status: string }> }
}

export type SetupSessionLike = {
  id: string
  mode: string
  status: string | null
  customer: string | { id: string } | null
  metadata: Record<string, string> | null
  setup_intent: string | { id: string; status: string; payment_method: string | { id: string } | null } | null
}

/** What Engagement.intake.billing holds. Ids and times only. */
export type BillingState = {
  customerId?: string
  paymentMethodId?: string
  cardSavedAt?: string
  subscriptionId?: string
  subscriptionStartedAt?: string
}

export class BillingError extends Error {}

const idOf = (v: string | { id: string } | null | undefined) => (typeof v === 'string' ? v : v?.id ?? null)

export type BillingClient = {
  engagementId: string
  businessId: string | null
  /** Engagement.stripeCustomerId (the sync's link), then Business.stripeCustomerId, then billing.customerId. */
  linkedCustomerId: string | null
  businessCustomerId: string | null
  billing: BillingState
  email: string | null
  name: string
}

/** The customer to save the card on: an existing one when linked, else a new one (idempotent per engagement). */
export async function ensureCustomer(stripe: BillingStripe, c: BillingClient): Promise<{ customerId: string; created: boolean }> {
  const existing = c.linkedCustomerId || c.businessCustomerId || c.billing.customerId
  if (existing) return { customerId: existing, created: false }
  const customer = await stripe.customers.create(
    {
      name: c.name,
      ...(c.email ? { email: c.email } : {}),
      metadata: { engagementId: c.engagementId, ...(c.businessId ? { businessId: c.businessId } : {}) },
    },
    { idempotencyKey: `aa-billing-customer-${c.engagementId}` }
  )
  return { customerId: customer.id, created: true }
}

/** Checkout in setup mode: card only, no amount, back to the wizard either way. */
export function setupSessionParams(customerId: string, c: BillingClient, base: string): Stripe.Checkout.SessionCreateParams {
  const root = base.replace(/\/$/, '')
  return {
    mode: 'setup',
    customer: customerId,
    // Setup mode takes a currency when no payment method types are fixed; the filter keeps it to cards.
    currency: 'usd',
    allowed_payment_method_types: ['card'],
    client_reference_id: c.engagementId,
    metadata: { engagementId: c.engagementId },
    setup_intent_data: { metadata: { engagementId: c.engagementId } },
    success_url: `${root}/onboarding/intake?card=done&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${root}/onboarding/intake?card=cancel`,
  }
}

export async function createSetupSession(stripe: BillingStripe, c: BillingClient, base: string): Promise<{ url: string; customerId: string }> {
  const { customerId } = await ensureCustomer(stripe, c)
  const session = await stripe.checkout.sessions.create(setupSessionParams(customerId, c, base))
  if (!session.url) throw new BillingError('Stripe did not return a page to open')
  return { url: session.url, customerId }
}

export const SESSION_ID = /^cs_(test_|live_)?[A-Za-z0-9]{10,200}$/

/** The ids from a finished setup, only when the session is this client's completed setup. */
export function readSetupReturn(session: SetupSessionLike, expect: { engagementId: string; customerId: string }): { customerId: string; paymentMethodId: string } {
  if (session.mode !== 'setup') throw new BillingError('not a card setup')
  if (session.status !== 'complete') throw new BillingError('the card setup is not finished')
  if (session.metadata?.engagementId !== expect.engagementId) throw new BillingError('not this client\'s card setup')
  const customerId = idOf(session.customer)
  if (customerId !== expect.customerId) throw new BillingError('not this client\'s card setup')
  const si = session.setup_intent
  if (!si || typeof si === 'string') throw new BillingError('the card setup has no result yet')
  if (si.status !== 'succeeded') throw new BillingError('the card was not saved')
  const paymentMethodId = idOf(si.payment_method)
  if (!paymentMethodId || !/^pm_[A-Za-z0-9]+$/.test(paymentMethodId)) throw new BillingError('the card was not saved')
  return { customerId, paymentMethodId }
}

export async function confirmSetup(stripe: BillingStripe, sessionId: string, expect: { engagementId: string; customerId: string }) {
  if (!SESSION_ID.test(sessionId)) throw new BillingError('not a Stripe session')
  const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['setup_intent'] })
  return readSetupReturn(session, expect)
}

/** The billing state after a confirmed setup: the two ids and a time. Nothing else. */
export function withCard(b: BillingState, ids: { customerId: string; paymentMethodId: string }, now = new Date()): BillingState {
  return { ...b, customerId: ids.customerId, paymentMethodId: ids.paymentMethodId, cardSavedAt: now.toISOString() }
}

// -------------------------------------------
// Start subscription (Jacob's Push)
// -------------------------------------------

const dollars = (n: number) => (Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`)
const cents = (n: number) => Math.round(n * 100)

export type SubscriptionFacts = {
  engagementId: string
  client: string
  monthlyAmount: number | null
  upfrontAmount: number | null
  upfrontPaidAt: string | null
  billing: BillingState
}

export type SubscriptionPlan = { monthlyCents: number; setupFeeCents: number | null }

/** What the Push would charge, or why it cannot be proposed. */
export function subscriptionPlan(f: SubscriptionFacts): SubscriptionPlan | { refuse: string } {
  if (f.billing.subscriptionId) return { refuse: `${f.client} already has a subscription started from Ops HQ (${f.billing.subscriptionId})` }
  if (!f.billing.customerId || !f.billing.paymentMethodId) return { refuse: `${f.client} has no card saved with Stripe yet` }
  if (typeof f.monthlyAmount !== 'number' || !(f.monthlyAmount > 0)) return { refuse: `No monthly amount recorded for ${f.client}; set it first (set_client_amounts)` }
  const fee = typeof f.upfrontAmount === 'number' && f.upfrontAmount > 0 && !f.upfrontPaidAt ? cents(f.upfrontAmount) : null
  return { monthlyCents: cents(f.monthlyAmount), setupFeeCents: fee }
}

export function subscriptionCardTitle(f: SubscriptionFacts, last4: string | null): string {
  return `Start the ${dollars(f.monthlyAmount ?? 0)}/mo subscription for ${f.client} on the card ending ${last4 && /^\d{4}$/.test(last4) ? last4 : '(not shown by Stripe)'}`
}

export function subscriptionCardExpected(f: SubscriptionFacts, plan: SubscriptionPlan): string {
  const fee = plan.setupFeeCents
    ? ` The ${dollars(plan.setupFeeCents / 100)} setup fee is recorded and not seen paid, so it is added once to that first invoice.`
    : typeof f.upfrontAmount === 'number' && f.upfrontAmount > 0
      ? ' The setup fee is recorded as paid, so it is not charged.'
      : ' No setup fee is recorded, so none is charged.'
  return `Push creates the subscription in Stripe on the saved card. Stripe charges the first month (${dollars(plan.monthlyCents / 100)}) right away, then every month on that day.${fee}`
}

export function subscriptionParams(
  detail: { customerId: string; paymentMethodId: string; monthlyCents: number; setupFeeCents: number | null; engagementId: string },
  productId: string,
  approvalId: string
): Stripe.SubscriptionCreateParams {
  return {
    customer: detail.customerId,
    default_payment_method: detail.paymentMethodId,
    collection_method: 'charge_automatically',
    items: [{ price_data: { currency: 'usd', product: productId, unit_amount: detail.monthlyCents, recurring: { interval: 'month' } } }],
    ...(detail.setupFeeCents ? { add_invoice_items: [{ price_data: { currency: 'usd', product: productId, unit_amount: detail.setupFeeCents } }] } : {}),
    metadata: { engagementId: detail.engagementId, approvalId },
  }
}

export async function startSubscription(stripe: BillingStripe, detail: Record<string, unknown>, approvalId: string, productId: string | null): Promise<{ subscriptionId: string; status: string }> {
  if (!productId) throw new BillingError('STRIPE_BILLING_PRODUCT_ID is not set; nothing was charged')
  const d = {
    customerId: String(detail.customerId ?? ''),
    paymentMethodId: String(detail.paymentMethodId ?? ''),
    monthlyCents: Number(detail.monthlyCents),
    setupFeeCents: typeof detail.setupFeeCents === 'number' && detail.setupFeeCents > 0 ? detail.setupFeeCents : null,
    engagementId: String(detail.engagementId ?? ''),
  }
  if (!/^cus_/.test(d.customerId) || !/^pm_/.test(d.paymentMethodId)) throw new BillingError('no saved card on this card; nothing was charged')
  if (!Number.isInteger(d.monthlyCents) || d.monthlyCents <= 0) throw new BillingError('no monthly amount on this card; nothing was charged')
  const sub = await stripe.subscriptions.create(subscriptionParams(d, productId, approvalId), { idempotencyKey: `aa-subscription-${approvalId}` })
  return { subscriptionId: sub.id, status: sub.status }
}

// -------------------------------------------
// Client copy (step 6)
// -------------------------------------------

export const CARD_COPY = {
  title: 'Billing',
  intro: "Add the card for your setup fee and monthly plan. You type it on Stripe's secure page; it never touches our site.",
  whenCharged: "Nothing is charged now. When Jacob starts your plan, Stripe charges the first month, plus the setup fee if it hasn't been paid yet, then once a month after that.",
  button: 'Add your card with Stripe',
  saved: 'Your card is saved with Stripe. Nothing has been charged.',
  cancelled: 'No card was saved. You can add it now or come back later.',
  error: "That didn't go through. Try again in a minute.",
  later: 'You can skip this for now and add it later.',
}
