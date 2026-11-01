// POST /api/review/[token]/submit (PREVIEW_FEEDBACK): the client sends their notes.
// The notes become a DRAFTED site_update instruction (a fixed template), posted in
// the HQ chat for Jacob's "go". Nothing runs, nothing merges, nothing is sent.

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { draftMessage, publicReview, reviewPages, submitNotes, type IntakeWithPreview } from '@/lib/ops/preview-feedback'
import { reviewGuard } from '@/lib/ops/preview-feedback-server'
import { updateIntake } from '@/lib/ops/intake-server'

export const dynamic = 'force-dynamic'

export async function POST(request: Request, context: { params: { token: string } }) {
  const g = await reviewGuard(request, context.params.token, 'submit')
  if ('response' in g) return g.response
  const name = g.client.displayName.trim()
  let draft: string | null = null
  const next = await updateIntake(g.client.id, (cur) => {
    const r = submitNotes(cur as IntakeWithPreview, name, reviewPages(cur))
    draft = r.draft
    return r.intake
  })
  const intake = next as IntakeWithPreview
  if (!Object.values(intake.previewFeedback?.notes ?? {}).some((v) => v.trim())) {
    return NextResponse.json({ error: 'Add a note on any page, or press "Looks good, no changes".' }, { status: 400 })
  }
  if (draft) {
    await db.opsMessage.create({ data: { role: 'chief', body: draftMessage(name, draft) } })
    await db.opsActivity.create({ data: { engagementId: g.client.id, kind: 'note', body: 'Client sent preview notes from the review page. A site_update is drafted in the HQ chat, waiting for your go. Nothing has run.' } })
  }
  return NextResponse.json({ ok: true, ...publicReview({ ...g.client, intake }) }, { headers: { 'Cache-Control': 'no-store' } })
}
