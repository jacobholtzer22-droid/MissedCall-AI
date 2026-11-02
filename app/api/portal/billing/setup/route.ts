// ===========================================
// POST /api/portal/billing/setup: open Stripe's card page (STRIPE_CARD_AT_SIGNUP)
// ===========================================
// The signed-in client's own record only (portalGuard). Returns the Stripe
// Checkout URL (setup mode, no amount). No card data passes through here.

import { NextResponse } from 'next/server'
import { portalGuard } from '@/lib/ops/intake-wizard-server'
import { BillingError, stripeCardAtSignupEnabled } from '@/lib/ops/stripe-billing'
import { startCardSetup } from '@/lib/ops/stripe-billing-server'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!stripeCardAtSignupEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const g = await portalGuard(request, 'billing')
  if ('response' in g) return g.response
  try {
    const base = process.env.NEXT_PUBLIC_APP_URL?.trim() || new URL(request.url).origin
    return NextResponse.json({ url: await startCardSetup(g.client.id, base) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    if (err instanceof BillingError) return NextResponse.json({ error: err.message }, { status: 400 })
    console.error('[portal billing] setup failed')
    return NextResponse.json({ error: 'Could not open the card page. Try again.' }, { status: 502 })
  }
}
