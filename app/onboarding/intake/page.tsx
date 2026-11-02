// ===========================================
// /onboarding/intake: the intake wizard right after sign-up (PORTAL_INTAKE_WIZARD)
// ===========================================
// Clerk-protected by the existing middleware rule for /onboarding(.*). Flag off:
// 404, and app/onboarding sends a new signup to /dashboard as before. The record
// is the signed-in user's own (lib/ops/intake-wizard-server.ts portalClientFor);
// a user without a Business goes back to /onboarding to create one first.

import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { getClientIp } from '@/lib/rate-limit'
import { portalIntakeWizardEnabled, wizardView } from '@/lib/ops/intake-wizard'
import { portalClientFor, portalRateOk, verifiedEmailsOf } from '@/lib/ops/intake-wizard-server'
import { IntakeWizard } from '@/app/intake/[token]/IntakeWizard'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Your setup | Align and Acquire',
  robots: { index: false, follow: false },
}

export default async function PortalIntakePage() {
  if (!portalIntakeWizardEnabled()) notFound()
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')
  const ip = getClientIp(new Request('http://local', { headers: headers() }))
  if (!portalRateOk('page', userId, ip).allowed) {
    return (
      <main className="min-h-screen bg-gray-950 px-4 py-16 text-gray-100">
        <div className="mx-auto max-w-xl space-y-3">
          <h1 className="text-2xl font-semibold">One moment</h1>
          <p className="text-gray-300">Too many tries in a row. Wait a minute and reload this page.</p>
        </div>
      </main>
    )
  }
  const client = await portalClientFor(userId, await verifiedEmailsOf())
  if (!client) redirect('/onboarding')
  return <IntakeWizard apiBase="/api/portal/intake" engagementId={client.id} initial={wizardView(client)} dashboardHref="/dashboard" />
}
