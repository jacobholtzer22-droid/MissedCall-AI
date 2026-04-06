// ===========================================
// DASHBOARD: GOOGLE ADS DATA
// ===========================================
// GET /api/dashboard/google-ads
// Returns aggregated GoogleAdsSnapshot data for the authenticated business.
// Query params: startDate, endDate, groupBy (day|campaign)

import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardBusiness } from '@/lib/dashboard-auth'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  const authResult = await requireDashboardBusiness()
  if (authResult instanceof NextResponse) return authResult
  const { business } = authResult

  const { searchParams } = request.nextUrl
  const groupBy = searchParams.get('groupBy') || 'day' // day | campaign

  // Default: last 30 days
  const now = new Date()
  const defaultStart = new Date(now)
  defaultStart.setDate(defaultStart.getDate() - 30)

  const startDate = searchParams.get('startDate')
    ? new Date(searchParams.get('startDate')! + 'T00:00:00.000Z')
    : defaultStart
  const endDate = searchParams.get('endDate')
    ? new Date(searchParams.get('endDate')! + 'T23:59:59.999Z')
    : now

  const snapshots = await db.googleAdsSnapshot.findMany({
    where: {
      businessId: business.id,
      date: { gte: startDate, lte: endDate },
    },
    orderBy: { date: 'asc' },
  })

  // Summary totals
  const totals = {
    impressions: 0,
    clicks: 0,
    cost: 0,
    conversions: 0,
  }
  for (const s of snapshots) {
    totals.impressions += s.impressions
    totals.clicks += s.clicks
    totals.cost += s.cost
    totals.conversions += s.conversions
  }
  const avgCtr = totals.impressions > 0 ? totals.clicks / totals.impressions : 0
  const avgCostPerConversion = totals.conversions > 0 ? totals.cost / totals.conversions : null

  // Daily aggregation
  const dailyMap = new Map<string, { date: string; impressions: number; clicks: number; cost: number; conversions: number }>()
  for (const s of snapshots) {
    const key = s.date.toISOString().split('T')[0]!
    const existing = dailyMap.get(key) || { date: key, impressions: 0, clicks: 0, cost: 0, conversions: 0 }
    existing.impressions += s.impressions
    existing.clicks += s.clicks
    existing.cost += s.cost
    existing.conversions += s.conversions
    dailyMap.set(key, existing)
  }
  const daily = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date))

  // Campaign aggregation
  const campaignMap = new Map<string, { campaignId: string; campaignName: string; impressions: number; clicks: number; cost: number; conversions: number }>()
  for (const s of snapshots) {
    const existing = campaignMap.get(s.campaignId) || {
      campaignId: s.campaignId,
      campaignName: s.campaignName,
      impressions: 0,
      clicks: 0,
      cost: 0,
      conversions: 0,
    }
    existing.impressions += s.impressions
    existing.clicks += s.clicks
    existing.cost += s.cost
    existing.conversions += s.conversions
    // Always use latest campaign name
    existing.campaignName = s.campaignName
    campaignMap.set(s.campaignId, existing)
  }
  const campaigns = Array.from(campaignMap.values())
    .map((c) => ({
      ...c,
      ctr: c.impressions > 0 ? c.clicks / c.impressions : 0,
      costPerConversion: c.conversions > 0 ? c.cost / c.conversions : null,
    }))
    .sort((a, b) => b.cost - a.cost) // highest spend first

  return NextResponse.json({
    totals: {
      ...totals,
      avgCtr,
      avgCostPerConversion,
    },
    daily,
    campaigns,
  })
}
