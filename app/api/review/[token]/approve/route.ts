// POST /api/review/[token]/approve (PREVIEW_FEEDBACK): the client says the preview
// looks good. Records it and moves the website step from send_preview or
// client_review to approved, waiting on Jacob for the merge. Never merges,
// dispatches or goes live; sends nothing.

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { publicReview, stepOnApprove, type IntakeWithPreview } from '@/lib/ops/preview-feedback'
import { reviewGuard } from '@/lib/ops/preview-feedback-server'
import { updateIntake } from '@/lib/ops/intake-server'

export const dynamic = 'force-dynamic'

export async function POST(request: Request, context: { params: { token: string } }) {
  const g = await reviewGuard(request, context.params.token, 'approve')
  if ('response' in g) return g.response
  const now = new Date()
  const already = Boolean(g.client.intake.previewFeedback?.approvedAt)
  const next = await updateIntake(g.client.id, (cur) => {
    const i = cur as IntakeWithPreview
    return { ...i, previewFeedback: { notes: {}, updatedAt: now.toISOString(), ...(i.previewFeedback ?? {}), approvedAt: i.previewFeedback?.approvedAt ?? now.toISOString() } }
  })
  if (!already) {
    const step = stepOnApprove(g.client.websiteStep)
    if (step && g.client.websiteId) {
      // Conditional: only from the step it was read at.
      await db.deliverable.updateMany({
        where: { id: g.client.websiteId, step: g.client.websiteStep },
        data: { step, stepUpdatedAt: now, waitingOn: 'jacob', waitingNote: 'Client approved the preview; the merge is your Push' },
      })
    }
    await db.opsActivity.create({
      data: { engagementId: g.client.id, kind: 'note', body: `Client approved the preview on the review page${g.client.previewUrl ? ` (${g.client.previewUrl})` : ''}.${step ? ' Website step: approved; merge it when you are ready.' : ''} Nothing was merged or published.` },
    })
  }
  return NextResponse.json({ ok: true, ...publicReview({ ...g.client, intake: next as IntakeWithPreview }) }, { headers: { 'Cache-Control': 'no-store' } })
}
