// ===========================================
// Card on file, server side (STRIPE_CARD_AT_SIGNUP)
// ===========================================
// server-only: the billing key (STRIPE_BILLING_KEY) is read here and nowhere
// else, and this module can never be pulled into a page bundle. See
// lib/ops/stripe-billing.ts for the flow and the key's permissions.
// Nothing here logs a Stripe object.

import 'server-only'
import Stripe from 'stripe'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { readIntake } from '@/lib/ops/intake'
import { updateIntake } from '@/lib/ops/intake-server'
import { createRun } from '@/lib/ops/hq/runs'
import {
  BillingError,
  SUBSCRIPTION_CARD_KIND,
  confirmSetup,
  createSetupSession,
  startSubscription,
  subscriptionCardExpected,
  subscriptionCardTitle,
  subscriptionPlan,
  withCard,
  type BillingClient,
  type BillingState,
  type BillingStripe,
} from '@/lib/ops/stripe-billing'

let client: BillingStripe | null = null

/** The billing client, or null when STRIPE_BILLING_KEY is unset. Never the read-only sync key. */
export function getBillingStripe(): BillingStripe | null {
  const key = process.env.STRIPE_BILLING_KEY?.trim()
  if (!key) return null
  if (!client) client = new Stripe(key) as unknown as BillingStripe
  return client
}

type Intake = ReturnType<typeof readIntake> & { billing?: BillingState }

async function billingClient(engagementId: string): Promise<BillingClient> {
  const e = await db.engagement.findUniqueOrThrow({
    where: { id: engagementId },
    select: { id: true, displayName: true, email: true, stripeCustomerId: true, businessId: true, intake: true, business: { select: { stripeCustomerId: true, ownerEmail: true } } },
  })
  const intake = readIntake(e.intake) as Intake
  return {
    engagementId: e.id,
    businessId: e.businessId,
    linkedCustomerId: e.stripeCustomerId,
    businessCustomerId: e.business?.stripeCustomerId ?? null,
    billing: intake.billing ?? {},
    email: e.email ?? e.business?.ownerEmail ?? null,
    name: e.displayName.trim(),
  }
}

/** Step 6: the Stripe page to send the client to. Stores the customer id it used (no card data exists yet). */
export async function startCardSetup(engagementId: string, base: string): Promise<string> {
  const stripe = getBillingStripe()
  if (!stripe) throw new BillingError('Card setup is not available yet')
  const c = await billingClient(engagementId)
  const { url, customerId } = await createSetupSession(stripe, c, base)
  if (c.billing.customerId !== customerId) await updateIntake(engagementId, (cur) => ({ ...cur, billing: { ...((cur as Intake).billing ?? {}), customerId } }) as typeof cur)
  return url
}

/** Back from Stripe: store the customer id and payment method id, only for this client's completed setup. */
export async function finishCardSetup(engagementId: string, sessionId: string): Promise<void> {
  const stripe = getBillingStripe()
  if (!stripe) throw new BillingError('Card setup is not available yet')
  const c = await billingClient(engagementId)
  const customerId = c.billing.customerId || c.linkedCustomerId || c.businessCustomerId
  if (!customerId) throw new BillingError('no card setup was started here')
  const ids = await confirmSetup(stripe, sessionId, { engagementId, customerId })
  const already = c.billing.paymentMethodId === ids.paymentMethodId
  await updateIntake(engagementId, (cur) => ({ ...cur, billing: withCard((cur as Intake).billing ?? {}, ids) }) as typeof cur)
  if (!already) await db.opsActivity.create({ data: { engagementId, kind: 'system', body: 'The client saved a card with Stripe (Checkout setup). Nothing was charged; Start subscription on Ready to bill is your Push.' } })
}

/** Ops HQ: propose the Start subscription card. Reads the last 4 from Stripe for the title. */
export async function proposeSubscription(engagementId: string): Promise<{ approvalId: string; title: string }> {
  const stripe = getBillingStripe()
  if (!stripe) throw new BillingError('STRIPE_BILLING_KEY is not set')
  if (!process.env.STRIPE_BILLING_PRODUCT_ID?.trim()) throw new BillingError('STRIPE_BILLING_PRODUCT_ID is not set')
  const e = await db.engagement.findUniqueOrThrow({ where: { id: engagementId }, select: { displayName: true, monthlyAmount: true, upfrontAmount: true, upfrontPaidAt: true, intake: true } })
  const billing = (readIntake(e.intake) as Intake).billing ?? {}
  const facts = { engagementId, client: e.displayName.trim(), monthlyAmount: e.monthlyAmount, upfrontAmount: e.upfrontAmount, upfrontPaidAt: e.upfrontPaidAt?.toISOString() ?? null, billing }
  const plan = subscriptionPlan(facts)
  if ('refuse' in plan) throw new BillingError(plan.refuse)
  const pending = await db.opsApproval.findFirst({ where: { kind: SUBSCRIPTION_CARD_KIND, status: 'pending', detail: { path: ['engagementId'], equals: engagementId } }, select: { id: true, title: true } })
  if (pending) return { approvalId: pending.id, title: pending.title }
  const pm = await stripe.paymentMethods.retrieve(billing.paymentMethodId!)
  const title = subscriptionCardTitle(facts, pm.card?.last4 ?? null)
  const job = await db.opsJob.create({ data: { prompt: `Start subscription for ${facts.client}`, status: 'awaiting_approval', engagementIds: [engagementId] } })
  const run = await createRun({ agent: 'chief', kind: 'chief', mode: 'work', engagementId, jobId: job.id, input: { startSubscription: true } })
  const a = await db.opsApproval.create({
    data: {
      jobId: job.id,
      runId: run.id,
      agent: 'chief',
      kind: SUBSCRIPTION_CARD_KIND,
      title,
      detail: { engagementId, client: facts.client, customerId: billing.customerId, paymentMethodId: billing.paymentMethodId, monthlyCents: plan.monthlyCents, setupFeeCents: plan.setupFeeCents } as Prisma.InputJsonObject,
      expected: subscriptionCardExpected(facts, plan),
    },
  })
  return { approvalId: a.id, title }
}

/** Push: create the subscription, then record its id so it can never be proposed again. */
export async function applySubscriptionCard(detail: Record<string, unknown>, approvalId: string): Promise<string> {
  const stripe = getBillingStripe()
  if (!stripe) throw new BillingError('STRIPE_BILLING_KEY is not set; nothing was charged')
  const engagementId = String(detail.engagementId ?? '')
  const e = await db.engagement.findUniqueOrThrow({ where: { id: engagementId }, select: { intake: true } })
  const billing = (readIntake(e.intake) as Intake).billing ?? {}
  if (billing.subscriptionId) throw new BillingError(`a subscription was already started from Ops HQ (${billing.subscriptionId}); nothing was charged`)
  const { subscriptionId, status } = await startSubscription(stripe, detail, approvalId, process.env.STRIPE_BILLING_PRODUCT_ID?.trim() || null)
  await updateIntake(engagementId, (cur) => ({ ...cur, billing: { ...((cur as Intake).billing ?? {}), subscriptionId, subscriptionStartedAt: new Date().toISOString() } }) as typeof cur)
  const line = `Started the Stripe subscription ${subscriptionId} (${status}) on the saved card (Jacob's Push).`
  await db.opsActivity.create({ data: { engagementId, kind: 'system', body: line } })
  return line
}

/** For the board: per engagement, whether a card is on file and whether a subscription was started here. */
export async function billingStates(engagementIds: string[]): Promise<Map<string, BillingState>> {
  const rows = engagementIds.length ? await db.engagement.findMany({ where: { id: { in: engagementIds } }, select: { id: true, intake: true } }) : []
  return new Map(rows.map((r) => [r.id, (readIntake(r.intake) as Intake).billing ?? {}]))
}
