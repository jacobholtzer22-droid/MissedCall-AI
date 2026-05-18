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
    const now = new Date()
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

    const [businesses, recentConvos, allTimeLeads, blockedCounts] = await Promise.all([
      db.business.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: {
              conversations: { where: { messages: { some: {} } } },
              appointments: true,
              users: true,
              screenedCalls: true,
            },
          },
        },
      }),
      // Fetch conversations from the last 2 months with bucket classification fields
      db.conversation.findMany({
        where: {
          createdAt: { gte: lastMonthStart },
          messages: { some: {} },
        },
        select: {
          id: true,
          businessId: true,
          createdAt: true,
          customerEmail: true,
          customerAddress: true,
          customerTimeframe: true,
          appointment: { select: { id: true } },
        },
      }),
      db.conversation.groupBy({
        by: ['businessId'],
        where: {
          messages: { some: {} },
          OR: [
            { customerEmail: { not: null } },
            { customerAddress: { not: null } },
            { customerTimeframe: { not: null } },
            { appointment: { isNot: null } },
          ],
        },
        _count: true,
      }),
      db.screenedCall.groupBy({
        by: ['businessId'],
        where: { result: 'blocked', createdAt: { gte: thirtyDaysAgo } },
        _count: true,
      }),
    ])

    // Compute per-business monthly stats
    const statsMap = new Map<string, { thisMonth: number; lastMonth: number; leads: number }>()
    for (const conv of recentConvos) {
      const s = statsMap.get(conv.businessId) ?? { thisMonth: 0, lastMonth: 0, leads: 0 }
      const isThisMonth = conv.createdAt >= thisMonthStart
      const isLastMonth = !isThisMonth && conv.createdAt >= lastMonthStart

      if (isThisMonth) {
        s.thisMonth++
        if (conv.customerEmail || conv.customerAddress || conv.customerTimeframe || conv.appointment) {
          s.leads++
        }
      } else if (isLastMonth) {
        s.lastMonth++
      }

      statsMap.set(conv.businessId, s)
    }

    const allTimeLeadsMap = new Map(allTimeLeads.map(r => [r.businessId, r._count]))
    const blockedMap = new Map(blockedCounts.map(b => [b.businessId, b._count]))

    const businessesWithStats = businesses.map(biz => ({
      ...biz,
      _count: {
        ...biz._count,
        blockedCalls30d: blockedMap.get(biz.id) ?? 0,
      },
      conversationsThisMonth: statsMap.get(biz.id)?.thisMonth ?? 0,
      conversationsLastMonth: statsMap.get(biz.id)?.lastMonth ?? 0,
      leadsThisMonth: statsMap.get(biz.id)?.leads ?? 0,
      conversationsAllTime: biz._count.conversations,
      leadsAllTime: allTimeLeadsMap.get(biz.id) ?? 0,
    }))

    return NextResponse.json({ businesses: businessesWithStats })
  } catch (error) {
    console.error('Admin: Failed to fetch businesses:', error)
    return NextResponse.json({ error: 'Failed to fetch businesses' }, { status: 500 })
  }
}
