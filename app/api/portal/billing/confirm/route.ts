// ===========================================
// POST /api/portal/billing/confirm: back from Stripe (STRIPE_CARD_AT_SIGNUP)
// ===========================================
// { sessionId }. Retrieves the Checkout Session from Stripe and stores only the
// customer id and payment method id, and only when it is this client's own
// completed setup. The signed-in client's own record only (portalGuard).

import { NextResponse } from 'next/server'
import { portalGuard } from '@/lib/ops/intake-wizard-server'
import { BillingError, stripeCardAtSignupEnabled } from '@/lib/ops/stripe-billing'
import { finishCardSetup } from '@/lib/ops/stripe-billing-server'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!stripeCardAtSignupEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const g = await portalGuard(request, 'billing')
  if ('response' in g) return g.response
  try {
    const body = (await request.json().catch(() => ({}))) as { sessionId?: unknown }
    if (typeof body.sessionId !== 'string') return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })
    await finishCardSetup(g.client.id, body.sessionId)
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    if (err instanceof BillingError) return NextResponse.json({ error: err.message }, { status: 400 })
    console.error('[portal billing] confirm failed')
    return NextResponse.json({ error: 'Could not check the card with Stripe. Try again.' }, { status: 502 })
  }
}
