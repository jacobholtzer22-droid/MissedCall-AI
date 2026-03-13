import { redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { getBusinessForDashboard } from '@/lib/get-business-for-dashboard'
// CRM nav items — shown for all businesses (AI-enabled and spam-screening-only)
const CRM_NAV = [
  { name: 'Contacts', href: '/dashboard/contacts', icon: 'Users' },
  { name: 'Jobs', href: '/dashboard/jobs', icon: 'Briefcase' },
  { name: 'Emails', href: '/dashboard/emails', icon: 'Mailbox' },
]

function getNavigation(missedCallAiEnabled: boolean) {
  const spamOnly = missedCallAiEnabled === false
  const items = spamOnly
    ? [
        { name: 'Overview', href: '/dashboard', icon: 'LayoutDashboard' },
        { name: 'Messages', href: '/dashboard/messages', icon: 'MessageCircle' },
        { name: 'Analytics', href: '/dashboard/analytics', icon: 'BarChart3' },
        { name: 'Blocked Calls', href: '/dashboard/blocked-calls', icon: 'PhoneOff' },
        { name: 'Voicemails', href: '/dashboard/voicemails', icon: 'Mail' },
        ...CRM_NAV,
        { name: 'Settings', href: '/dashboard/settings', icon: 'Settings' },
      ]
    : [
        { name: 'Overview', href: '/dashboard', icon: 'LayoutDashboard' },
        { name: 'Messages', href: '/dashboard/messages', icon: 'MessageCircle' },
        { name: 'Analytics', href: '/dashboard/analytics', icon: 'BarChart3' },
        { name: 'Scheduled Quotes', href: '/dashboard/appointments', icon: 'Calendar' },
        ...CRM_NAV,
        { name: 'Settings', href: '/dashboard/settings', icon: 'Settings' },
      ]
  return items as { name: string; href: string; icon: string }[]
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

  const navigation = getNavigation(business.missedCallAiEnabled ?? true)
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
