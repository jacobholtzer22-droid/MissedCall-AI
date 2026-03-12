// ===========================================
// DASHBOARD API AUTH - Get business for authenticated user
// ===========================================
// Use in dashboard API routes to scope data to the user's business.

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getBusinessForDashboard } from '@/lib/get-business-for-dashboard'

export type DashboardAuthResult =
  | { business: NonNullable<Awaited<ReturnType<typeof getBusinessForDashboard>>['business']> }
  | NextResponse

export async function requireDashboardBusiness(): Promise<DashboardAuthResult> {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({
    where: { clerkId: userId },
    include: { business: true },
  })

  const { business } = await getBusinessForDashboard(userId, user?.business ?? null)
  if (!business) return NextResponse.json({ error: 'No business found' }, { status: 404 })

  return { business }
}
