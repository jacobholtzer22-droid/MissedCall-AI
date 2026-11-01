// /api/review/[token] (PREVIEW_FEEDBACK): GET what the page shows, PATCH { notes } autosave.
// Public by the middleware's existing rules; reviewGuard is the gate.

import { NextResponse } from 'next/server'
import { NotesError, applyNotes, publicReview, readNotesPatch, reviewPages, type IntakeWithPreview } from '@/lib/ops/preview-feedback'
import { reviewGuard } from '@/lib/ops/preview-feedback-server'
import { updateIntake } from '@/lib/ops/intake-server'

export const dynamic = 'force-dynamic'
const noStore = { 'Cache-Control': 'no-store' }

export async function GET(request: Request, context: { params: { token: string } }) {
  const g = await reviewGuard(request, context.params.token, 'read')
  if ('response' in g) return g.response
  return NextResponse.json(publicReview(g.client), { headers: noStore })
}

export async function PATCH(request: Request, context: { params: { token: string } }) {
  const g = await reviewGuard(request, context.params.token, 'save')
  if ('response' in g) return g.response
  try {
    const text = await request.text()
    if (text.length > 100_000) throw new NotesError('that is too much text for one save')
    const patch = readNotesPatch(JSON.parse(text || '{}'), reviewPages(g.client.intake))
    const next = await updateIntake(g.client.id, (cur) => applyNotes(cur as IntakeWithPreview, patch, g.client.previewUrl))
    return NextResponse.json({ ok: true, ...publicReview({ ...g.client, intake: next as IntakeWithPreview }) }, { headers: noStore })
  } catch (err) {
    if (err instanceof NotesError || err instanceof SyntaxError) return NextResponse.json({ error: err.message }, { status: 400 })
    console.error('[review link] save failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Could not save. Try again.' }, { status: 500 })
  }
}
