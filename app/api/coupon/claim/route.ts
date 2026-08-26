// POST: issue (or return) this visitor's $200 setup coupon.
// One claim per visitor. Re-claiming returns the original so the 24h deadline
// cannot be extended by clicking again.
import { NextRequest, NextResponse } from 'next/server'
import { claimCoupon, toState } from '@/lib/coupon'
import { rateLimit, getClientIp } from '@/lib/rate-limit'
import { VISITOR_COOKIE, VARIANT_COOKIE, newVisitorId, VARIANT_COOKIE_MAX_AGE } from '@/lib/variant'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const limit = rateLimit(`coupon-claim:${getClientIp(request)}`, 10, 60_000)
  if (!limit.allowed) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })
  }

  let visitorId = request.cookies.get(VISITOR_COOKIE)?.value ?? ''
  let issuedVisitor = false
  if (!visitorId) {
    visitorId = newVisitorId()
    issuedVisitor = true
  }
  const variant = request.cookies.get(VARIANT_COOKIE)?.value ?? null

  try {
    const claim = await claimCoupon(visitorId, variant)
    const res = NextResponse.json(toState(claim))
    if (issuedVisitor) {
      res.cookies.set(VISITOR_COOKIE, visitorId, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: VARIANT_COOKIE_MAX_AGE,
      })
    }
    return res
  } catch (err) {
    console.error('[coupon/claim] failed:', err)
    return NextResponse.json({ error: 'Could not issue that code. Try again.' }, { status: 500 })
  }
}
