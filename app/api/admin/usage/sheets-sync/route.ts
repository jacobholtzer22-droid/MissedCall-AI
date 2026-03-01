// ===========================================
// GOOGLE SHEETS SYNC - Manual trigger
// ===========================================
// POST: Push usage data to Google Sheet (admin only)
// Query: ?date=YYYY-MM-DD (optional, defaults to yesterday)

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { syncUsageToGoogleSheets } from '@/lib/google-sheets-sync'
import { subDays } from 'date-fns'

const ADMIN_USER_ID = process.env.ADMIN_USER_ID

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId || userId !== ADMIN_USER_ID) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const url = new URL(request.url)
  const dateParam = url.searchParams.get('date')
  let date: Date
  if (dateParam) {
    date = new Date(dateParam)
    if (isNaN(date.getTime())) {
      return NextResponse.json(
        { error: 'Invalid date format. Use YYYY-MM-DD.' },
        { status: 400 }
      )
    }
  } else {
    date = subDays(new Date(), 1)
  }

  if (
    !process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ||
    !process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ||
    !process.env.GOOGLE_SHEET_ID
  ) {
    return NextResponse.json(
      {
        error:
          'Google Sheets not configured. Set GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY, and GOOGLE_SHEET_ID.',
      },
      { status: 500 }
    )
  }

  try {
    const result = await syncUsageToGoogleSheets(date)
    return NextResponse.json(result)
  } catch (error) {
    console.error('Sheets sync failed:', error)
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Sync failed',
      },
      { status: 500 }
    )
  }
}
