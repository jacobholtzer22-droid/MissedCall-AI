import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { getBusinessForDashboard } from '@/lib/get-business-for-dashboard'
import { LeadsClient } from './LeadsClient'

export default async function LeadsPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const user = await db.user.findUnique({
    where: { clerkId: userId },
    include: { business: true },
  })

  const { business } = await getBusinessForDashboard(userId, user?.business ?? null)
  if (!business) redirect('/onboarding')

  // Ungated: website leads exist for every client. When MissedCall AI is off,
  // /api/dashboard/conversations returns 403 and CombinedLeadsList treats that
  // as "no AI leads" rather than an error.
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Leads</h1>
        <p className="text-gray-500 mt-1">Missed call and website leads in one place</p>
      </div>

      <LeadsClient />
    </div>
  )
}
