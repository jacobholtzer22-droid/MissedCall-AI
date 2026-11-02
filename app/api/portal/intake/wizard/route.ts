// ===========================================
// PATCH /api/portal/intake/wizard: plan, confirm, legal details or step (PORTAL_INTAKE_WIZARD)
// ===========================================
// One save at a time (lib/ops/intake-wizard.ts readWizardPatch). The client's
// own record only (portalGuard). A plan the client sets is stored as theirs and
// never changes the board.

import { portalGuard } from '@/lib/ops/intake-wizard-server'
import { saveWizard } from '@/lib/ops/intake-wizard-routes'

export const dynamic = 'force-dynamic'

export async function PATCH(request: Request) {
  const g = await portalGuard(request, 'save')
  if ('response' in g) return g.response
  return saveWizard(request, g.client, 'portal intake')
}
