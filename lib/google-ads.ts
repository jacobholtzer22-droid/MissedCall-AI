// ===========================================
// GOOGLE ADS INTEGRATION
// ===========================================
// Fetches campaign metrics from Google Ads API and stores
// daily snapshots in GoogleAdsSnapshot for dashboard display.

import { GoogleAdsApi } from 'google-ads-api'
import { db } from '@/lib/db'

let _client: GoogleAdsApi | null = null

/** Instantiate Google Ads API client (singleton). */
export function getGoogleAdsClient(): GoogleAdsApi {
  if (_client) return _client
  _client = new GoogleAdsApi({
    client_id: process.env.GOOGLE_ADS_CLIENT_ID!,
    client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
    developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
  })
  return _client
}

/**
 * Sync Google Ads campaign data for a single business.
 * Queries GAQL for campaign-level metrics, converts cost_micros to dollars,
 * and upserts into GoogleAdsSnapshot using the (businessId, campaignId, date) unique constraint.
 *
 * @param businessId - The business to sync
 * @param startDate  - YYYY-MM-DD (default: 30 days ago)
 * @param endDate    - YYYY-MM-DD (default: yesterday)
 * @returns { rowsSynced, errors }
 */
export async function syncGoogleAdsData(
  businessId: string,
  startDate?: string,
  endDate?: string,
): Promise<{ rowsSynced: number; errors: string[] }> {
  const errors: string[] = []

  const business = await db.business.findUnique({
    where: { id: businessId },
    select: { googleAdsCustomerId: true, googleAdsEnabled: true, name: true },
  })

  if (!business) {
    return { rowsSynced: 0, errors: ['Business not found'] }
  }
  if (!business.googleAdsEnabled || !business.googleAdsCustomerId) {
    return { rowsSynced: 0, errors: ['Google Ads not enabled or no customer ID'] }
  }

  const now = new Date()
  const defaultEnd = new Date(now)
  defaultEnd.setDate(defaultEnd.getDate() - 1) // yesterday
  const defaultStart = new Date(now)
  defaultStart.setDate(defaultStart.getDate() - 30)

  const start = startDate || defaultStart.toISOString().split('T')[0]
  const end = endDate || defaultEnd.toISOString().split('T')[0]

  const client = getGoogleAdsClient()
  const customer = client.Customer({
    customer_id: business.googleAdsCustomerId,
    refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN!,
    login_customer_id: process.env.GOOGLE_ADS_MCC_ID,
  })

  const query = `
    SELECT
      campaign.id,
      campaign.name,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.ctr,
      metrics.cost_per_conversion,
      segments.date
    FROM campaign
    WHERE segments.date BETWEEN '${start}' AND '${end}'
    ORDER BY segments.date DESC
  `

  let rows: any[]
  try {
    rows = await customer.query(query)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[GOOGLE ADS] Query failed for business ${businessId}:`, msg)
    return { rowsSynced: 0, errors: [msg] }
  }

  let rowsSynced = 0

  for (const row of rows) {
    try {
      const campaignId = String(row.campaign?.id ?? '')
      const campaignName = String(row.campaign?.name ?? 'Unknown Campaign')
      const dateStr = String(row.segments?.date ?? '')
      if (!campaignId || !dateStr) continue

      const impressions = Number(row.metrics?.impressions ?? 0)
      const clicks = Number(row.metrics?.clicks ?? 0)
      const costMicros = Number(row.metrics?.cost_micros ?? 0)
      const cost = costMicros / 1_000_000
      const conversions = Number(row.metrics?.conversions ?? 0)
      const ctr = Number(row.metrics?.ctr ?? 0)
      const rawCpc = Number(row.metrics?.cost_per_conversion ?? 0)
      const costPerConversion = conversions > 0 ? (rawCpc > 0 ? rawCpc / 1_000_000 : cost / conversions) : null

      // Parse date as start-of-day UTC
      const date = new Date(dateStr + 'T00:00:00.000Z')

      await db.googleAdsSnapshot.upsert({
        where: {
          businessId_campaignId_date: { businessId, campaignId, date },
        },
        create: {
          businessId,
          campaignId,
          campaignName,
          date,
          impressions,
          clicks,
          cost,
          conversions,
          ctr,
          costPerConversion,
        },
        update: {
          campaignName,
          impressions,
          clicks,
          cost,
          conversions,
          ctr,
          costPerConversion,
        },
      })
      rowsSynced++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`Row error: ${msg}`)
    }
  }

  console.log(`[GOOGLE ADS] Synced ${rowsSynced} rows for business "${business.name}" (${businessId})`)
  return { rowsSynced, errors }
}

/**
 * Sync Google Ads data for ALL enabled businesses.
 * Finds every business with googleAdsEnabled=true and a googleAdsCustomerId,
 * then calls syncGoogleAdsData for each.
 */
export async function syncAllBusinessAds(): Promise<{
  synced: number
  errors: string[]
}> {
  const businesses = await db.business.findMany({
    where: {
      googleAdsEnabled: true,
      googleAdsCustomerId: { not: null },
    },
    select: { id: true, name: true },
  })

  let totalSynced = 0
  const allErrors: string[] = []

  for (const biz of businesses) {
    const result = await syncGoogleAdsData(biz.id)
    totalSynced += result.rowsSynced
    if (result.errors.length > 0) {
      allErrors.push(...result.errors.map((e) => `[${biz.name}] ${e}`))
    }
  }

  return { synced: totalSynced, errors: allErrors }
}
