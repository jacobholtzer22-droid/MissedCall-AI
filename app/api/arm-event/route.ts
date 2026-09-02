// POST /api/arm-event — client-reported arm ledger rows.
//
// Only the event types the browser is allowed to assert. Views and verified
// leads are written server-side and are NOT accepted here, so a scripted post
// cannot inflate the denominator or mint a lead.

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { rateLimit, getClientIp } from '@/lib/rate-limit'
import { VISITOR_COOKIE } from '@/lib/variant'
import { FUNNEL_VARIANT_COOKIE } from '@/lib/funnel-variant'
import { GATE_COOKIE } from '@/app/book/constants'

export const dynamic = 'force-dynamic'

const CLIENT_TYPES = ['video_25', 'video_50', 'video_75', 'video_100']

export async function POST(request: NextRequest) {
  // Four milestones per visitor per video; generous for replays.
  if (!rateLimit(`arm-event:${getClientIp(request)}`, 40, 60_000).allowed) {
    return NextResponse.json({ ok: false }, { status: 429 })
  }

  try {
    const body = (await request.json()) as { type?: string }
    const type = typeof body.type === 'string' ? body.type.trim() : ''
    if (!CLIENT_TYPES.includes(type)) {
      return NextResponse.json({ ok: false, error: 'unknown type' }, { status: 400 })
    }

    const leadId = request.cookies.get(GATE_COOKIE)?.value ?? null
    const arm = request.cookies.get(FUNNEL_VARIANT_COOKIE)?.value || 'unassigned'
    const visitorId = request.cookies.get(VISITOR_COOKIE)?.value ?? null

    // One row per (lead, milestone). A replay or a second tab must not count
    // twice, or watch-through goes above 100%.
    const existing = leadId
      ? await db.armEvent.findFirst({ where: { type, leadId } })
      : await db.armEvent.findFirst({ where: { type, visitorId } })
    if (existing) return NextResponse.json({ ok: true, deduped: true })

    await db.armEvent.create({ data: { type, arm, leadId, visitorId } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[arm-event] failed:', err)
    return NextResponse.json({ ok: false }, { status: 200 })
  }
}
