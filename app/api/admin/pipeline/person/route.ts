// ===========================================
// PATCH /api/admin/pipeline/person — status, dates and money for one person
// ===========================================
// Body: { key, status?, lostReason?, closedAt?, mrr?, setupFee?,
//         lastContactedAt?, nextFollowUpAt? }
//
// Upserts PipelinePerson, so the first tap on someone who has never been
// touched creates their record. The key must match a lead or booking of the
// marketing business; anything else is a 404, so this cannot mint records for
// arbitrary numbers. Returns the refreshed person.

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { loadPerson, requireAdmin } from '@/lib/pipeline-server'
import { STATUSES, effectiveShow, isOpenStatus, primaryBooking } from '@/lib/pipeline'

export const dynamic = 'force-dynamic'

const MAX_TEXT = 2000
const MAX_MONEY = 1_000_000

class BadInput extends Error {}

function parseDate(v: unknown, field: string): Date | null {
  if (v === null || v === '') return null
  if (typeof v !== 'string') throw new BadInput(`${field} must be an ISO date or null`)
  const d = new Date(v)
  if (isNaN(d.getTime())) throw new BadInput(`${field} is not a valid date`)
  return d
}

function parseMoney(v: unknown, field: string): number | null {
  if (v === null || v === '') return null
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/[$,\s]/g, '')) : NaN
  if (!Number.isFinite(n) || n < 0 || n > MAX_MONEY) throw new BadInput(`${field} must be a dollar amount`)
  return Math.round(n * 100) / 100
}

export async function PATCH(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied

  try {
    const body = (await request.json()) as Record<string, unknown>
    const key = typeof body.key === 'string' ? body.key.trim() : ''
    if (!key) throw new BadInput('key is required')

    const found = await loadPerson(key)
    if (!found) return NextResponse.json({ error: 'Person not found' }, { status: 404 })
    const { businessId, person } = found

    const data: Record<string, unknown> = {}
    const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k)

    if (has('status')) {
      if (!STATUSES.includes(body.status as never)) throw new BadInput('Invalid status')
      data.status = body.status
    }
    if (has('lostReason')) {
      if (body.lostReason !== null && typeof body.lostReason !== 'string') throw new BadInput('Invalid lostReason')
      data.lostReason = (body.lostReason as string | null)?.trim().slice(0, MAX_TEXT) || null
    }
    if (has('closedAt')) data.closedAt = parseDate(body.closedAt, 'closedAt')
    if (has('lastContactedAt')) data.lastContactedAt = parseDate(body.lastContactedAt, 'lastContactedAt')
    if (has('nextFollowUpAt')) data.nextFollowUpAt = parseDate(body.nextFollowUpAt, 'nextFollowUpAt')
    if (has('mrr')) data.mrr = parseMoney(body.mrr, 'mrr')
    if (has('setupFee')) data.setupFee = parseMoney(body.setupFee, 'setupFee')
    if (Object.keys(data).length === 0) throw new BadInput('Nothing to update')

    // closedAt follows the status unless this request sets it explicitly (the
    // backfill form does, to record the real close date).
    if (typeof data.status === 'string' && !has('closedAt')) {
      if (!isOpenStatus(data.status) && !person.closedAt) data.closedAt = new Date()
      if (isOpenStatus(data.status)) data.closedAt = null
    }

    // Nobody closes a deal they never talked to: a win marks the live booking
    // showed, but only if it is still unmarked. Never overrides a real mark.
    const primary = primaryBooking(person.bookings)
    const markShowed = data.status === 'won' && primary !== null && effectiveShow(primary) === 'pending'

    await db.$transaction([
      db.pipelinePerson.upsert({
        where: { businessId_personKey: { businessId, personKey: key } },
        create: { businessId, personKey: key, ...data },
        update: data,
      }),
      ...(markShowed ? [db.appointment.update({ where: { id: primary!.id }, data: { showStatus: 'showed' } })] : []),
    ])
    console.log(`[admin/pipeline] person ${key} updated: ${Object.keys(data).join(', ')}${markShowed ? ' (+showed)' : ''}`)

    const refreshed = await loadPerson(key)
    return NextResponse.json({ person: refreshed?.person ?? null })
  } catch (err) {
    if (err instanceof BadInput) return NextResponse.json({ error: err.message }, { status: 400 })
    console.error('[admin/pipeline] person update failed:', err)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}
