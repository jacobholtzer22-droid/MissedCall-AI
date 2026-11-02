// ===========================================
// STRIPE_CARD_AT_SIGNUP: card on file through Stripe Checkout setup mode
// ===========================================
// Run: npm test. Stripe is a fake; nothing reaches the network.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import {
  BILLING_KEY_PERMISSIONS,
  BillingError,
  CARD_COPY,
  confirmSetup,
  createSetupSession,
  ensureCustomer,
  readSetupReturn,
  setupSessionParams,
  startSubscription,
  stripeCardAtSignupEnabled,
  subscriptionCardExpected,
  subscriptionCardTitle,
  subscriptionParams,
  subscriptionPlan,
  withCard,
  type BillingClient,
  type BillingStripe,
  type SetupSessionLike,
  type SubscriptionFacts,
} from './stripe-billing'
import { stepsFor, wizardView } from './intake-wizard'

const ROOT = new URL('../../', import.meta.url).pathname
const src = (p: string) => readFileSync(join(ROOT, p), 'utf8')

function fake(session?: Partial<SetupSessionLike>) {
  const calls: { method: string; args: unknown[] }[] = []
  const stripe: BillingStripe = {
    customers: { create: async (...args) => (calls.push({ method: 'customers.create', args }), { id: 'cus_new123' }) },
    checkout: {
      sessions: {
        create: async (...args) => (calls.push({ method: 'checkout.sessions.create', args }), { id: 'cs_test_abc', url: 'https://checkout.stripe.com/c/pay/cs_test_abc' }),
        retrieve: async (...args) => {
          calls.push({ method: 'checkout.sessions.retrieve', args })
          return { id: 'cs_test_abcdefghij', mode: 'setup', status: 'complete', customer: 'cus_new123', metadata: { engagementId: 'eng1' }, setup_intent: { id: 'seti_1', status: 'succeeded', payment_method: 'pm_card123' }, ...session }
        },
      },
    },
    paymentMethods: { retrieve: async (...args) => (calls.push({ method: 'paymentMethods.retrieve', args }), { id: 'pm_card123', card: { last4: '4242' } }) },
    subscriptions: { create: async (...args) => (calls.push({ method: 'subscriptions.create', args }), { id: 'sub_1', status: 'active' }) },
  }
  return { stripe, calls }
}

const client = (o: Partial<BillingClient> = {}): BillingClient => ({ engagementId: 'eng1', businessId: 'biz1', linkedCustomerId: null, businessCustomerId: null, billing: {}, email: 'owner@client-a.example', name: 'Client A', ...o })

test('flag off unless exactly "true"; the card step exists only with it on, and only in the portal', () => {
  assert.equal(stripeCardAtSignupEnabled({}), false)
  assert.equal(stripeCardAtSignupEnabled({ STRIPE_CARD_AT_SIGNUP: 'true' }), true)
  const plan = { missedcall: false, website: true, ads: false, gbp: false }
  assert.equal(stepsFor(plan, {}).includes('card'), false)
  assert.equal(stepsFor(plan, { STRIPE_CARD_AT_SIGNUP: 'true' }).includes('card'), true)
  assert.equal(stepsFor(plan, { STRIPE_CARD_AT_SIGNUP: 'true' }, 'link').includes('card'), false)
  assert.equal(wizardView({ displayName: 'X', contactName: null, intake: {} }, {}).cardSaved, false)
})

test('customer: reuse a linked one (engagement, then business, then ours), else create once per engagement', async () => {
  for (const o of [{ linkedCustomerId: 'cus_sync' }, { businessCustomerId: 'cus_biz' }, { billing: { customerId: 'cus_ours' } }]) {
    const { stripe, calls } = fake()
    const r = await ensureCustomer(stripe, client(o))
    assert.equal(r.created, false)
    assert.equal(calls.length, 0)
  }
  const { stripe, calls } = fake()
  assert.deepEqual(await ensureCustomer(stripe, client()), { customerId: 'cus_new123', created: true })
  assert.deepEqual(calls[0], {
    method: 'customers.create',
    args: [{ name: 'Client A', email: 'owner@client-a.example', metadata: { engagementId: 'eng1', businessId: 'biz1' } }, { idempotencyKey: 'aa-billing-customer-eng1' }],
  })
})

test('setup session: mode setup, the customer, card only, return URLs, no amount anywhere', async () => {
  const p = setupSessionParams('cus_1', client(), 'https://www.alignandacquire.com/')
  assert.deepEqual(p, {
    mode: 'setup',
    customer: 'cus_1',
    currency: 'usd',
    allowed_payment_method_types: ['card'],
    client_reference_id: 'eng1',
    metadata: { engagementId: 'eng1' },
    setup_intent_data: { metadata: { engagementId: 'eng1' } },
    success_url: 'https://www.alignandacquire.com/onboarding/intake?card=done&session_id={CHECKOUT_SESSION_ID}',
    cancel_url: 'https://www.alignandacquire.com/onboarding/intake?card=cancel',
  })
  assert.doesNotMatch(JSON.stringify(p), /amount|line_items|price/)
  const { stripe, calls } = fake()
  const r = await createSetupSession(stripe, client({ linkedCustomerId: 'cus_sync' }), 'https://x.example')
  assert.equal(r.url, 'https://checkout.stripe.com/c/pay/cs_test_abc')
  assert.deepEqual(calls.map((c) => c.method), ['checkout.sessions.create'])
})

test('return: only this client\'s completed setup; stores the two ids and nothing else', async () => {
  const { stripe, calls } = fake()
  const ids = await confirmSetup(stripe, 'cs_test_abcdefghij', { engagementId: 'eng1', customerId: 'cus_new123' })
  assert.deepEqual(ids, { customerId: 'cus_new123', paymentMethodId: 'pm_card123' })
  assert.deepEqual(calls[0].args, ['cs_test_abcdefghij', { expand: ['setup_intent'] }])
  const stored = withCard({}, ids, new Date('2026-11-01T12:00:00Z'))
  assert.deepEqual(Object.keys(stored).sort(), ['cardSavedAt', 'customerId', 'paymentMethodId'])
  const base: SetupSessionLike = { id: 'cs_x', mode: 'setup', status: 'complete', customer: 'cus_new123', metadata: { engagementId: 'eng1' }, setup_intent: { id: 'seti', status: 'succeeded', payment_method: 'pm_1' } }
  const expect = { engagementId: 'eng1', customerId: 'cus_new123' }
  for (const bad of [
    { mode: 'payment' },
    { status: 'open' },
    { metadata: { engagementId: 'other' } },
    { customer: 'cus_other' },
    { setup_intent: 'seti_unexpanded' },
    { setup_intent: { id: 'seti', status: 'requires_payment_method', payment_method: null } },
  ]) {
    assert.throws(() => readSetupReturn({ ...base, ...bad } as SetupSessionLike, expect), BillingError, JSON.stringify(bad))
  }
  await assert.rejects(confirmSetup(stripe, 'not-a-session', expect), BillingError)
})

const facts = (o: Partial<SubscriptionFacts> = {}): SubscriptionFacts => ({
  engagementId: 'eng1',
  client: 'Client A',
  monthlyAmount: 297,
  upfrontAmount: 500,
  upfrontPaidAt: null,
  billing: { customerId: 'cus_1', paymentMethodId: 'pm_1' },
  ...o,
})

test('the Push plan: amount from the engagement, setup fee only when recorded and not paid, refusals', () => {
  assert.deepEqual(subscriptionPlan(facts()), { monthlyCents: 29700, setupFeeCents: 50000 })
  assert.deepEqual(subscriptionPlan(facts({ upfrontPaidAt: '2026-10-01T00:00:00Z' })), { monthlyCents: 29700, setupFeeCents: null })
  assert.deepEqual(subscriptionPlan(facts({ upfrontAmount: null })), { monthlyCents: 29700, setupFeeCents: null })
  assert.match((subscriptionPlan(facts({ monthlyAmount: null })) as { refuse: string }).refuse, /^No monthly amount recorded for Client A/)
  assert.match((subscriptionPlan(facts({ billing: { customerId: 'cus_1' } })) as { refuse: string }).refuse, /no card saved with Stripe yet/)
  assert.match((subscriptionPlan(facts({ billing: { customerId: 'cus_1', paymentMethodId: 'pm_1', subscriptionId: 'sub_9' } })) as { refuse: string }).refuse, /already has a subscription/)
})

test('the card text', () => {
  assert.equal(subscriptionCardTitle(facts(), '4242'), 'Start the $297/mo subscription for Client A on the card ending 4242')
  assert.equal(
    subscriptionCardExpected(facts(), { monthlyCents: 29700, setupFeeCents: 50000 }),
    'Push creates the subscription in Stripe on the saved card. Stripe charges the first month ($297) right away, then every month on that day. The $500 setup fee is recorded and not seen paid, so it is added once to that first invoice.'
  )
  assert.match(subscriptionCardExpected(facts({ upfrontPaidAt: 'x' }), { monthlyCents: 29700, setupFeeCents: null }), /The setup fee is recorded as paid, so it is not charged\.$/)
  assert.match(subscriptionCardExpected(facts({ upfrontAmount: null }), { monthlyCents: 29700, setupFeeCents: null }), /No setup fee is recorded, so none is charged\.$/)
})

test('Push: subscription with the saved card as default, the right price, the fee once, idempotent per approval', async () => {
  const detail = { engagementId: 'eng1', customerId: 'cus_1', paymentMethodId: 'pm_1', monthlyCents: 29700, setupFeeCents: 50000 }
  const { stripe, calls } = fake()
  assert.deepEqual(await startSubscription(stripe, detail, 'appr1', 'prod_aa'), { subscriptionId: 'sub_1', status: 'active' })
  assert.deepEqual(calls[0], {
    method: 'subscriptions.create',
    args: [
      {
        customer: 'cus_1',
        default_payment_method: 'pm_1',
        collection_method: 'charge_automatically',
        items: [{ price_data: { currency: 'usd', product: 'prod_aa', unit_amount: 29700, recurring: { interval: 'month' } } }],
        add_invoice_items: [{ price_data: { currency: 'usd', product: 'prod_aa', unit_amount: 50000 } }],
        metadata: { engagementId: 'eng1', approvalId: 'appr1' },
      },
      { idempotencyKey: 'aa-subscription-appr1' },
    ],
  })
  assert.equal('add_invoice_items' in subscriptionParams({ ...detail, setupFeeCents: null }, 'prod_aa', 'a'), false)
  await assert.rejects(startSubscription(stripe, detail, 'a', null), /STRIPE_BILLING_PRODUCT_ID is not set; nothing was charged/)
  await assert.rejects(startSubscription(stripe, { ...detail, paymentMethodId: '' }, 'a', 'prod'), /no saved card/)
  await assert.rejects(startSubscription(stripe, { ...detail, monthlyCents: 0 }, 'a', 'prod'), /no monthly amount/)
  assert.equal(calls.length, 1)
})

test('client copy: Stripe handles the card, nothing charged until Jacob starts it, no dashes', () => {
  assert.match(CARD_COPY.intro, /Stripe's secure page/)
  assert.match(CARD_COPY.whenCharged, /^Nothing is charged now\. When Jacob starts your plan, Stripe charges the first month, plus the setup fee if it hasn't been paid yet, then once a month after that\.$/)
  assert.doesNotMatch(JSON.stringify(CARD_COPY), /[\u2013\u2014]/)
  assert.equal(BILLING_KEY_PERMISSIONS.length, 7)
})

test('flag off: Push kind, board and every route are gated', () => {
  assert.match(src('lib/ops/hq/approvals.ts'), /\.\.\.\(stripeCardAtSignupEnabled\(\) \? \[SUBSCRIPTION_CARD_KIND\] : \[\]\)/)
  assert.match(src('lib/ops/hq/approvals.ts'), /if \(stripeCardAtSignupEnabled\(\) && approval\.kind === SUBSCRIPTION_CARD_KIND\)/)
  assert.match(src('lib/ops/board.ts'), /const cards = stripeCardAtSignupEnabled\(\) \? await cardStates/)
  for (const r of ['app/api/portal/billing/setup/route.ts', 'app/api/portal/billing/confirm/route.ts', 'app/api/admin/ops/engagements/[id]/start-subscription/route.ts']) {
    assert.match(src(r), /if \(!stripeCardAtSignupEnabled\(\)\) return NextResponse\.json\(\{ error: 'Not found' \}, \{ status: 404 \}\)/, r)
  }
  assert.match(src('app/api/portal/billing/setup/route.ts'), /portalGuard\(request, 'billing'\)/)
  assert.match(src('app/api/portal/billing/confirm/route.ts'), /portalGuard\(request, 'billing'\)/)
  assert.match(src('app/api/admin/ops/engagements/[id]/start-subscription/route.ts'), /requireAdmin\(\)[\s\S]+rateLimit\(/)
})

// -------------------------------------------
// Security checks, as tests
// -------------------------------------------

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(ROOT, dir))) {
    const p = join(dir, name)
    if (name === 'node_modules' || name.startsWith('.')) continue
    if (statSync(join(ROOT, p)).isDirectory()) files(p, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}
const ALL = [...files('app'), ...files('lib')]

test('security: no card number, expiry or CVC field, input or variable anywhere in app/ or lib/', () => {
  const CARD_FIELD = /\b(card_?number|cardNumber|cc_?num|cvc|cvv|exp_month|exp_year|expiry_?date|card_?expir)\b/i
  const hits = ALL.filter((f) => !f.endsWith('stripe-billing.test.ts') && CARD_FIELD.test(src(f)))
  assert.deepEqual(hits, [])
})

test('security: the billing key is read in one server-only module and never reaches a page', () => {
  const readers = ALL.filter((f) => /STRIPE_BILLING_KEY/.test(src(f)) && !/\.test\.ts$/.test(f))
  assert.deepEqual(readers.filter((f) => /process\.env\.STRIPE_BILLING_KEY/.test(src(f))), ['lib/ops/stripe-billing-server.ts'])
  assert.match(src('lib/ops/stripe-billing-server.ts'), /^import 'server-only'$/m)
  assert.equal(ALL.some((f) => !/\.test\.ts$/.test(f) && /NEXT_PUBLIC_STRIPE/.test(src(f))), false)
  const clientFiles = ALL.filter((f) => /^\s*['"]use client['"]/.test(src(f)))
  assert.ok(clientFiles.length > 0)
  for (const f of clientFiles) assert.doesNotMatch(src(f), /stripe-billing-server|from 'stripe'|lib\/ops\/stripe'/, f)
  // The pure module the wizard imports has only a type import of the SDK.
  assert.match(src('lib/ops/stripe-billing.ts'), /^import type Stripe from 'stripe'$/m)
})

test('security: no Stripe object or payment data is logged by the billing code', () => {
  for (const f of ['lib/ops/stripe-billing.ts', 'lib/ops/stripe-billing-server.ts', 'app/api/portal/billing/setup/route.ts', 'app/api/portal/billing/confirm/route.ts', 'app/api/admin/ops/engagements/[id]/start-subscription/route.ts']) {
    for (const line of src(f).split('\n').filter((l) => /console\./.test(l))) {
      assert.match(line, /console\.error\('\[[a-z ]+\] [a-z ]+'\)/, `${f}: ${line.trim()}`)
    }
  }
})
