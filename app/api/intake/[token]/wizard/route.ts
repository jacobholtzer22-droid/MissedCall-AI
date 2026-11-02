// ===========================================
// PATCH /api/intake/[token]/wizard: the link's wizard saves (CLIENT_INTAKE_LINK + PORTAL_INTAKE_WIZARD)
// ===========================================
// The signed link lands on the same wizard as the portal. Same gate as every
// link route (flag, per-IP limit, signed current token); 404 unless the wizard
// flag is on too.

import { NextResponse } from 'next/server'
import { guard } from '@/lib/ops/client-intake-server'
import { saveWizard } from '@/lib/ops/intake-wizard-routes'
import { portalIntakeWizardEnabled, type IntakeWithWizard } from '@/lib/ops/intake-wizard'

export const dynamic = 'force-dynamic'

export async function PATCH(request: Request, context: { params: { token: string } }) {
  if (!portalIntakeWizardEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const g = await guard(request, context.params.token, 'save')
  if ('response' in g) return g.response
  return saveWizard(request, { ...g.client, intake: g.client.intake as IntakeWithWizard }, 'intake link')
}
