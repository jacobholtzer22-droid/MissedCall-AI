import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { getBusinessForDashboard } from '@/lib/get-business-for-dashboard'
import { FeatureGate } from '@/app/components/FeatureGate'
import { ConversationsClient } from './ConversationsClient'

export default async function ConversationsPage({
  searchParams,
}: {
  searchParams?: { selected?: string }
}) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const user = await db.user.findUnique({
    where: { clerkId: userId },
    include: { business: true },
  })

  const { business } = await getBusinessForDashboard(userId, user?.business ?? null)
  if (!business) redirect('/onboarding')

  // Optional thread to pre-select when arriving from a Leads-list row.
  const selected = typeof searchParams?.selected === 'string' ? searchParams.selected : null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Conversations</h1>
        <p className="text-gray-500 mt-1">AI-powered SMS conversations with your callers</p>
      </div>

      <FeatureGate
        mode="locked"
        enabled={business.missedCallAiEnabled !== false}
        feature="AI Conversations"
        valueProp="See every conversation your AI is having with your customers, in real time"
        businessName={business.name}
      >
        <ConversationsClient selectConversationId={selected} />
      </FeatureGate>
    </div>
  )
}
