import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { getBusinessForDashboard } from '@/lib/get-business-for-dashboard'
import { OverviewClient } from './OverviewClient'

export default async function DashboardPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const user = await db.user.findUnique({
    where: { clerkId: userId },
    include: { business: true }
  })

  const { business } = await getBusinessForDashboard(userId, user?.business ?? null)
  if (!business) redirect('/onboarding')

  const features = {
    missedCallAi: business.missedCallAiEnabled ?? true,
    spamScreening: business.callScreenerEnabled ?? false,
    spamFilter: business.spamFilterEnabled ?? false,
    calendar: business.calendarEnabled ?? false,
    googleAds: business.googleAdsEnabled ?? false,
  }

  return <OverviewClient features={features} />
}
