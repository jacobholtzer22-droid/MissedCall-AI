import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { getBusinessForDashboard } from '@/lib/get-business-for-dashboard'
import { getBusinessFeatures } from '@/lib/business-features'
import { db } from '@/lib/db'
import { FeatureGate } from '@/app/components/FeatureGate'
import { BlockedCallsClient } from './BlockedCallsClient'

export default async function ScreenedCallsPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const user = await db.user.findUnique({
    where: { clerkId: userId },
    include: { business: true },
  })

  const { business } = await getBusinessForDashboard(userId, user?.business ?? null)
  if (!business) redirect('/onboarding')

  const features = getBusinessFeatures(business)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Screened Calls</h1>
        <p className="text-gray-500 mt-1">Blocked and passed calls from your screener — last 30 days</p>
      </div>

      <FeatureGate
        mode="locked"
        enabled={features.hasAnyScreening}
        feature="Call Screening"
        valueProp="Add spam call screening to see every call your screener blocked or passed."
        businessName={business.name}
      >
        <BlockedCallsClient />
      </FeatureGate>
    </div>
  )
}
