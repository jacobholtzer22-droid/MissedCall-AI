// ===========================================
// /api/intake/[token]: the client's own answers (CLIENT_INTAKE_LINK)
//   GET   - what the page shows: their answers and file names, nothing else
//   PATCH - { answers: { "<n>": "<text>" } }, a partial save; "" clears one
// ===========================================
// Public by the middleware's existing rules (only /dashboard, /onboarding and
// /settings are protected), so guard() is the whole gate: flag, per-IP rate
// limit, then a signed, unexpired, current token. 404 for anything else.

import { NextResponse } from 'next/server'
import { AnswerError, applyAnswers, publicView, readAnswerPatch, type IntakeWithLink } from '@/lib/ops/client-intake'
import { guard } from '@/lib/ops/client-intake-server'
import { updateIntake } from '@/lib/ops/intake-server'

export const dynamic = 'force-dynamic'

const noStore = { 'Cache-Control': 'no-store' }

export async function GET(request: Request, context: { params: { token: string } }) {
  const g = await guard(request, context.params.token, 'read')
  if ('response' in g) return g.response
  return NextResponse.json(publicView(g.client), { headers: noStore })
}

export async function PATCH(request: Request, context: { params: { token: string } }) {
  const g = await guard(request, context.params.token, 'save')
  if ('response' in g) return g.response
  try {
    const text = await request.text()
    if (text.length > 150_000) throw new AnswerError('that is too much text for one save')
    const patch = readAnswerPatch(JSON.parse(text || '{}'))
    const next = await updateIntake(g.client.id, (cur) => applyAnswers(cur as IntakeWithLink, patch))
    return NextResponse.json({ ok: true, ...publicView({ ...g.client, intake: next as IntakeWithLink }) }, { headers: noStore })
  } catch (err) {
    if (err instanceof AnswerError || err instanceof SyntaxError) return NextResponse.json({ error: err.message }, { status: 400 })
    console.error('[intake link] save failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Could not save. Try again.' }, { status: 500 })
  }
}
