// ===========================================
// DASHBOARD: SYNC GOOGLE ADS DATA
// ===========================================
// POST /api/dashboard/google-ads/sync
// Triggers a Google Ads data sync for the authenticated user's business.

import { NextResponse } from 'next/server'
import { requireDashboardBusiness } from '@/lib/dashboard-auth'
import { syncGoogleAdsData } from '@/lib/google-ads'
import { getOwnerGroupBusinesses } from '@/lib/owner-group'

export async function POST() {
  const authResult = await requireDashboardBusiness()
  if (authResult instanceof NextResponse) return authResult
  const { business } = authResult

  if (!business.googleAdsEnabled) {
    return NextResponse.json({ error: 'Feature not available' }, { status: 403 })
  }

  const group = await getOwnerGroupBusinesses(business)

  // Ungrouped businesses keep today's exact behavior
  if (group.length === 1) {
    if (!(business as any).googleAdsCustomerId) {
      return NextResponse.json({ error: 'Google Ads Customer ID is not configured' }, { status: 400 })
    }

    try {
      const result = await syncGoogleAdsData(business.id)
      return NextResponse.json({
        success: true,
        rowsSynced: result.rowsSynced,
        errors: result.errors,
        lastSyncedAt: new Date().toISOString(),
      })
    } catch (err) {
      console.error('[DASHBOARD GOOGLE ADS SYNC] Error:', err)
      return NextResponse.json(
        { error: 'Sync failed', detail: err instanceof Error ? err.message : String(err) },
        { status: 500 },
      )
    }
  }

  // Grouped: sync every configured member. Members without a customer ID
  // (including the primary) are skipped, not errors.
  const syncable = group.filter((b) => b.googleAdsEnabled && b.googleAdsCustomerId)
  if (syncable.length === 0) {
    return NextResponse.json({ error: 'Google Ads Customer ID is not configured' }, { status: 400 })
  }

  let rowsSynced = 0
  const errors: string[] = []
  for (const b of syncable) {
    try {
      const result = await syncGoogleAdsData(b.id)
      rowsSynced += result.rowsSynced
      errors.push(...result.errors.map((e) => `${b.name}: ${e}`))
    } catch (err) {
      console.error(`[DASHBOARD GOOGLE ADS SYNC] Error for ${b.id}:`, err)
      errors.push(`${b.name}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return NextResponse.json({
    success: true,
    rowsSynced,
    errors,
    lastSyncedAt: new Date().toISOString(),
  })
}
