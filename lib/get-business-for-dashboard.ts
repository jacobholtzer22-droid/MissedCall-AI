// ===========================================
// Get effective business for dashboard - supports admin "View as Client"
// ===========================================

import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import type { Business } from '@prisma/client'

const ADMIN_USER_ID = process.env.ADMIN_USER_ID

export interface DashboardBusinessResult {
  business: Business | null
  isAdminViewAs: boolean
}

/**
 * Returns the business to use for dashboard rendering.
 * If admin is viewing as a client (adminViewAs cookie set), returns that business.
 * Otherwise returns the user's business.
 */
export async function getBusinessForDashboard(
  userId: string,
  userBusiness: Business | null
): Promise<DashboardBusinessResult> {
  const cookieStore = await cookies()
  const viewAsId = cookieStore.get('adminViewAs')?.value

  if (viewAsId && userId === ADMIN_USER_ID) {
    const business = await db.business.findUnique({
      where: { id: viewAsId },
    })
    if (business) {
      return { business, isAdminViewAs: true }
    }
  }

  return { business: userBusiness, isAdminViewAs: false }
}
