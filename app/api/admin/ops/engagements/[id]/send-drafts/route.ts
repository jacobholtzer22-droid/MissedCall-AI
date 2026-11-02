// ===========================================
// POST /api/admin/ops/engagements/[id]/send-drafts: Jacob marks a draft sent (CLIENT_SEND_DRAFTS)
// ===========================================
// Body { kind: questionnaire | preview | live | questions (OPS_AUTOFLOW), key }. Sends nothing: Jacob sent the
// text himself. Writes the intake marker that hides the draft, a 'text' activity
// and lastContactedAt. 404 with the flag off.

import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/pipeline-server'
import { db } from '@/lib/db'
import { updateIntake } from '@/lib/ops/intake-server'
import { clientSendDraftsEnabled, markSent, type SendKind, type SendMarks } from '@/lib/ops/send-drafts'
import { autoflowEnabled } from '@/lib/ops/autoflow'
import { adsBillingInviteEnabled } from '@/lib/ops/ads-billing'

export const dynamic = 'force-dynamic'

const KINDS: SendKind[] = ['questionnaire', 'preview', 'live']
const LABEL: Record<SendKind, string> = { questionnaire: 'onboarding questionnaire', preview: 'website preview', live: "you're live", questions: 'build questions', ads_billing: 'Google Ads billing steps' }

export async function POST(request: Request, context: { params: { id: string } }) {
  if (!clientSendDraftsEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const denied = await requireAdmin()
  if (denied) return denied
  const id = context.params.id
  const body = (await request.json().catch(() => ({}))) as { kind?: unknown; key?: unknown }
  const kind = [...KINDS, ...(autoflowEnabled() ? (['questions'] as SendKind[]) : []), ...(adsBillingInviteEnabled() ? (['ads_billing'] as SendKind[]) : [])].find((k) => k === body.kind)
  const key = typeof body.key === 'string' ? body.key.slice(0, 500) : ''
  if (!kind || !key) return NextResponse.json({ error: 'kind and key are required' }, { status: 400 })
  const e = await db.engagement.findUnique({ where: { id }, select: { id: true } })
  if (!e) return NextResponse.json({ error: 'Engagement not found' }, { status: 404 })
  await updateIntake(id, (cur) => ({ ...cur, sendDrafts: markSent((cur as { sendDrafts?: SendMarks }).sendDrafts, kind, key) }) as typeof cur)
  const now = new Date()
  await db.$transaction([
    db.opsActivity.create({ data: { engagementId: id, kind: 'text', body: `Sent the ${LABEL[kind]} text (Jacob, marked in Ops HQ).` } }),
    db.engagement.update({ where: { id }, data: { lastContactedAt: now } }),
  ])
  return NextResponse.json({ ok: true })
}
