import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireDashboardBusiness } from '@/lib/dashboard-auth'
import { getBusinessFeatures } from '@/lib/business-features'

type Period = 'today' | 'week' | 'month' | 'year' | 'all'

function getDateRanges(period: Period) {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  if (period === 'today') {
    const currentStart = startOfToday
    const previousStart = new Date(startOfToday)
    previousStart.setDate(previousStart.getDate() - 1)
    const previousEnd = startOfToday
    return {
      current: { since: currentStart, until: now },
      previous: { since: previousStart, until: previousEnd },
    }
  }

  if (period === 'week') {
    const currentStart = new Date(startOfToday)
    currentStart.setDate(currentStart.getDate() - 7)
    const previousEnd = currentStart
    const previousStart = new Date(previousEnd)
    previousStart.setDate(previousStart.getDate() - 7)
    return {
      current: { since: currentStart, until: now },
      previous: { since: previousStart, until: previousEnd },
    }
  }

  if (period === 'month') {
    const currentStart = new Date(startOfToday)
    currentStart.setDate(currentStart.getDate() - 30)
    const previousEnd = currentStart
    const previousStart = new Date(previousEnd)
    previousStart.setDate(previousStart.getDate() - 30)
    return {
      current: { since: currentStart, until: now },
      previous: { since: previousStart, until: previousEnd },
    }
  }

  if (period === 'year') {
    // Calendar year to date; previous = same span of the prior calendar year.
    const currentStart = new Date(now.getFullYear(), 0, 1)
    const previousStart = new Date(now.getFullYear() - 1, 0, 1)
    const previousEnd = currentStart
    return {
      current: { since: currentStart, until: now },
      previous: { since: previousStart, until: previousEnd },
    }
  }

  // all time
  return {
    current: { since: null as Date | null, until: null as Date | null },
    previous: { since: null as Date | null, until: null as Date | null },
  }
}

export async function GET(request: Request) {
  const authResult = await requireDashboardBusiness()
  if (authResult instanceof NextResponse) return authResult
  const { business } = authResult

  try {
    const { searchParams } = new URL(request.url)
    const periodParam = (searchParams.get('period') || 'month').toLowerCase() as Period
    const period: Period = ['today', 'week', 'month', 'year', 'all'].includes(periodParam)
      ? periodParam
      : 'month'

    const { current, previous } = getDateRanges(period)

    const currentDateFilter = current.since
      ? {
          gte: current.since,
        }
      : undefined

    const previousDateFilter =
      previous.since && previous.until
        ? {
            gte: previous.since,
            lt: previous.until,
          }
        : undefined

    const businessId = business.id
    const features = getBusinessFeatures(business)

    // Build totalCalls queries based on how this business handles inbound calls
    let totalCallsQuery: Promise<number>
    let previousTotalCallsQuery: Promise<number>

    if (features.totalCallsMode === 'screened') {
      totalCallsQuery = db.screenedCall.count({
        where: {
          businessId,
          ...(currentDateFilter ? { createdAt: currentDateFilter } : {}),
        },
      })
      previousTotalCallsQuery = previousDateFilter
        ? db.screenedCall.count({ where: { businessId, createdAt: previousDateFilter } })
        : Promise.resolve(0)
    } else {
      // 'calls' mode: count all inbound call-originated conversations
      totalCallsQuery = db.conversation.count({
        where: {
          businessId,
          callSid: { not: null },
          ...(currentDateFilter ? { createdAt: currentDateFilter } : {}),
        },
      })
      previousTotalCallsQuery = previousDateFilter
        ? db.conversation.count({
            where: { businessId, callSid: { not: null }, createdAt: previousDateFilter },
          })
        : Promise.resolve(0)
    }

    const [
      totalCalls,
      callsBlocked,
      callsPassed,
      leadsCapturedCurrent,
      websiteLeads,
      messagesSent,
      previousTotalCalls,
      previousLeadsCaptured,
      voicemailsCount,
      leadSourcesRaw,
      recentActivityRaw,
    ] = await Promise.all([
      totalCallsQuery,
      db.screenedCall.count({
        where: {
          businessId,
          result: 'blocked',
          ...(currentDateFilter ? { createdAt: currentDateFilter } : {}),
        },
      }),
      db.screenedCall.count({
        where: {
          businessId,
          result: 'passed',
          ...(currentDateFilter ? { createdAt: currentDateFilter } : {}),
        },
      }),
      db.contact.count({
        where: {
          businessId,
          source: {
            in: ['missed_call', 'website_form'],
          },
          ...(currentDateFilter ? { createdAt: currentDateFilter } : {}),
        },
      }),
      db.websiteLead.count({
        where: {
          businessId,
          ...(currentDateFilter ? { createdAt: currentDateFilter } : {}),
        },
      }),
      db.message.count({
        where: {
          direction: 'outbound',
          conversation: {
            businessId,
          },
          ...(currentDateFilter ? { createdAt: currentDateFilter } : {}),
        },
      }),
      previousTotalCallsQuery,
      previousDateFilter
        ? db.contact.count({
            where: {
              businessId,
              source: {
                in: ['missed_call', 'website_form'],
              },
              createdAt: previousDateFilter,
            },
          })
        : Promise.resolve(0),
      db.conversation.count({
        where: {
          businessId,
          recordingUrl: { not: null },
          ...(currentDateFilter ? { createdAt: currentDateFilter } : {}),
        },
      }),
      db.contact.groupBy({
        by: ['source'],
        where: {
          businessId,
          source: { not: null },
          ...(currentDateFilter ? { createdAt: currentDateFilter } : {}),
        },
        _count: {
          _all: true,
        },
      }),
      db.activity.findMany({
        where: {
          businessId,
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: {
          contact: {
            select: {
              name: true,
              phoneNumber: true,
            },
          },
        },
      }),
    ])

    const leadSources: {
      missed_call: number
      website_form: number
      referral: number
      google_ad: number
      imports: number
      manual: number
    } = {
      missed_call: 0,
      website_form: 0,
      referral: 0,
      google_ad: 0,
      imports: 0,
      manual: 0,
    }

    const importSources = new Set([
      'jobber_import',
      'servicetitan_import',
      'housecallpro_import',
      'quickbooks_import',
      'square_import',
      'google_contacts_import',
      'excel_import',
      'other_crm_import',
      'manual_list',
    ])

    type LeadSourceKey = keyof typeof leadSources

    for (const row of leadSourcesRaw) {
      const source = row.source || 'manual'
      const count = row._count._all

      if (source === 'missed_call' || source === 'website_form' || source === 'referral' || source === 'google_ad' || source === 'manual') {
        const key = source as LeadSourceKey
        leadSources[key] += count
      } else if (importSources.has(source)) {
        leadSources.imports += count
      }
    }

    const recentActivity = recentActivityRaw.map((a) => ({
      id: a.id,
      type: a.type,
      description: a.description,
      createdAt: a.createdAt,
      contactName: a.contact?.name ?? null,
      contactPhone: a.contact?.phoneNumber ?? null,
    }))

    return NextResponse.json({
      totalCalls,
      callsBlocked,
      callsPassed,
      leadsCapured: leadsCapturedCurrent,
      leadsCaptured: leadsCapturedCurrent,
      websiteLeads,
      messagesSent,
      voicemailsCount,
      previousTotalCalls: period === 'all' ? null : previousTotalCalls,
      previousLeadsCaptured: period === 'all' ? null : previousLeadsCaptured,
      leadSources,
      recentActivity,
      features,
      totalCallsMode: features.totalCallsMode,
    })
  } catch (error) {
    console.error('[dashboard-analytics]', error)
    return NextResponse.json({ error: 'Failed to load analytics' }, { status: 500 })
  }
}

