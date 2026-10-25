// ===========================================
// POST /api/ops/build-callback — aa-build.yml reports a run
// ===========================================
// Public: no Clerk. Trust comes only from X-AA-Signature, the hex
// HMAC-SHA256 of the raw body keyed with OPS_CALLBACK_SECRET, checked in
// constant time before the body is parsed. Anything else is 401.
// See lib/ops/agents/callback.ts for what a valid body does.

import { NextResponse } from 'next/server'
import { applyCallback, verifySignature } from '@/lib/ops/agents/callback'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const secret = process.env.OPS_CALLBACK_SECRET?.trim()
  if (!secret) {
    console.error('[ops/build-callback] OPS_CALLBACK_SECRET is not set; rejecting')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const raw = await request.text()
  if (!verifySignature(raw, request.headers.get('x-aa-signature'), secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const outcome = await applyCallback(raw)
    return NextResponse.json(outcome.body, { status: outcome.status })
  } catch (err) {
    console.error('[ops/build-callback] failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to record the run' }, { status: 500 })
  }
}
