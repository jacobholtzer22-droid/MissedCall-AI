// ===========================================
// CLIENT DASHBOARD: SCREENED CALLS
// ===========================================
// Returns call activity (blocked/passed) and recent screened calls
// for the authenticated client's business. Used when missedCallAiEnabled is false.

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getBusinessForDashboard } from '@/lib/get-business-for-dashboard'

export async function GET(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({
    where: { clerkId: userId },
    include: { business: true },
  })

  const { business } = await getBusinessForDashboard(userId, user?.business ?? null)
  if (!business) return NextResponse.json({ error: 'No business found' }, { status: 404 })

  try {
    const { searchParams } = new URL(request.url)
    const days = Math.min(90, Math.max(1, parseInt(searchParams.get('days') || '30', 10)))
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    const [blocked, passed, total, recentCalls] = await Promise.all([
      db.screenedCall.count({
        where: {
          businessId: business.id,
          result: 'blocked',
          createdAt: { gte: since },
        },
      }),
      db.screenedCall.count({
        where: {
          businessId: business.id,
          result: 'passed',
          createdAt: { gte: since },
        },
      }),
      db.screenedCall.count({
        where: {
          businessId: business.id,
          createdAt: { gte: since },
        },
      }),
      db.screenedCall.findMany({
        where: {
          businessId: business.id,
          createdAt: { gte: since },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ])

    return NextResponse.json({
      stats: {
        blocked,
        passed,
        total,
        blockRate: total > 0 ? Math.round((blocked / total) * 100) : 0,
        days,
      },
      recentCalls: recentCalls.map((c) => ({
        id: c.id,
        callerPhone: c.callerPhone,
        result: c.result,
        createdAt: c.createdAt,
      })),
    })
  } catch (error) {
    console.error('Dashboard screened-calls:', error)
    return NextResponse.json({ error: 'Failed to fetch screened calls' }, { status: 500 })
  }
}
