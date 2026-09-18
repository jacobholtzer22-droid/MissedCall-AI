// ===========================================
// GET /api/admin/pipeline — every funnel person, booked or not
// ===========================================
// Feeds /admin/pipeline. Marketing business only; client tenants never appear.
// One row per person (lib/pipeline-server.ts), test numbers included so a
// backfill can reach them; rollupRoi leaves them out of the ROI table.

import { NextResponse } from 'next/server'
import { loadPipeline, requireAdmin } from '@/lib/pipeline-server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied

  try {
    const res = await loadPipeline()
    if (!res) return NextResponse.json({ error: 'No marketing business configured' }, { status: 503 })
    return NextResponse.json({ people: res.people })
  } catch (err) {
    console.error('[admin/pipeline] load failed:', err)
    return NextResponse.json({ error: 'Failed to load pipeline' }, { status: 500 })
  }
}
