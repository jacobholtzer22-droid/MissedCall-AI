import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { getBusinessForDashboard } from '@/lib/get-business-for-dashboard'
import { db } from '@/lib/db'
import { BlockedCallsClient } from './BlockedCallsClient'

export default async function BlockedCallsPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const user = await db.user.findUnique({
    where: { clerkId: userId },
    include: { business: true },
  })

  const { business } = await getBusinessForDashboard(userId, user?.business ?? null)
  if (!business) redirect('/onboarding')

  if (business.missedCallAiEnabled !== false) {
    redirect('/dashboard')
  }

  return <BlockedCallsClient />
}
