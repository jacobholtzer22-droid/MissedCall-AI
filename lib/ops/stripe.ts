// ===========================================
// /admin/ops — Stripe client
// ===========================================
// Read-only by contract: STRIPE_SECRET_KEY is a restricted key with read access
// only, and nothing in lib/ops calls a Stripe write. Unset key = null, and the
// sync skips its Stripe phase with a note instead of failing.

import Stripe from 'stripe'

let client: Stripe | null = null

export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim()
  if (!key) return null
  if (!client) client = new Stripe(key)
  return client
}
