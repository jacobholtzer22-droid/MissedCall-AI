// ===========================================
// GET /api/admin/ops/stripe/unmatched — paying customers no client points at
// ===========================================
// The sync's 120-day computation (listUnmatchedStripeCustomers), read only
// against Stripe. Cached in module memory for 10 minutes because it walks every
// customer and recent charge; ?refresh=1 skips the cache (used right after a
// link or create so the list drops the row at once). The cache is per lambda
// instance, which is fine for a list that only has to be roughly current.

import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/pipeline-server'
import { listUnmatchedStripeCustomers, type UnmatchedPayingCustomer } from '@/lib/ops/sync'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const TTL_MS = 10 * 60 * 1000
let cache: { at: number; customers: UnmatchedPayingCustomer[] } | null = null

export async function GET(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied

  const refresh = new URL(request.url).searchParams.get('refresh') === '1'
  if (!refresh && cache && Date.now() - cache.at < TTL_MS) {
    return NextResponse.json({ customers: cache.customers, cachedAt: new Date(cache.at).toISOString() })
  }

  try {
    const customers = await listUnmatchedStripeCustomers()
    if (customers === null) return NextResponse.json({ error: 'STRIPE_SECRET_KEY is not set' }, { status: 503 })
    cache = { at: Date.now(), customers }
    return NextResponse.json({ customers, cachedAt: new Date(cache.at).toISOString() })
  } catch (err) {
    console.error('[admin/ops/stripe/unmatched] failed:', err)
    return NextResponse.json({ error: 'Failed to load Stripe customers' }, { status: 500 })
  }
}
