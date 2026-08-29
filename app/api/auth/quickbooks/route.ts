// ===========================================
// QUICKBOOKS OAUTH - START FLOW
// ===========================================
// Redirects the user to Intuit's consent screen.
//
// Mirrors app/api/auth/google/route.ts, including the admin-or-owner check, with
// one difference: the `state` this hands to Intuit is signed (see getQbAuthUrl).
// That Clerk check is currently the only thing bounding how long a leaked state
// stays useful — the signature itself carries no expiry.

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { getQbAuthUrl, isQbNotConfiguredError } from '@/lib/quickbooks'

const ADMIN_USER_ID = process.env.ADMIN_USER_ID

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.redirect(new URL('/sign-in', request.url))
    }

    const searchParams = request.nextUrl.searchParams
    const businessId = searchParams.get('businessId')

    if (!businessId) {
      return NextResponse.json({ error: 'Missing businessId' }, { status: 400 })
    }

    // Verify user has access: either owns the business or is admin
    const user = await db.user.findUnique({
      where: { clerkId: userId },
      include: { business: true },
    })

    const isAdmin = userId === ADMIN_USER_ID
    const ownsBusiness = user?.businessId === businessId

    if (!isAdmin && !ownsBusiness) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const authUrl = getQbAuthUrl(businessId)
    return NextResponse.redirect(authUrl)
  } catch (error) {
    // A missing QUICKBOOKS_ env var is a setup problem, not a crash. Same
    // treatment as the callback: explain it instead of returning a 500.
    if (isQbNotConfiguredError(error)) {
      console.error('[QUICKBOOKS] OAuth start blocked — integration not configured:', error)
      return NextResponse.redirect(new URL('/dashboard/settings?qb_error=not_configured', request.url))
    }
    console.error('[QUICKBOOKS] OAuth start error:', error)
    return NextResponse.json({ error: 'OAuth failed' }, { status: 500 })
  }
}
