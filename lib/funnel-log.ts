// Server-side FunnelEvent writer.
//
// The client posts to /api/funnel-event, but OTP events are decided on the
// server (a send that was capped, a verify that failed) and must not depend on
// the browser choosing to report them. Same table, same shape.
//
// Never awaited by callers and never throws: analytics must not break a funnel.

import { db } from '@/lib/db'

export async function logFunnelEvent(e: {
  name: string
  step?: string | null
  visitorId?: string | null
  variant?: string | null
  funnelVariant?: string | null
  metadata?: object
}): Promise<void> {
  try {
    await db.funnelEvent.create({
      data: {
        name: e.name,
        step: e.step ?? null,
        visitorId: e.visitorId ?? null,
        variant: e.variant ?? null,
        funnelVariant: e.funnelVariant ?? null,
        metadata: e.metadata,
      },
    })
  } catch (err) {
    console.error('[funnel-log] failed:', err)
  }
}
