// ===========================================
// ADMIN USAGE - Per-business SMS stats, skips, cost, message log
// ===========================================
// Uses real Telnyx MDR/CDR cost data from TelnyxUsageRecord (synced via /api/admin/usage/sync)

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

const ADMIN_USER_ID = process.env.ADMIN_USER_ID

function sumCallMinutes(
  records: { metadata: unknown }[]
): { count: number; minutes: number } {
  let minutes = 0
  for (const r of records) {
    const m = r.metadata as Record<string, unknown> | null
    if (!m) continue
    const sec = Number(m.billed_sec ?? m.call_sec ?? 0)
    if (!isNaN(sec) && sec > 0) minutes += sec / 60
  }
  return { count: records.length, minutes }
}

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
      callRecordsThisWeek,
      callRecordsAllTime,
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
      // Call records for count and minutes (this week)
      db.telnyxUsageRecord.findMany({
        where: {
          businessId,
          recordType: { in: ['call', 'call_forwarding'] },
          occurredAt: { gte: weekStart },
        },
        select: { metadata: true },
      }),
      // Call records for count and minutes (all time)
      db.telnyxUsageRecord.findMany({
        where: {
          businessId,
          recordType: { in: ['call', 'call_forwarding'] },
        },
        select: { metadata: true },
      }),
    ])

    const totalSkips = cooldownSkips + contactSkips + blockedSkips

    const smsCostThisWeek =
      usageThisWeek.find((u) => u.recordType === 'sms')?._sum.cost ?? 0
    const voiceCostThisWeek =
      usageThisWeek.find((u) => u.recordType === 'call')?._sum.cost ?? 0
    const callForwardingCostThisWeek =
      usageThisWeek.find((u) => u.recordType === 'call_forwarding')?._sum.cost ?? 0
    const smsCostAllTime =
      usageAllTime.find((u) => u.recordType === 'sms')?._sum.cost ?? 0
    const voiceCostAllTime =
      usageAllTime.find((u) => u.recordType === 'call')?._sum.cost ?? 0
    const callForwardingCostAllTime =
      usageAllTime.find((u) => u.recordType === 'call_forwarding')?._sum.cost ?? 0

    const totalCostThisWeek =
      smsCostThisWeek + voiceCostThisWeek + callForwardingCostThisWeek
    const totalCostAllTime =
      smsCostAllTime + voiceCostAllTime + callForwardingCostAllTime

    const callsThisWeek = sumCallMinutes(callRecordsThisWeek)
    const callsAllTime = sumCallMinutes(callRecordsAllTime)

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
        voiceThisWeek: Math.round(voiceCostThisWeek * 100) / 100,
        callForwardingThisWeek: Math.round(callForwardingCostThisWeek * 100) / 100,
        totalThisWeek: Math.round(totalCostThisWeek * 100) / 100,
        smsAllTime: Math.round(smsCostAllTime * 100) / 100,
        voiceAllTime: Math.round(voiceCostAllTime * 100) / 100,
        callForwardingAllTime: Math.round(callForwardingCostAllTime * 100) / 100,
        totalAllTime: Math.round(totalCostAllTime * 100) / 100,
      },
      calls: {
        thisWeek: callsThisWeek.count,
        allTime: callsAllTime.count,
        minutesThisWeek: Math.round(callsThisWeek.minutes * 10) / 10,
        minutesAllTime: Math.round(callsAllTime.minutes * 10) / 10,
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
