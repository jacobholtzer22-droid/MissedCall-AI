import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { getBusinessForDashboard } from '@/lib/get-business-for-dashboard'
import { FeatureGate } from '@/app/components/FeatureGate'
import { AdsClient } from './AdsClient'

export default async function AdsPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const user = await db.user.findUnique({
    where: { clerkId: userId },
    include: { business: true },
  })

  const { business } = await getBusinessForDashboard(userId, user?.business ?? null)
  if (!business) redirect('/onboarding')

  return (
    <FeatureGate
      mode="locked"
      enabled={business.googleAdsEnabled}
      feature="Google Ads"
      valueProp="See your Google Ads performance and ROI alongside your leads"
      businessName={business.name}
    >
      <AdsClient />
    </FeatureGate>
  )
}
