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
    knownContactVoicemailEnabled: business.knownContactVoicemailEnabled ?? false,
  }

  // Voicemails are visible to non-AI (screening) clients, and to AI clients that route
  // known contacts to voicemail. Same recordingUrl data either way.
  const showVoicemails = !features.hasMissedCallAi || features.knownContactVoicemailEnabled

  // ── Recent voicemails (latest 5, NOT period-scoped) — for the inline player section ──
  type VoicemailRow = {
    conversationId: string
    callerPhone: string
    contactName: string | null
    recordingUrl: string | null
    voicemailTranscription: string | null
    createdAt: string
  }

  type CallLogItem = {
    id: string
    kind: 'call' | 'lead'
    phone: string | null
    name: string | null
    result: string | null // 'blocked' | 'passed' for inbound calls
    description: string | null
    createdAt: string
  }

  // Resolve contact names for a set of phone numbers in one query.
  async function namesForPhones(phones: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>()
    if (phones.length === 0) return map
    const contacts = await db.contact.findMany({
      where: { businessId: business!.id, phoneNumber: { in: phones } },
      select: { phoneNumber: true, name: true },
    })
    for (const c of contacts) {
      if (c.name) map.set(normalizePhoneNumber(c.phoneNumber), c.name)
    }
    return map
  }

  let initialVoicemails: VoicemailRow[] = []

  if (showVoicemails) {
    const vmConversations = await db.conversation.findMany({
      where: { businessId: business.id, recordingUrl: { not: null } },
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

    const nameByPhone = await namesForPhones(vmConversations.map((v) => v.callerPhone))

    initialVoicemails = vmConversations.map((v) => ({
      conversationId: v.id,
      callerPhone: v.callerPhone,
      contactName: nameByPhone.get(normalizePhoneNumber(v.callerPhone)) ?? null,
      recordingUrl: v.recordingUrl,
      voicemailTranscription: v.voicemailTranscription ?? null,
      createdAt: v.createdAt.toISOString(),
    }))
  }

  // ── Call log (latest ~15, NOT period-scoped) — inbound screened calls + missed-call leads ──
  const [screenedForLog, missedCallActivities] = await Promise.all([
    db.screenedCall.findMany({
      where: { businessId: business.id },
      orderBy: { createdAt: 'desc' },
      take: 15,
      select: { id: true, callerPhone: true, result: true, createdAt: true },
    }),
    db.activity.findMany({
      where: { businessId: business.id, type: 'missed_call' },
      orderBy: { createdAt: 'desc' },
      take: 15,
      include: { contact: { select: { name: true, phoneNumber: true } } },
    }),
  ])

  const callLog: CallLogItem[] = [
    ...screenedForLog.map((s) => ({
      id: `call_${s.id}`,
      kind: 'call' as const,
      phone: s.callerPhone,
      name: null,
      result: s.result,
      description: null,
      createdAt: s.createdAt.toISOString(),
    })),
    ...missedCallActivities.map((a) => ({
      id: `lead_${a.id}`,
      kind: 'lead' as const,
      phone: a.contact?.phoneNumber ?? null,
      name: a.contact?.name ?? null,
      result: null,
      description: a.description,
      createdAt: a.createdAt.toISOString(),
    })),
  ]
    .sort((x, y) => new Date(y.createdAt).getTime() - new Date(x.createdAt).getTime())
    .slice(0, 15)

  return (
    <OverviewClient
      features={features}
      initialVoicemails={initialVoicemails}
      callLog={callLog}
    />
  )
}
