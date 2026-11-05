// The wizard's save and finish, shared by the portal routes and the intake link
// routes. The caller has already decided whose record it is.

import { NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { db } from '@/lib/db'
import { sendIntakeDoneAlert } from '@/lib/ops/intake-done-alert'
import { finishIntake } from '@/lib/ops/client-intake'
import { updateIntake } from '@/lib/ops/intake-server'
import { WizardError, applyWizardPatch, readWizardPatch, wizardFinishNote, wizardView, type IntakeWithWizard } from '@/lib/ops/intake-wizard'

export { wizardFinishNote }
import { adsBillingInviteEnabled } from '@/lib/ops/ads-billing'
import { syncAdvertiserLegal } from '@/lib/ops/ads-billing-server'

type Client = { id: string; displayName: string; contactName: string | null; intake: IntakeWithWizard }

const noStore = { 'Cache-Control': 'no-store' }

export async function saveWizard(request: Request, client: Client, label: string, door: 'portal' | 'link' = 'portal'): Promise<NextResponse> {
  try {
    const text = await request.text()
    if (text.length > 20_000) throw new WizardError('that is too much for one save')
    const patch = readWizardPatch(JSON.parse(text || '{}'))
    const next = await updateIntake(client.id, (cur) => applyWizardPatch(cur as IntakeWithWizard, patch))
    // ADS_BILLING_INVITE (off by default): the legal details go to the ads deliverable for advertiser verification.
    if (patch.kind === 'legal' && adsBillingInviteEnabled()) await syncAdvertiserLegal(client.id, (next as IntakeWithWizard).legal).catch(() => undefined)
    return NextResponse.json({ ok: true, view: wizardView({ ...client, intake: next as IntakeWithWizard }, process.env, door) }, { headers: noStore })
  } catch (err) {
    if (err instanceof WizardError || err instanceof SyntaxError) return NextResponse.json({ error: err.message }, { status: 400 })
    console.error(`[${label}] wizard save failed:`, err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Could not save. Try again.' }, { status: 500 })
  }
}

export async function finishWizard(client: Client, via: 'portal' | 'link', label: string): Promise<NextResponse> {
  try {
    let note: string | null = null
    const next = await updateIntake(client.id, (cur) => {
      const r = finishIntake(cur as IntakeWithWizard)
      note = r.note ? wizardFinishNote(r.note, r.intake as IntakeWithWizard, via) : null
      return r.intake
    })
    if (note) await db.opsActivity.create({ data: { engagementId: client.id, kind: 'note', body: note } })
    // Jacob's "intake done" text and email, once per Done that changed something. Never on the response path.
    if (note) waitUntil(sendIntakeDoneAlert(client.id, via))
    return NextResponse.json({ ok: true, view: wizardView({ ...client, intake: next as IntakeWithWizard }, process.env, via) }, { headers: noStore })
  } catch (err) {
    console.error(`[${label}] finish failed:`, err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Could not save. Try again.' }, { status: 500 })
  }
}
