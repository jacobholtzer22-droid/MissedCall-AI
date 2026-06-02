import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { getBusinessForDashboard } from '@/lib/get-business-for-dashboard'
import { FeatureGate } from '@/app/components/FeatureGate'
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Leads</h1>
        <p className="text-gray-500 mt-1">Missed call and website leads in one place</p>
      </div>

      {/* Same gate the underlying Conversations + Website Leads pages used (missedCallAiEnabled). */}
      <FeatureGate
        mode="locked"
        enabled={business.missedCallAiEnabled !== false}
        feature="Leads"
        valueProp="See every missed-call and website lead your AI captures, in one place"
        businessName={business.name}
      >
        <LeadsClient />
      </FeatureGate>
    </div>
  )
}
