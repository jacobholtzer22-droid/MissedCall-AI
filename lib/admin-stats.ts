// ===========================================
// ADMIN STATS - single source for the /admin business list
// ===========================================
// Used by both app/admin/page.tsx (initial SSR) and GET /api/admin/businesses
// (manual refresh). Every stat is one cross-tenant query (groupBy, or one
// $queryRaw where Prisma cannot join); the total number of SQL statements does
// not grow with the number of businesses. No per-business loops against the DB.
//
// Windows are UTC. monthStart = first of the current calendar month (server
// clock), d7/d14/d30 = now minus N days, h48 = now minus 48 hours.

import { db } from '@/lib/db'
import type { AdminBusiness, AdminStats } from '@/app/admin/types'

const SCREENING_STATUSES = ['screening', 'screening_blocked']

// Mirrors lib/conversation-buckets.ts: a conversation is "stalled" only if it is
// not closed (no lead fields, no appointment, not a terminal status), has at
// least one inbound message, and its last message is older than 48h.
const NOT_STALLED_STATUSES = [
  'closed',
  'completed',
  'appointment_booked',
  'lead_captured',
  'human_needed',
  'screening',
  'screening_blocked',
]

type SmsRow = { businessId: string; failed: number; finalized: number }

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null
}

function maxDate(...dates: (Date | null | undefined)[]): Date | null {
  let best: Date | null = null
  for (const d of dates) {
    if (d && (!best || d > best)) best = d
  }
  return best
}

export async function getAdminBusinesses(): Promise<AdminBusiness[]> {
  const now = new Date()
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  // Stats windows (UTC)
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const h48 = new Date(now.getTime() - 48 * 60 * 60 * 1000)

  const missedCallWhere = {
    callSid: { not: null },
    callConnected: false,
    status: { notIn: SCREENING_STATUSES },
    createdAt: { gte: monthStart },
  }

  const [
    businesses,
    recentConvos,
    allTimeLeads,
    blockedCounts,
    // ---- stats (one cross-tenant query each) ----
    missedCalls,
    textbacks,
    replied,
    captured,
    booked,
    webLeads,
    lastWebLead,
    lastCall,
    lastScreened,
    lastConversation,
    smsRows,
    humanNeeded,
    stalled,
    spam,
    skips,
    telnyxCost,
    telnyxLast,
    ads,
  ] = await Promise.all([
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

    // missedCallsMonth
    db.conversation.groupBy({
      by: ['businessId'],
      where: missedCallWhere,
      _count: true,
    }),
    // textbacksMonth — conversations (not messages) with an outbound text
    db.conversation.groupBy({
      by: ['businessId'],
      where: { ...missedCallWhere, messages: { some: { direction: 'outbound' } } },
      _count: true,
    }),
    // repliedMonth
    db.conversation.groupBy({
      by: ['businessId'],
      where: {
        callSid: { not: null },
        createdAt: { gte: monthStart },
        messages: { some: { direction: 'inbound' } },
      },
      _count: true,
    }),
    // capturedMonth
    db.conversation.groupBy({
      by: ['businessId'],
      where: {
        createdAt: { gte: monthStart },
        OR: [
          { status: { in: ['lead_captured', 'appointment_booked'] } },
          { customerEmail: { not: null } },
          { customerAddress: { not: null } },
          { customerTimeframe: { not: null } },
          { appointment: { isNot: null } },
        ],
      },
      _count: true,
    }),
    // bookedMonth by source
    db.appointment.groupBy({
      by: ['businessId', 'source'],
      where: { createdAt: { gte: monthStart }, status: { not: 'cancelled' } },
      _count: true,
    }),
    // webLeadsMonth
    db.websiteLead.groupBy({
      by: ['businessId'],
      where: { status: { notIn: ['spam', 'partial'] }, createdAt: { gte: monthStart } },
      _count: true,
    }),
    // lastWebLeadAt
    db.websiteLead.groupBy({
      by: ['businessId'],
      where: { status: { notIn: ['spam', 'partial'] } },
      _max: { createdAt: true },
    }),
    // lastCallAt
    db.conversation.groupBy({
      by: ['businessId'],
      where: { callSid: { not: null } },
      _max: { createdAt: true },
    }),
    // lastScreenedAt
    db.screenedCall.groupBy({
      by: ['businessId'],
      _max: { createdAt: true },
    }),
    // lastConversationAt
    db.conversation.groupBy({
      by: ['businessId'],
      _max: { lastMessageAt: true },
    }),
    // failedSms7d / finalizedSms7d — Message has no businessId, so join through
    // Conversation. Counts are cast to int because Postgres COUNT is bigint.
    db.$queryRaw<SmsRow[]>`
      SELECT
        c."businessId" AS "businessId",
        (COUNT(*) FILTER (WHERE m."telnyxStatus" = 'delivery_failed'))::int AS "failed",
        (COUNT(*) FILTER (WHERE m."telnyxStatus" IN ('delivered', 'delivery_failed', 'sent')))::int AS "finalized"
      FROM "Message" m
      JOIN "Conversation" c ON c."id" = m."conversationId"
      WHERE m."direction" = 'outbound' AND m."createdAt" >= ${d7}
      GROUP BY c."businessId"
    `,
    // humanNeeded (current, not windowed)
    db.conversation.groupBy({
      by: ['businessId'],
      where: { status: 'human_needed' },
      _count: true,
    }),
    // stalled
    db.conversation.groupBy({
      by: ['businessId'],
      where: {
        messages: { some: { direction: 'inbound' } },
        lastMessageAt: { lt: h48, gte: d30 },
        customerEmail: null,
        customerAddress: null,
        customerTimeframe: null,
        appointment: { is: null },
        status: { notIn: NOT_STALLED_STATUSES },
      },
      _count: true,
    }),
    // spamBlockedMonth / spamPassedMonth
    db.screenedCall.groupBy({
      by: ['businessId', 'result'],
      where: { createdAt: { gte: monthStart } },
      _count: true,
    }),
    // skipsMonth by reason
    db.cooldownSkipLog.groupBy({
      by: ['businessId', 'reason'],
      where: { attemptedAt: { gte: monthStart } },
      _count: true,
    }),
    // telnyxCostMonth
    db.telnyxUsageRecord.groupBy({
      by: ['businessId'],
      where: { occurredAt: { gte: monthStart } },
      _sum: { cost: true },
    }),
    // telnyxLastRecordAt (all time)
    db.telnyxUsageRecord.groupBy({
      by: ['businessId'],
      _max: { occurredAt: true },
    }),
    // ads30d (existing snapshots only; no API calls)
    db.googleAdsSnapshot.groupBy({
      by: ['businessId'],
      where: { date: { gte: d30 } },
      _sum: { cost: true, clicks: true, conversions: true },
      _max: { createdAt: true },
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

  // ---- index every stat by businessId ----
  const countMap = (rows: { businessId: string; _count: number }[]) =>
    new Map(rows.map(r => [r.businessId, r._count]))

  const missedMap = countMap(missedCalls)
  const textbacksMap = countMap(textbacks)
  const repliedMap = countMap(replied)
  const capturedMap = countMap(captured)
  const webLeadsMap = countMap(webLeads)
  const humanNeededMap = countMap(humanNeeded)
  const stalledMap = countMap(stalled)

  const bookedMap = new Map<string, { website: number; sms: number }>()
  for (const r of booked) {
    const b = bookedMap.get(r.businessId) ?? { website: 0, sms: 0 }
    if (r.source === 'website') b.website += r._count
    else if (r.source === 'sms') b.sms += r._count
    bookedMap.set(r.businessId, b)
  }

  const lastWebLeadMap = new Map(lastWebLead.map(r => [r.businessId, r._max.createdAt]))
  const lastCallMap = new Map(lastCall.map(r => [r.businessId, r._max.createdAt]))
  const lastScreenedMap = new Map(lastScreened.map(r => [r.businessId, r._max.createdAt]))
  const lastConversationMap = new Map(lastConversation.map(r => [r.businessId, r._max.lastMessageAt]))

  const smsMap = new Map(smsRows.map(r => [r.businessId, r]))

  const spamMap = new Map<string, { blocked: number; passed: number }>()
  for (const r of spam) {
    const s = spamMap.get(r.businessId) ?? { blocked: 0, passed: 0 }
    if (r.result === 'blocked') s.blocked += r._count
    else if (r.result === 'passed') s.passed += r._count
    spamMap.set(r.businessId, s)
  }

  const skipsMap = new Map<string, { cooldown: number; existing_contact: number; blocked: number }>()
  for (const r of skips) {
    const s = skipsMap.get(r.businessId) ?? { cooldown: 0, existing_contact: 0, blocked: 0 }
    if (r.reason === 'cooldown') s.cooldown += r._count
    else if (r.reason === 'existing_contact') s.existing_contact += r._count
    else if (r.reason === 'blocked') s.blocked += r._count
    skipsMap.set(r.businessId, s)
  }

  const telnyxCostMap = new Map(telnyxCost.map(r => [r.businessId, r._sum.cost ?? 0]))
  const telnyxLastMap = new Map(telnyxLast.map(r => [r.businessId, r._max.occurredAt]))
  const adsMap = new Map(ads.map(r => [r.businessId, r]))

  return businesses.map(biz => {
    const lastCallAt = lastCallMap.get(biz.id) ?? null
    const lastScreenedAt = lastScreenedMap.get(biz.id) ?? null
    const lastConversationAt = lastConversationMap.get(biz.id) ?? null
    const lastWebLeadAt = lastWebLeadMap.get(biz.id) ?? null

    const lastActivityAt = maxDate(lastCallAt, lastScreenedAt, lastConversationAt, lastWebLeadAt)
    let lastActivityKind: AdminStats['lastActivityKind'] = null
    if (lastActivityAt) {
      // First match wins on ties, in this order.
      if (lastCallAt && lastCallAt.getTime() === lastActivityAt.getTime()) lastActivityKind = 'call'
      else if (lastScreenedAt && lastScreenedAt.getTime() === lastActivityAt.getTime()) lastActivityKind = 'screened'
      else if (lastConversationAt && lastConversationAt.getTime() === lastActivityAt.getTime()) lastActivityKind = 'message'
      else lastActivityKind = 'web_lead'
    }

    const sms = smsMap.get(biz.id)
    const adsRow = adsMap.get(biz.id)

    const stats: AdminStats = {
      missedCallsMonth: missedMap.get(biz.id) ?? 0,
      textbacksMonth: textbacksMap.get(biz.id) ?? 0,
      repliedMonth: repliedMap.get(biz.id) ?? 0,
      capturedMonth: capturedMap.get(biz.id) ?? 0,
      bookedMonth: bookedMap.get(biz.id) ?? { website: 0, sms: 0 },
      webLeadsMonth: webLeadsMap.get(biz.id) ?? 0,
      lastWebLeadAt: iso(lastWebLeadAt),
      lastCallAt: iso(lastCallAt),
      lastScreenedAt: iso(lastScreenedAt),
      lastConversationAt: iso(lastConversationAt),
      lastActivityAt: iso(lastActivityAt),
      lastActivityKind,
      failedSms7d: sms?.failed ?? 0,
      finalizedSms7d: sms?.finalized ?? 0,
      humanNeeded: humanNeededMap.get(biz.id) ?? 0,
      stalled: stalledMap.get(biz.id) ?? 0,
      spamBlockedMonth: spamMap.get(biz.id)?.blocked ?? 0,
      spamPassedMonth: spamMap.get(biz.id)?.passed ?? 0,
      skipsMonth: skipsMap.get(biz.id) ?? { cooldown: 0, existing_contact: 0, blocked: 0 },
      telnyxCostMonth: telnyxCostMap.get(biz.id) ?? 0,
      telnyxLastRecordAt: iso(telnyxLastMap.get(biz.id)),
      ads30d: adsRow
        ? {
            spend: adsRow._sum.cost ?? 0,
            clicks: adsRow._sum.clicks ?? 0,
            conversions: adsRow._sum.conversions ?? 0,
            lastSyncAt: iso(adsRow._max.createdAt),
          }
        : null,
    }

    return {
      ...biz,
      createdAt: biz.createdAt.toISOString(),
      updatedAt: biz.updatedAt.toISOString(),
      _count: {
        ...biz._count,
        blockedCalls30d: blockedMap.get(biz.id) ?? 0,
      },
      conversationsThisMonth: statsMap.get(biz.id)?.thisMonth ?? 0,
      conversationsLastMonth: statsMap.get(biz.id)?.lastMonth ?? 0,
      leadsThisMonth: statsMap.get(biz.id)?.leads ?? 0,
      conversationsAllTime: biz._count.conversations,
      leadsAllTime: allTimeLeadsMap.get(biz.id) ?? 0,
      stats,
    }
  }) as AdminBusiness[]
}
