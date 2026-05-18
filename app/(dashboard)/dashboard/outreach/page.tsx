import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { getBusinessForDashboard } from '@/lib/get-business-for-dashboard'
import { FeatureGate } from '@/app/components/FeatureGate'
import { OutreachClient } from './OutreachClient'

export default async function OutreachPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const user = await db.user.findUnique({
    where: { clerkId: userId },
    include: { business: true },
  })

  const { business } = await getBusinessForDashboard(userId, user?.business ?? null)
  if (!business) redirect('/onboarding')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Outreach</h1>
        <p className="text-gray-500 mt-1">Send email or SMS campaigns to your contacts</p>
      </div>

      <FeatureGate
        mode="locked"
        enabled={business.massMessagingEnabled}
        feature="Mass Outreach"
        valueProp="Send targeted email and SMS campaigns to your contact list"
        businessName={business.name}
      >
        <OutreachClient />
      </FeatureGate>
    </div>
  )
}
