// ===========================================
// ADMIN USAGE SYNC - Fetch MDR/CDR from Telnyx and store
// ===========================================
// POST or GET: Trigger sync (admin only, or cron with CRON_SECRET)
// Query: ?dateRange=yesterday | last_7_days | last_30_days | last_90_days (default: last_90_days for manual, yesterday for cron)

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { syncTelnyxUsage } from '@/lib/telnyx-usage-sync'

const ADMIN_USER_ID = process.env.ADMIN_USER_ID
const CRON_SECRET = process.env.CRON_SECRET

async function handleSync(request: Request) {
  const url = new URL(request.url)
  const authHeader = request.headers.get('authorization')
  const isCron = CRON_SECRET && authHeader === `Bearer ${CRON_SECRET}`
  const dateRange =
    url.searchParams.get('dateRange') || (isCron ? 'yesterday' : 'last_90_days')

  if (!isCron) {
    const { userId } = await auth()
    if (!userId || userId !== ADMIN_USER_ID) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }
  }

  if (!process.env.TELNYX_API_KEY) {
    return NextResponse.json(
      { error: 'TELNYX_API_KEY is not configured' },
      { status: 500 }
    )
  }

  try {
    const result = await syncTelnyxUsage(dateRange)
    return NextResponse.json({
      ok: true,
      ...result,
    })
  } catch (error) {
    console.error('Usage sync failed:', error)
    return NextResponse.json(
      { error: 'Sync failed', detail: String(error) },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  return handleSync(request)
}

export async function GET(request: Request) {
  return handleSync(request)
}
