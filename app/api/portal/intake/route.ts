// ===========================================
// PATCH /api/portal/intake: the signed-in client's answers (PORTAL_INTAKE_WIZARD)
// ===========================================
// { answers: { "<n>": "<text>" } }, a partial save; "" clears one. The same
// validation and row-locked write as the intake link. portalGuard is the gate:
// flag, signed in, rate limit, then the user's own record (never one named in
// the request).

import { NextResponse } from 'next/server'
import { AnswerError, applyAnswers, readAnswerPatch } from '@/lib/ops/client-intake'
import { portalGuard } from '@/lib/ops/intake-wizard-server'
import { updateIntake } from '@/lib/ops/intake-server'
import { wizardView, type IntakeWithWizard } from '@/lib/ops/intake-wizard'

export const dynamic = 'force-dynamic'

export async function PATCH(request: Request) {
  const g = await portalGuard(request, 'save')
  if ('response' in g) return g.response
  try {
    const text = await request.text()
    if (text.length > 150_000) throw new AnswerError('that is too much text for one save')
    const patch = readAnswerPatch(JSON.parse(text || '{}'))
    const next = await updateIntake(g.client.id, (cur) => applyAnswers(cur as IntakeWithWizard, patch))
    return NextResponse.json({ ok: true, view: wizardView({ ...g.client, intake: next as IntakeWithWizard }) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    if (err instanceof AnswerError || err instanceof SyntaxError) return NextResponse.json({ error: err.message }, { status: 400 })
    console.error('[portal intake] save failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Could not save. Try again.' }, { status: 500 })
  }
}
