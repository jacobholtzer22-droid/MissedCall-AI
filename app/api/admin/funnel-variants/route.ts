// ===========================================
// ADMIN: per-variant funnel counts
// ===========================================
// Reports. It does not pick a winner and nothing downstream reads it to make a
// decision automatically.
//
// GET /api/admin/funnel-variants?days=14
//
// Counts, per arm:
//   leads          WebsiteLead rows written (a lead exists once trade + name +
//                  phone are captured, in either arm)
//   qualifiedLeads leads whose trade is a real trade
//   bookings       Appointment rows
//   couponClaims   coupons claimed
//   couponRedeemed coupons actually used on a booking
//
// Visitors and video plays are NOT here: neither is persisted server-side.
// Read those from Meta as ViewContent by variant. Stated plainly so nobody
// computes a conversion rate against a denominator this endpoint never had.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { getMarketingBusiness } from '@/lib/marketing-funnel'
import { VARIANTS } from '@/lib/variant'
import { NOT_AN_OWNER } from '@/app/book/constants'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const { userId } = await auth()
  if (!userId || !process.env.ADMIN_USER_ID || userId !== process.env.ADMIN_USER_ID) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const business = await getMarketingBusiness()
  if (!business) return NextResponse.json({ error: 'No marketing business' }, { status: 503 })

  const days = Math.min(Math.max(parseInt(request.nextUrl.searchParams.get('days') ?? '14', 10) || 14, 1), 180)
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const rows = await Promise.all(
    VARIANTS.map(async (variant) => {
      const [leads, bookings, claims, redeemed] = await Promise.all([
        db.websiteLead.findMany({
          where: { businessId: business.id, variant, createdAt: { gte: since } },
          select: { message: true },
        }),
        db.appointment.count({ where: { businessId: business.id, variant, createdAt: { gte: since } } }),
        db.couponClaim.count({ where: { variant, claimedAt: { gte: since } } }),
        db.couponClaim.count({ where: { variant, redeemedAt: { not: null }, claimedAt: { gte: since } } }),
      ])
      const qualified = leads.filter((l) => {
        const trade = l.message?.match(/^Trade: (.+)$/m)?.[1]?.trim()
        return trade && trade !== NOT_AN_OWNER
      }).length
      return {
        variant,
        leads: leads.length,
        qualifiedLeads: qualified,
        bookings,
        couponClaims: claims,
        couponRedeemed: redeemed,
        bookingsPerQualifiedLead: qualified > 0 ? Number((bookings / qualified).toFixed(3)) : null,
      }
    })
  )

  return NextResponse.json({
    windowDays: days,
    since: since.toISOString(),
    note: 'Visitors and plays are not stored server-side. Read ViewContent by variant in Meta.',
    variants: rows,
  })
}
