// ===========================================
// DASHBOARD: SYNC GOOGLE ADS DATA
// ===========================================
// POST /api/dashboard/google-ads/sync
// Triggers a Google Ads data sync for the authenticated user's business.

import { NextResponse } from 'next/server'
import { requireDashboardBusiness } from '@/lib/dashboard-auth'
import { syncGoogleAdsData } from '@/lib/google-ads'

export async function POST() {
  const authResult = await requireDashboardBusiness()
  if (authResult instanceof NextResponse) return authResult
  const { business } = authResult

  if (!business.googleAdsEnabled) {
    return NextResponse.json({ error: 'Feature not available' }, { status: 403 })
  }

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
