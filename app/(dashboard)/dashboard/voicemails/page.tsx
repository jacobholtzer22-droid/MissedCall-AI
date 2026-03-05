import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { getBusinessForDashboard } from '@/lib/get-business-for-dashboard'
import { db } from '@/lib/db'
import { VoicemailsClient } from './VoicemailsClient'

export default async function VoicemailsPage() {
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

  return <VoicemailsClient />
}
