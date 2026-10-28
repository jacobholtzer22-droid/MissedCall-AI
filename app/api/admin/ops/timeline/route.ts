// ===========================================
// GET /api/admin/ops/timeline?before=&client=&agent=&kinds=&from=&limit=
// ===========================================
// The merged history (lib/ops/timeline.ts), newest first, 50 a page by
// default. client is an engagementId; kinds is a comma list of approvals,
// jobs, runs, notes, decisions; from and before are ISO times. nextBefore is
// the cursor for the next page, null when there is no more. Read only.

import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/pipeline-server'
import { TIMELINE_KINDS, getTimeline, type TimelineKind } from '@/lib/ops/timeline'

export const dynamic = 'force-dynamic'

function date(raw: string | null, name: string): Date | null {
  if (!raw) return null
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) throw new Error(`${name} is not a date`)
  return d
}

export async function GET(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  const p = new URL(request.url).searchParams
  let before: Date | null, from: Date | null
  try {
    before = date(p.get('before'), 'before')
    from = date(p.get('from'), 'from')
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
  const kinds = (p.get('kinds') ?? '')
    .split(',')
    .map((k) => k.trim())
    .filter((k): k is TimelineKind => (TIMELINE_KINDS as readonly string[]).includes(k))
  const agent = p.get('agent')
  if (agent && !['chief', 'ads', 'web'].includes(agent)) return NextResponse.json({ error: 'agent must be chief, ads or web' }, { status: 400 })
  try {
    const result = await getTimeline({
      before,
      from,
      engagementId: p.get('client'),
      agent,
      kinds,
      limit: Number(p.get('limit')) || 50,
    })
    return NextResponse.json(result)
  } catch (err) {
    console.error('[admin/ops/timeline] failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to load the timeline' }, { status: 500 })
  }
}
