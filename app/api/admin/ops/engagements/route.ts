// ===========================================
// POST /api/admin/ops/engagements — create a client from a Stripe customer
// ===========================================
// Body: { stripeCustomerId }. For the "Create client" action on an unmatched
// paying customer. Reads the customer from Stripe (read only), creates the
// Engagement with source 'stripe' and stage 'paid_upfront', then pulls its
// subscription and payments. 409 when any engagement already has the customer.

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/pipeline-server'
import { normalizeToE164 } from '@/lib/phone-utils'
import { getStripe } from '@/lib/ops/stripe'
import { syncStripeForEngagement } from '@/lib/ops/sync'
import { BadRequest, STRIPE_CUSTOMER_ID, readJsonObject, rejectUnknownKeys } from '@/lib/ops/validate'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied

  try {
    const body = readJsonObject(await request.json())
    rejectUnknownKeys(body, ['stripeCustomerId'])
    const customerId = typeof body.stripeCustomerId === 'string' ? body.stripeCustomerId.trim() : ''
    if (!STRIPE_CUSTOMER_ID.test(customerId)) throw new BadRequest('stripeCustomerId must be a cus_ id')

    const owner = await db.engagement.findFirst({ where: { stripeCustomerId: customerId }, select: { displayName: true } })
    if (owner) {
      return NextResponse.json({ error: `${customerId} is already linked to ${owner.displayName.trim()}` }, { status: 409 })
    }

    const stripe = getStripe()
    if (!stripe) return NextResponse.json({ error: 'STRIPE_SECRET_KEY is not set' }, { status: 503 })
    const customer = await stripe.customers.retrieve(customerId)
    if ((customer as { deleted?: boolean }).deleted) {
      return NextResponse.json({ error: `${customerId} is deleted in Stripe` }, { status: 404 })
    }
    const c = customer as import('stripe').Stripe.Customer

    const engagement = await db.engagement.create({
      data: {
        displayName: c.name?.trim() || c.email?.trim() || customerId,
        email: c.email?.trim() || null,
        phone: normalizeToE164(c.phone) || null,
        source: 'stripe',
        stage: 'paid_upfront',
        services: [],
        stripeCustomerId: customerId,
      },
    })
    const stripeResult = await syncStripeForEngagement(engagement.id)
    return NextResponse.json({ ok: true, engagementId: engagement.id, stripe: stripeResult })
  } catch (err) {
    if (err instanceof BadRequest) return NextResponse.json({ error: err.message }, { status: 400 })
    if ((err as { code?: string })?.code === 'P2002') {
      return NextResponse.json({ error: 'That Stripe customer is already linked to another engagement' }, { status: 409 })
    }
    if ((err as { type?: string })?.type === 'StripeInvalidRequestError') {
      return NextResponse.json({ error: 'No such Stripe customer' }, { status: 404 })
    }
    console.error('[admin/ops/engagements] POST failed:', err)
    return NextResponse.json({ error: 'Failed to create' }, { status: 500 })
  }
}
