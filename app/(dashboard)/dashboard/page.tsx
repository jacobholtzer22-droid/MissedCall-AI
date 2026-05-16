import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { getBusinessForDashboard } from '@/lib/get-business-for-dashboard'
import { getBusinessFeatures } from '@/lib/business-features'
import { normalizePhoneNumber } from '@/lib/phone-utils'
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

  const bizFeatures = getBusinessFeatures(business)
  const features = {
    ...bizFeatures,
    googleAds: business.googleAdsEnabled ?? false,
  }

  // Fetch initial voicemails server-side for non-AI businesses (avoids client-side loading flash)
  type VoicemailRow = {
    conversationId: string
    callerPhone: string
    contactName: string | null
    recordingUrl: string | null
    voicemailTranscription: string | null
    createdAt: string
  }

  let initialVoicemails: VoicemailRow[] = []

  if (!features.hasMissedCallAi) {
    const vmConversations = await db.conversation.findMany({
      where: {
        businessId: business.id,
        recordingUrl: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        callerPhone: true,
        recordingUrl: true,
        voicemailTranscription: true,
        createdAt: true,
      },
    })

    const phones = vmConversations.map((v) => v.callerPhone)
    const contacts = phones.length > 0
      ? await db.contact.findMany({
          where: { businessId: business.id, phoneNumber: { in: phones } },
          select: { phoneNumber: true, name: true },
        })
      : []

    const contactNameByPhone = new Map<string, string>()
    for (const c of contacts) {
      if (c.name) contactNameByPhone.set(normalizePhoneNumber(c.phoneNumber), c.name)
    }

    initialVoicemails = vmConversations.map((v) => ({
      conversationId: v.id,
      callerPhone: v.callerPhone,
      contactName: contactNameByPhone.get(normalizePhoneNumber(v.callerPhone)) ?? null,
      recordingUrl: v.recordingUrl,
      voicemailTranscription: v.voicemailTranscription ?? null,
      createdAt: v.createdAt.toISOString(),
    }))
  }

  return <OverviewClient features={features} initialVoicemails={initialVoicemails} />
}
