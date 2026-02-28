// ===========================================
// GOOGLE OAUTH - START FLOW
// ===========================================
// Redirects user to Google OAuth consent screen

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { getAuthUrl } from '@/lib/google-calendar'

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

    const authUrl = getAuthUrl(businessId)
    return NextResponse.redirect(authUrl)
  } catch (error) {
    console.error('Google OAuth start error:', error)
    return NextResponse.json({ error: 'OAuth failed' }, { status: 500 })
  }
}
