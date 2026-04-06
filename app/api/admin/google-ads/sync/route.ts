// ===========================================
// ADMIN: SYNC GOOGLE ADS DATA
// ===========================================
// POST /api/admin/google-ads/sync
// Admin only. Syncs Google Ads campaign metrics for one or all businesses.
// Body: { businessId?: string }

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { syncGoogleAdsData, syncAllBusinessAds } from '@/lib/google-ads'

const ADMIN_USER_ID = process.env.ADMIN_USER_ID

export async function POST(request: NextRequest) {
  const { userId } = await auth()
  if (!userId || userId !== ADMIN_USER_ID) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const { businessId } = body as { businessId?: string }

    if (businessId) {
      const result = await syncGoogleAdsData(businessId)
      return NextResponse.json({
        synced: result.rowsSynced,
        errors: result.errors,
      })
    }

    const result = await syncAllBusinessAds()
    return NextResponse.json({
      synced: result.synced,
      errors: result.errors,
    })
  } catch (err) {
    console.error('[ADMIN GOOGLE ADS SYNC] Error:', err)
    return NextResponse.json(
      { error: 'Sync failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
