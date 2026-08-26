// GET: the server's view of this visitor's coupon. The countdown renders from
// this, never from a client-side timestamp, so it cannot be reset by refreshing.
import { NextRequest, NextResponse } from 'next/server'
import { getClaimForVisitor, toState } from '@/lib/coupon'
import { VISITOR_COOKIE } from '@/lib/variant'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const visitorId = request.cookies.get(VISITOR_COOKIE)?.value ?? ''
  if (!visitorId) return NextResponse.json({ status: 'none' })
  try {
    return NextResponse.json(toState(await getClaimForVisitor(visitorId)))
  } catch (err) {
    console.error('[coupon/status] failed:', err)
    return NextResponse.json({ status: 'none' })
  }
}
