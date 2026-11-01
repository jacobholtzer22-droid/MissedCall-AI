// POST /api/review/[token]/approve (PREVIEW_FEEDBACK): the client says the preview
// looks good. Records it and moves the website step from send_preview or
// client_review to approved, waiting on Jacob for the merge. Never merges,
// dispatches or goes live; sends nothing.

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { publicReview, type IntakeWithPreview } from '@/lib/ops/preview-feedback'
import { reviewGuard } from '@/lib/ops/preview-feedback-server'
import { onLooksGood } from '@/lib/ops/pr-state'
import { prStatesFor } from '@/lib/ops/pr-state-server'
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
    // The step moves to approved only when the recorded PR is merged; an open or
    // unrecorded PR keeps the step and asks Jacob to merge first (lib/ops/pr-state.ts).
    const pr = (await prStatesFor([g.client.id])).get(g.client.id) ?? { state: 'unknown' as const }
    const move = onLooksGood(g.client.websiteStep, pr)
    if (g.client.websiteId && move) {
      // Conditional: only from the step it was read at.
      await db.deliverable.updateMany({
        where: { id: g.client.websiteId, step: g.client.websiteStep },
        data: move.step
          ? { step: move.step, stepUpdatedAt: now, waitingOn: 'jacob', waitingNote: move.waitingNote }
          : { waitingOn: 'jacob', waitingNote: move.waitingNote },
      })
    }
    await db.opsActivity.create({
      data: {
        engagementId: g.client.id,
        kind: 'note',
        body: `Client approved the preview on the review page${g.client.previewUrl ? ` (${g.client.previewUrl})` : ''}.${move ? (move.step ? ' Website step: approved.' : ` ${move.waitingNote}.`) : ''} Nothing was merged or published.`,
      },
    })
  }
  return NextResponse.json({ ok: true, ...publicReview({ ...g.client, intake: next as IntakeWithPreview }) }, { headers: { 'Cache-Control': 'no-store' } })
}
