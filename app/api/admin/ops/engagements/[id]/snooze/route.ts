// ===========================================
// POST /api/admin/ops/engagements/[id]/snooze — push the follow-up out
// ===========================================
// Body: { days } (1–60). nextFollowUpAt = now + days, logged as a system
// activity so the history shows the follow-up moved.

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/pipeline-server'
import { BadRequest, readJsonObject, rejectUnknownKeys } from '@/lib/ops/validate'

export const dynamic = 'force-dynamic'

const DAY_MS = 24 * 60 * 60 * 1000

export async function POST(request: Request, context: { params: { id: string } }) {
  const denied = await requireAdmin()
  if (denied) return denied
  const id = context.params.id

  try {
    const body = readJsonObject(await request.json())
    rejectUnknownKeys(body, ['days'])
    const days = Number(body.days)
    if (!Number.isInteger(days) || days < 1 || days > 60) throw new BadRequest('days must be a whole number from 1 to 60')

    const exists = await db.engagement.findUnique({ where: { id }, select: { id: true } })
    if (!exists) return NextResponse.json({ error: 'Engagement not found' }, { status: 404 })

    const nextFollowUpAt = new Date(Date.now() + days * DAY_MS)
    await db.$transaction([
      db.engagement.update({ where: { id }, data: { nextFollowUpAt } }),
      db.opsActivity.create({
        data: { engagementId: id, kind: 'system', body: `Follow-up snoozed ${days}d`, followUpAt: nextFollowUpAt },
      }),
    ])
    return NextResponse.json({ ok: true, nextFollowUpAt: nextFollowUpAt.toISOString() })
  } catch (err) {
    if (err instanceof BadRequest) return NextResponse.json({ error: err.message }, { status: 400 })
    console.error('[admin/ops/snooze] POST failed:', err)
    return NextResponse.json({ error: 'Failed to snooze' }, { status: 500 })
  }
}
