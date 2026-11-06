// ===========================================
// GET /api/admin/ops/hq/spend — model spend per HQ agent
// ===========================================
// Today and this calendar month (Detroit time), summed from the usage events
// the agent loop writes per model turn (lib/ops/hq/usage.ts). Covers the
// agents that run on the platform's API key here: chief, ads, research,
// photo. Web builds run Claude Code inside each client repo's GitHub Action
// and report no cost back, so the Web desk shows nothing. HQ fetches this
// once a minute, only with revenue shown.

import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/pipeline-server'
import { spendByAgent } from '@/lib/ops/hq/usage'

export const dynamic = 'force-dynamic'

export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const agents = await spendByAgent()
    const round = (v: number) => Math.round(v * 1000) / 1000
    return NextResponse.json({
      agents: agents.map((a) => ({ ...a, todayUsd: round(a.todayUsd), monthUsd: round(a.monthUsd) })),
      totalTodayUsd: round(agents.reduce((s, a) => s + a.todayUsd, 0)),
      totalMonthUsd: round(agents.reduce((s, a) => s + a.monthUsd, 0)),
    })
  } catch (err) {
    console.error('[admin/ops/hq/spend] failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to load spend' }, { status: 500 })
  }
}
