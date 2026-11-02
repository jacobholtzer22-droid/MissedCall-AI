// ===========================================
// /intake/<token>: the client's own intake page (CLIENT_INTAKE_LINK)
// ===========================================
// Public (the middleware protects only /dashboard, /onboarding, /settings).
// Flag off: 404. A bad, expired, replaced or revoked token: one plain message,
// the same for every reason. The token is the only key; the engagement comes
// out of it, and the page shows only that client's answers and file names.

import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getClientIp, rateLimit } from '@/lib/rate-limit'
import { CLIENT_LINK_LIMITS, QUESTIONS, clientIntakeEnabled, publicView } from '@/lib/ops/client-intake'
import { resolveClientLink } from '@/lib/ops/client-intake-server'
import { ClientIntakeForm } from './ClientIntakeForm'
import { IntakeWizard } from './IntakeWizard'
import { portalIntakeWizardEnabled, wizardView } from '@/lib/ops/intake-wizard'
import { linkWizardClient } from '@/lib/ops/intake-wizard-server'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Your setup | Align and Acquire',
  robots: { index: false, follow: false },
  // The token is in the path: never send it on as a Referer.
  referrer: 'no-referrer' as const,
}

export default async function ClientIntakePage({ params }: { params: { token: string } }) {
  if (!clientIntakeEnabled()) notFound()
  const ip = getClientIp(new Request('http://local', { headers: headers() }))
  if (!rateLimit(`client-intake:page:${ip}`, CLIENT_LINK_LIMITS.read, 60_000).allowed) {
    return <Message title="One moment" body="Too many tries in a row. Wait a minute and reload this page." />
  }
  const client = await resolveClientLink(params.token)
  if (!client) {
    return <Message title="This link isn't working" body="It may have expired or been replaced. Text Jacob and he'll send you a new one." />
  }
  // PORTAL_INTAKE_WIZARD (off by default): the link lands on the same wizard as the portal.
  if (portalIntakeWizardEnabled()) {
    const w = await linkWizardClient(client)
    return <IntakeWizard apiBase={`/api/intake/${encodeURIComponent(params.token)}`} engagementId={client.id} initial={wizardView(w, process.env, 'link')} />
  }
  return <ClientIntakeForm token={params.token} engagementId={client.id} initial={publicView(client)} questions={QUESTIONS} />
}

function Message({ title, body }: { title: string; body: string }) {
  return (
    <main className="min-h-screen bg-gray-950 px-4 py-16 text-gray-100">
      <div className="mx-auto max-w-xl space-y-3">
        <p className="text-sm text-gray-400">Jacob, Align and Acquire</p>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-gray-300">{body}</p>
      </div>
    </main>
  )
}
