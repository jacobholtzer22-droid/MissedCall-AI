// ===========================================
// POST /api/intake/[token]/finish: the client pressed Done (CLIENT_INTAKE_LINK)
// ===========================================
// Stamps the questionnaire finished and writes one Ops HQ note ("Answers in")
// on the client, only when something changed since the last Done. Sends
// nothing to anyone and starts nothing: the chief maps the answers and writes
// the brief only when Jacob asks, and the brief still waits for his OK.

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { finishIntake, publicView, type IntakeWithLink } from '@/lib/ops/client-intake'
import { guard } from '@/lib/ops/client-intake-server'
import { updateIntake } from '@/lib/ops/intake-server'

export const dynamic = 'force-dynamic'

export async function POST(request: Request, context: { params: { token: string } }) {
  const g = await guard(request, context.params.token, 'finish')
  if ('response' in g) return g.response
  try {
    let note: string | null = null
    const next = await updateIntake(g.client.id, (cur) => {
      const r = finishIntake(cur as IntakeWithLink)
      note = r.note
      return r.intake
    })
    if (note) await db.opsActivity.create({ data: { engagementId: g.client.id, kind: 'note', body: note } })
    return NextResponse.json({ ok: true, ...publicView({ ...g.client, intake: next as IntakeWithLink }) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('[intake link] finish failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Could not save. Try again.' }, { status: 500 })
  }
}
