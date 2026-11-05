// ===========================================
// POST /api/intake/[token]/finish: the client pressed Done (CLIENT_INTAKE_LINK)
// ===========================================
// Stamps the questionnaire finished and writes one Ops HQ note ("Answers in")
// on the client, only when something changed since the last Done. Sends
// nothing to anyone and starts nothing: the chief maps the answers and writes
// the brief only when Jacob asks, and the brief still waits for his OK.

import { NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { autoflowEnabled } from '@/lib/ops/autoflow'
import { db } from '@/lib/db'
import { finishIntake, publicView, type IntakeWithLink } from '@/lib/ops/client-intake'
import { guard } from '@/lib/ops/client-intake-server'
import { sendIntakeDoneAlert } from '@/lib/ops/intake-done-alert'
import { updateIntake } from '@/lib/ops/intake-server'
import { portalIntakeWizardEnabled, type IntakeWithWizard } from '@/lib/ops/intake-wizard'
import { wizardFinishNote } from '@/lib/ops/intake-wizard-routes'

export const dynamic = 'force-dynamic'

export async function POST(request: Request, context: { params: { token: string } }) {
  const g = await guard(request, context.params.token, 'finish')
  if ('response' in g) return g.response
  try {
    let note: string | null = null
    const next = await updateIntake(g.client.id, (cur) => {
      const r = finishIntake(cur as IntakeWithLink)
      // PORTAL_INTAKE_WIZARD (off by default): the note also names the plan and the legal details.
      note = r.note && portalIntakeWizardEnabled() ? wizardFinishNote(r.note, r.intake as IntakeWithWizard, 'link') : r.note
      return r.intake
    })
    if (note) await db.opsActivity.create({ data: { engagementId: g.client.id, kind: 'note', body: note } })
    // Jacob's "intake done" text and email, once per Done that changed something. Never on the response path.
    if (note) waitUntil(sendIntakeDoneAlert(g.client.id, 'link'))
    // OPS_AUTOFLOW (off by default): a ready intake gets a brief DRAFT for Jacob's OK. Sends nothing.
    if (autoflowEnabled()) {
      const id = g.client.id
      waitUntil(import('@/lib/ops/hq/chief').then((m) => m.autoDraftBrief(id, 'intake_link_done')))
    }
    return NextResponse.json({ ok: true, ...publicView({ ...g.client, intake: next as IntakeWithLink }) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('[intake link] finish failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Could not save. Try again.' }, { status: 500 })
  }
}
