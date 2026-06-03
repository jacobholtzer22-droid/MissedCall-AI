import { redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { getBusinessForDashboard } from '@/lib/get-business-for-dashboard'
import { getBusinessFeatures } from '@/lib/business-features'

function getNavigation(business: {
  missedCallAiEnabled?: boolean | null
  knownContactVoicemailEnabled?: boolean | null
  callScreenerEnabled?: boolean | null
  spamFilterEnabled?: boolean | null
  forwardingNumber?: string | null
  calendarEnabled?: boolean | null
  googleCalendarConnected?: boolean | null
  googleAdsEnabled?: boolean | null
  massMessagingEnabled?: boolean | null
}) {
  const features = getBusinessFeatures(business)
  const googleAdsLabel = (business as { googleAdsTabLabel?: string | null }).googleAdsTabLabel

  const items: { name: string; href: string; icon: string }[] = [
    { name: 'Overview', href: '/dashboard', icon: 'LayoutDashboard' },
    // Leads = combined closed missed-call leads + website leads.
    { name: 'Leads', href: '/dashboard/leads', icon: 'Mailbox' },
  ]

  // Conversations = full AI SMS thread viewer (its own page again).
  if (features.hasMissedCallAi) {
    items.push({ name: 'Conversations', href: '/dashboard/conversations', icon: 'MessagesSquare' })
  }

  items.push({ name: 'Outreach', href: '/dashboard/outreach', icon: 'Send' })
  items.push({ name: 'Analytics', href: '/dashboard/analytics', icon: 'BarChart3' })

  if (features.hasMissedCallAi) {
    items.push({ name: 'Scheduled Quotes', href: '/dashboard/appointments', icon: 'Calendar' })
  }

  // Screening-only (non-AI) clients: show Voicemails
  if (!features.hasMissedCallAi) {
    items.push({ name: 'Voicemails', href: '/dashboard/voicemails', icon: 'Mail' })
  } else if (business.knownContactVoicemailEnabled) {
    // AI clients with known-contact voicemail routing on: their only recorded voicemails
    // come from known contacts, so label it accordingly.
    items.push({ name: 'Voicemails from Contacts', href: '/dashboard/voicemails', icon: 'Mail' })
  }

  // Any client with screening on (spam filter or IVR screener) sees their screened calls
  if (features.hasAnyScreening) {
    items.push({ name: 'Screened Calls', href: '/dashboard/blocked-calls', icon: 'PhoneOff' })
  }

  items.push(
    { name: 'Contacts', href: '/dashboard/contacts', icon: 'Users' },
    { name: 'Jobs', href: '/dashboard/jobs', icon: 'Briefcase' },
  )

  if (business.googleAdsEnabled) {
    items.push({ name: googleAdsLabel || 'Google Ads', href: '/dashboard/ads', icon: 'Megaphone' })
  }

  items.push({ name: 'Settings', href: '/dashboard/settings', icon: 'Settings' })

  return items
}

import { DashboardShellClient } from './DashboardShellClient'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth()

  if (!userId) {
    redirect('/sign-in')
  }

  const user = await db.user.findUnique({
    where: { clerkId: userId },
    include: { business: true }
  })

  const { business, isAdminViewAs } = await getBusinessForDashboard(userId, user?.business ?? null)

  if (!business) {
    redirect('/onboarding')
  }

  const navigation = getNavigation(business)
  const userLabel = user?.firstName || user?.email || 'Admin'

  return (
    <DashboardShellClient
      navigation={navigation}
      businessName={business.name}
      isAdminViewAs={isAdminViewAs}
      userLabel={userLabel}
    >
      {children}
    </DashboardShellClient>
  )
}
