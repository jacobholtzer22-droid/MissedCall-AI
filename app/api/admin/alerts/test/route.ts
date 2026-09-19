// ===========================================
// ADMIN: RAISE A TEST PLATFORM ALERT
// ===========================================
// POST /api/admin/alerts/test
// Admin only. Writes one PlatformAlert row of type "test" and sends the alert
// email, then reports what happened. Used after a deploy to prove the alert path
// works end to end. Each call uses a fresh dedupeKey, so a second test is never
// throttled by the first (the storm cap still applies).

import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { buildTestAlert, raisePlatformAlertAndReport } from '@/lib/platform-alert'

export const dynamic = 'force-dynamic'

const ADMIN_USER_ID = process.env.ADMIN_USER_ID

export async function POST() {
  const { userId } = await auth()
  if (!userId || userId !== ADMIN_USER_ID) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const nonce = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const result = await raisePlatformAlertAndReport(buildTestAlert({ nonce }))

  return NextResponse.json({
    ok: result.alertId !== null && result.emailed,
    alertId: result.alertId,
    emailed: result.emailed,
    skipped: result.skipped,
  })
}
