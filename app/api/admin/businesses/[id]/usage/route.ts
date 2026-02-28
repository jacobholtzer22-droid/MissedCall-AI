// ===========================================
// ADMIN USAGE - Per-business SMS stats, skips, cost, message log
// ===========================================
// Uses real Telnyx MDR/CDR cost data from TelnyxUsageRecord (synced via /api/admin/usage/sync)

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

const ADMIN_USER_ID = process.env.ADMIN_USER_ID

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: businessId } = await params
  const { userId } = await auth()

  if (!userId || userId !== ADMIN_USER_ID) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  try {
    const business = await db.business.findUnique({
      where: { id: businessId },
      select: { id: true, name: true },
    })

    if (!business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    const now = new Date()
    const weekStart = new Date(now)
    weekStart.setDate(weekStart.getDate() - 7)
    weekStart.setHours(0, 0, 0, 0)

    const [
      smsThisWeek,
      smsAllTime,
      missedCallConvos,
      cooldownSkips,
      contactSkips,
      blockedSkips,
      skipLogs,
      recentMessages,
      usageThisWeek,
      usageAllTime,
    ] = await Promise.all([
      db.message.count({
        where: {
          direction: 'outbound',
          conversation: { businessId },
          createdAt: { gte: weekStart },
        },
      }),
      db.message.count({
        where: {
          direction: 'outbound',
          conversation: { businessId },
        },
      }),
      db.conversation.count({
        where: {
          businessId,
          messages: { some: { direction: 'outbound' } },
        },
      }),
      db.cooldownSkipLog.count({
        where: { businessId, reason: 'cooldown' },
      }),
      db.cooldownSkipLog.count({
        where: { businessId, reason: 'existing_contact' },
      }),
      db.cooldownSkipLog.count({
        where: { businessId, reason: 'blocked' },
      }),
      db.cooldownSkipLog.findMany({
        where: { businessId },
        orderBy: { attemptedAt: 'desc' },
        take: 50,
      }),
      db.message.findMany({
        where: { conversation: { businessId } },
        orderBy: { createdAt: 'desc' },
        take: 30,
        include: {
          conversation: {
            select: { callerPhone: true, callerName: true },
          },
        },
      }),
      // Real Telnyx costs from MDR/CDR - this week
      db.telnyxUsageRecord.groupBy({
        by: ['recordType'],
        where: { businessId, occurredAt: { gte: weekStart } },
        _sum: { cost: true },
      }),
      // Real Telnyx costs - all time
      db.telnyxUsageRecord.groupBy({
        by: ['recordType'],
        where: { businessId },
        _sum: { cost: true },
      }),
    ])

    const totalSkips = cooldownSkips + contactSkips + blockedSkips

    const smsCostThisWeek =
      usageThisWeek.find((u) => u.recordType === 'sms')?._sum.cost ?? 0
    const callCostThisWeek =
      usageThisWeek.find((u) => u.recordType === 'call')?._sum.cost ?? 0
    const smsCostAllTime =
      usageAllTime.find((u) => u.recordType === 'sms')?._sum.cost ?? 0
    const callCostAllTime =
      usageAllTime.find((u) => u.recordType === 'call')?._sum.cost ?? 0

    const totalCostThisWeek = smsCostThisWeek + callCostThisWeek
    const totalCostAllTime = smsCostAllTime + callCostAllTime

    // Money saved: use avg cost per SMS from real data when available
    const avgSmsCost =
      smsAllTime > 0 && smsCostAllTime > 0 ? smsCostAllTime / smsAllTime : 0.0079
    const moneySaved = totalSkips * avgSmsCost

    return NextResponse.json({
      business: { id: business.id, name: business.name },
      sms: {
        thisWeek: smsThisWeek,
        allTime: smsAllTime,
      },
      missedCallSmsTriggered: missedCallConvos,
      skips: {
        cooldown: cooldownSkips,
        existingContact: contactSkips,
        blocked: blockedSkips,
        total: totalSkips,
      },
      moneySaved: Math.round(moneySaved * 100) / 100,
      cost: {
        smsThisWeek: Math.round(smsCostThisWeek * 100) / 100,
        callThisWeek: Math.round(callCostThisWeek * 100) / 100,
        totalThisWeek: Math.round(totalCostThisWeek * 100) / 100,
        smsAllTime: Math.round(smsCostAllTime * 100) / 100,
        callAllTime: Math.round(callCostAllTime * 100) / 100,
        totalAllTime: Math.round(totalCostAllTime * 100) / 100,
      },
      skipLogs,
      recentMessages: recentMessages.map((m) => ({
        id: m.id,
        direction: m.direction,
        content: m.content.slice(0, 100) + (m.content.length > 100 ? '…' : ''),
        createdAt: m.createdAt,
        callerPhone: m.conversation.callerPhone,
        callerName: m.conversation.callerName,
        cost: m.cost != null ? Math.round(m.cost * 10000) / 10000 : null,
      })),
    })
  } catch (error) {
    console.error('Admin usage: Failed to fetch:', error)
    return NextResponse.json({ error: 'Failed to fetch usage' }, { status: 500 })
  }
}
