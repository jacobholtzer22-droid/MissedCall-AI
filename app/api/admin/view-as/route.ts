// ===========================================
// ADMIN VIEW-AS - Set/clear cookie for viewing as client
// ===========================================
// GET ?businessId=xxx → set cookie, redirect to /dashboard
// GET ?exit=1 → clear cookie, redirect to /admin (default) or, with
//               &next=dashboard, to /dashboard. Any other `next` falls back to admin.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'

const ADMIN_USER_ID = process.env.ADMIN_USER_ID

// Allowlisted exit destinations. Anything not in this map redirects to /admin.
const EXIT_TARGETS: Record<string, string> = {
  admin: '/admin',
  dashboard: '/dashboard',
}

export async function GET(request: NextRequest) {
  const { userId } = await auth()
  if (!userId || userId !== ADMIN_USER_ID) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  const { searchParams } = new URL(request.url)
  const businessId = searchParams.get('businessId')
  const exit = searchParams.get('exit')

  if (exit === '1') {
    const next = searchParams.get('next') ?? 'admin'
    const target = EXIT_TARGETS[next] ?? EXIT_TARGETS.admin
    const response = NextResponse.redirect(new URL(target, request.url))
    response.cookies.delete('adminViewAs')
    return response
  }

  const response = NextResponse.redirect(new URL('/dashboard', request.url))

  if (businessId) {
    const business = await db.business.findUnique({
      where: { id: businessId },
      select: { id: true },
    })
    if (business) {
      response.cookies.set('adminViewAs', businessId, {
        path: '/',
        maxAge: 60 * 60 * 24, // 24 hours
        sameSite: 'lax',
      })
    }
  }

  return response
}
