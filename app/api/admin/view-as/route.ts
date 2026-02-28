// ===========================================
// ADMIN VIEW-AS - Set/clear cookie for viewing as client
// ===========================================
// GET ?businessId=xxx → set cookie, redirect to /dashboard
// GET ?exit=1 → clear cookie, redirect to /admin

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'

const ADMIN_USER_ID = process.env.ADMIN_USER_ID

export async function GET(request: NextRequest) {
  const { userId } = await auth()
  if (!userId || userId !== ADMIN_USER_ID) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  const { searchParams } = new URL(request.url)
  const businessId = searchParams.get('businessId')
  const exit = searchParams.get('exit')

  const response = exit === '1'
    ? NextResponse.redirect(new URL('/admin', request.url))
    : NextResponse.redirect(new URL('/dashboard', request.url))

  if (exit === '1') {
    response.cookies.delete('adminViewAs')
    return response
  }

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
