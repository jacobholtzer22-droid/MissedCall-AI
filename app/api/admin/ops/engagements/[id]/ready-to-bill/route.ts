// POST /api/admin/ops/engagements/[id]/ready-to-bill: Jacob dismisses the
// "ready to bill" row (READY_TO_BILL). Writes one activity marker; nothing else,
// and never Stripe. 404 with the flag off.

import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/pipeline-server'
import { db } from '@/lib/db'
import { DISMISS_MARKER, readyToBillEnabled } from '@/lib/ops/ready-to-bill'

export const dynamic = 'force-dynamic'

export async function POST(_request: Request, context: { params: { id: string } }) {
  if (!readyToBillEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const denied = await requireAdmin()
  if (denied) return denied
  const id = context.params.id
  const e = await db.engagement.findUnique({ where: { id }, select: { id: true } })
  if (!e) return NextResponse.json({ error: 'Engagement not found' }, { status: 404 })
  await db.opsActivity.create({ data: { engagementId: id, kind: 'system', body: `${DISMISS_MARKER} by Jacob in Ops HQ.` } })
  return NextResponse.json({ ok: true })
}
