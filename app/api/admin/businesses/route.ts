// ===========================================
// ADMIN BUSINESSES LIST (UPDATED)
// ===========================================
// Path: app/api/admin/businesses/route.ts
//
// Now includes screened call counts per business

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

const ADMIN_USER_ID = process.env.ADMIN_USER_ID

export async function GET() {
  const { userId } = await auth()

  if (!userId || userId !== ADMIN_USER_ID) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  try {
    const businesses = await db.business.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            conversations: true,
            appointments: true,
            users: true,
            screenedCalls: true,  // <-- NEW: total screened calls
          },
        },
      },
    })

    // Get blocked counts per business (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

    const blockedCounts = await db.screenedCall.groupBy({
      by: ['businessId'],
      where: {
        result: 'blocked',
        createdAt: { gte: thirtyDaysAgo },
      },
      _count: true,
    })

    // Map blocked counts to business IDs for easy lookup
    const blockedMap = new Map(
      blockedCounts.map((b) => [b.businessId, b._count])
    )

    // Attach blocked count to each business
    const businessesWithStats = businesses.map((biz) => ({
      ...biz,
      _count: {
        ...biz._count,
        blockedCalls30d: blockedMap.get(biz.id) || 0,
      },
    }))

    return NextResponse.json({ businesses: businessesWithStats })
  } catch (error) {
    console.error('Admin: Failed to fetch businesses:', error)
    return NextResponse.json({ error: 'Failed to fetch businesses' }, { status: 500 })
  }
}
