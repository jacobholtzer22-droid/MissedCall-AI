// ===========================================
// GET /api/admin/ops/board — the whole /admin/ops board
// ===========================================
// Read only. Same loader the page renders from (lib/ops/board.ts); the client
// refetches it after every write so alerts and totals are recomputed server
// side.

import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/pipeline-server'
import { getOpsBoard } from '@/lib/ops/board'

export const dynamic = 'force-dynamic'

export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    return NextResponse.json(await getOpsBoard())
  } catch (err) {
    console.error('[admin/ops/board] failed:', err)
    return NextResponse.json({ error: 'Failed to load board' }, { status: 500 })
  }
}
