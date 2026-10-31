// ===========================================
// POST /api/ops/build-callback — aa-build.yml reports a run
// ===========================================
// Public: no Clerk. Trust comes only from X-AA-Signature, the hex
// HMAC-SHA256 of the raw body keyed with OPS_CALLBACK_SECRET, checked in
// constant time before the body is parsed. Anything else is 401.
// Every rejection (no secret, bad signature, bad body, unknown run) is logged
// with the repo and reason, and lands on the run's feed when the body names a
// run that exists (logCallbackRejection), so a 401 is visible on the desk.
// See lib/ops/agents/callback.ts for what a valid body does.

import { NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { applyCallback, logCallbackRejection, verifySignature } from '@/lib/ops/agents/callback'
import { onSpecialistRunEnded } from '@/lib/ops/hq/jobs'

export const dynamic = 'force-dynamic'
// A web run that was the last in its job wakes the chief to write the report.
export const maxDuration = 800

export async function POST(request: Request) {
  const secret = process.env.OPS_CALLBACK_SECRET?.trim()
  const raw = await request.text()
  if (!secret) {
    await logCallbackRejection(raw, 401, 'OPS_CALLBACK_SECRET is not set on the platform')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!verifySignature(raw, request.headers.get('x-aa-signature'), secret)) {
    await logCallbackRejection(
      raw,
      401,
      request.headers.get('x-aa-signature')
        ? "bad signature: the repo's OPS_CALLBACK_SECRET differs from production's (Reseal secrets)"
        : 'no X-AA-Signature header'
    )
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const outcome = await applyCallback(raw)
    if (outcome.status !== 200) await logCallbackRejection(raw, outcome.status, outcome.body.error)
    if (outcome.status === 200 && outcome.jobId && !outcome.body.duplicate) {
      const jobId = outcome.jobId
      waitUntil(onSpecialistRunEnded(jobId).catch((err) => console.error('[ops/build-callback] job report failed:', err instanceof Error ? err.message : err)))
    }
    return NextResponse.json(outcome.body, { status: outcome.status })
  } catch (err) {
    console.error('[ops/build-callback] failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to record the run' }, { status: 500 })
  }
}
