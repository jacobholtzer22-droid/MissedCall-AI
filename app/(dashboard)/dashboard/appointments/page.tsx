import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { getBusinessForDashboard } from '@/lib/get-business-for-dashboard'
import { FeatureGate } from '@/app/components/FeatureGate'
import { AppointmentsClient } from './AppointmentsClient'

export default async function AppointmentsPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const user = await db.user.findUnique({
    where: { clerkId: userId },
    include: { business: true },
  })

  const { business } = await getBusinessForDashboard(userId, user?.business ?? null)
  if (!business) redirect('/onboarding')

  const isLocked = !business.calendarEnabled
  const needsSetup = business.calendarEnabled && !business.googleCalendarConnected
  const isEnabled = business.calendarEnabled && business.googleCalendarConnected

  if (isLocked) {
    return (
      <FeatureGate
        mode="locked"
        enabled={false}
        feature="Scheduled Quotes"
        valueProp="Let customers book appointments directly from SMS conversations"
        businessName={business.name}
      >
        <AppointmentsClient />
      </FeatureGate>
    )
  }

  if (needsSetup) {
    return (
      <FeatureGate
        mode="needs-setup"
        enabled={false}
        feature="Scheduled Quotes"
        setupDescription="Connect Google Calendar to start accepting online bookings"
        setupLabel="Connect Google Calendar"
        setupHref={`/api/auth/google?businessId=${business.id}`}
      >
        <AppointmentsClient />
      </FeatureGate>
    )
  }

  // isEnabled — render normally, suppress TS warning
  void isEnabled
  return <AppointmentsClient />
}
