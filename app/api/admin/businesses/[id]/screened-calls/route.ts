// ===========================================
// SCREENED CALLS STATS API
// ===========================================
// Path: app/api/admin/businesses/[id]/screened-calls/route.ts
//
// Returns the count of blocked vs passed calls
// for the Call Screener feature analytics

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

const ADMIN_USER_ID = process.env.ADMIN_USER_ID

export async function GET(
  request: Request,
  context: { params: { id: string } }
) {
  const { id } = context.params
  const { userId } = await auth()

  if (!userId || userId !== ADMIN_USER_ID) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const days = parseInt(searchParams.get('days') || '30')

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    // Get counts grouped by result
    const [blocked, passed, total] = await Promise.all([
      db.screenedCall.count({
        where: {
          businessId: id,
          result: 'blocked',
          createdAt: { gte: since },
        },
      }),
      db.screenedCall.count({
        where: {
          businessId: id,
          result: 'passed',
          createdAt: { gte: since },
        },
      }),
      db.screenedCall.count({
        where: {
          businessId: id,
          createdAt: { gte: since },
        },
      }),
    ])

    // Get recent screened calls for the log
    const recentCalls = await db.screenedCall.findMany({
      where: {
        businessId: id,
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    return NextResponse.json({
      stats: {
        blocked,
        passed,
        total,
        blockRate: total > 0 ? Math.round((blocked / total) * 100) : 0,
        days,
      },
      recentCalls,
    })
  } catch (error) {
    console.error('Failed to fetch screened call stats:', error)
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 })
  }
}
