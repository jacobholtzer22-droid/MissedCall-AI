// ===========================================
// /api/admin/ops/engagements/[id]/activities
//   GET  — the full activity log, newest first
//   POST — log a contact or note
// ===========================================
// Body: { kind, body, followUpAt? }. Contact kinds (call, voicemail, text,
// email, meeting) stamp Engagement.lastContactedAt = now in the same
// transaction. followUpAt also becomes Engagement.nextFollowUpAt. An empty body
// with a followUpAt is saved as "Follow-up scheduled".

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/pipeline-server'
import { OPS_ACTIVITY_KINDS } from '@/lib/ops/types'
import { BadRequest, nullableDate, nullableString, oneOf, readJsonObject, rejectUnknownKeys } from '@/lib/ops/validate'

export const dynamic = 'force-dynamic'

const CONTACT_KINDS = new Set(['call', 'voicemail', 'text', 'email', 'meeting'])

/** The full log, newest first. The board carries only the last 5. */
export async function GET(_request: Request, context: { params: { id: string } }) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const rows = await db.opsActivity.findMany({
      where: { engagementId: context.params.id },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json({
      activities: rows.map((a) => ({
        id: a.id,
        kind: a.kind,
        body: a.body,
        followUpAt: a.followUpAt?.toISOString() ?? null,
        createdAt: a.createdAt.toISOString(),
      })),
    })
  } catch (err) {
    console.error('[admin/ops/activities] GET failed:', err)
    return NextResponse.json({ error: 'Failed to load activity' }, { status: 500 })
  }
}

export async function POST(request: Request, context: { params: { id: string } }) {
  const denied = await requireAdmin()
  if (denied) return denied
  const id = context.params.id

  try {
    const body = readJsonObject(await request.json())
    rejectUnknownKeys(body, ['kind', 'body', 'followUpAt'])
    const kind = oneOf(body.kind ?? 'note', OPS_ACTIVITY_KINDS, 'kind')
    const followUpAt = 'followUpAt' in body ? nullableDate(body.followUpAt, 'followUpAt') : null
    let text = 'body' in body ? nullableString(body.body, 'body', 20000) : null
    if (!text && followUpAt) text = 'Follow-up scheduled'
    if (!text) throw new BadRequest('body is required')

    const exists = await db.engagement.findUnique({ where: { id }, select: { id: true } })
    if (!exists) return NextResponse.json({ error: 'Engagement not found' }, { status: 404 })

    const now = new Date()
    const activity = await db.$transaction(async (tx) => {
      const row = await tx.opsActivity.create({ data: { engagementId: id, kind, body: text!, followUpAt } })
      const touch = {
        ...(CONTACT_KINDS.has(kind) ? { lastContactedAt: now } : {}),
        ...(followUpAt ? { nextFollowUpAt: followUpAt } : {}),
      }
      if (Object.keys(touch).length > 0) await tx.engagement.update({ where: { id }, data: touch })
      return row
    })
    return NextResponse.json({ ok: true, activityId: activity.id })
  } catch (err) {
    if (err instanceof BadRequest) return NextResponse.json({ error: err.message }, { status: 400 })
    console.error('[admin/ops/activities] POST failed:', err)
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  }
}
