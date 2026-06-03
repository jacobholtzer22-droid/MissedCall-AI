import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { getBusinessForDashboard } from '@/lib/get-business-for-dashboard'
import { getBusinessFeatures } from '@/lib/business-features'
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

  // Visible to non-AI (screening) clients, and to AI clients that route known contacts
  // to voicemail. Everyone else has no voicemails recorded — send them home.
  const features = getBusinessFeatures(business)
  const canSeeVoicemails = !features.hasMissedCallAi || (business.knownContactVoicemailEnabled ?? false)
  if (!canSeeVoicemails) {
    redirect('/dashboard')
  }

  return <VoicemailsClient />
}
