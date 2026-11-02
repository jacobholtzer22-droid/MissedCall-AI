// ===========================================
// POST /api/portal/intake/finish: the client pressed Done (PORTAL_INTAKE_WIZARD)
// ===========================================
// The same finish as the intake link: stamps the questionnaire and writes one
// Ops HQ "Answers in" note when something changed. Sends nothing, starts nothing.

import { portalGuard } from '@/lib/ops/intake-wizard-server'
import { finishWizard } from '@/lib/ops/intake-wizard-routes'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const g = await portalGuard(request, 'finish')
  if ('response' in g) return g.response
  return finishWizard(g.client, 'portal', 'portal intake')
}
