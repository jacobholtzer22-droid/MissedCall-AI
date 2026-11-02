// ===========================================
// POST /api/admin/ops/engagements/[id]/start-subscription: propose the Push (STRIPE_CARD_AT_SIGNUP)
// ===========================================
// Jacob's tap on the Ready to bill row. Creates the "Start the $X/mo
// subscription" approval card; nothing is charged until he Pushes it. Admin
// only, rate limited, 404 with the flag off.

import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/pipeline-server'
import { getClientIp, rateLimit } from '@/lib/rate-limit'
import { BillingError, stripeCardAtSignupEnabled } from '@/lib/ops/stripe-billing'
import { proposeSubscription } from '@/lib/ops/stripe-billing-server'

export const dynamic = 'force-dynamic'

export async function POST(request: Request, context: { params: { id: string } }) {
  if (!stripeCardAtSignupEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const denied = await requireAdmin()
  if (denied) return denied
  if (!rateLimit(`start-subscription:${getClientIp(request)}`, 10, 60_000).allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  try {
    return NextResponse.json({ ok: true, ...(await proposeSubscription(context.params.id)) })
  } catch (err) {
    if (err instanceof BillingError) return NextResponse.json({ error: err.message }, { status: 400 })
    console.error('[start subscription] propose failed')
    return NextResponse.json({ error: 'Could not reach Stripe. Try again.' }, { status: 502 })
  }
}
