// GET /api/admin/arms — per-arm views, verified leads and verified rate.
//
// Reads the ArmEvent ledger only. It deliberately does NOT join WebsiteLead:
// a verified_lead row is written in the same request that fires the Lead event,
// so this number and the number in Meta describe the same thing. Counting lead
// rows instead would drift the moment a row is edited, merged or deleted.

import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

const ARMS = ['A', 'B', 'C', 'unassigned'] as const

// Row shape is inferred from rollup() so the API and the page cannot drift.

/**
 * Bookings split by the door they came through. Read from Appointment rather
 * than the arm ledger: the ledger has no source, and mixing an ad booking with
 * a cold /calendar booking would make every arm's conversion look better than
 * it is.
 */
async function bookingsBySource(since?: Date) {
  const rows = await db.appointment.groupBy({
    by: ['source'],
    where: { status: { not: 'cancelled' }, ...(since ? { createdAt: { gte: since } } : {}) },
    _count: { _all: true },
  })
  const get = (s: string) => rows.find((r) => r.source === s)?._count._all ?? 0
  return {
    funnel: get('website') + get('sms'),
    smsLink: get('sms_link'),
    direct: get('direct'),
  }
}

function rollup(rows: { arm: string; type: string; _count: { _all: number } }[]) {
  const get = (arm: string, type: string) =>
    rows.find((r) => r.arm === arm && r.type === type)?._count._all ?? 0

  return ARMS.map((arm) => {
    const views = get(arm, 'view')
    const verifiedLeads = get(arm, 'verified_lead')
    const watchViews = get(arm, 'watch_view')
    const bookings = get(arm, 'schedule')
    const w25 = get(arm, 'video_25')
    const w50 = get(arm, 'video_50')
    const w75 = get(arm, 'video_75')
    const w100 = get(arm, 'video_100')
    // Watch-through is a share of people who STARTED the video, not of page
    // views: dividing by views mixes in everyone who never pressed play.
    const pct = (n: number) => (w25 > 0 ? Math.round((n / w25) * 1000) / 10 : null)
    return {
      arm,
      views,
      verifiedLeads,
      watchViews,
      bookings,
      verifiedRate: views > 0 ? Math.round((verifiedLeads / views) * 10000) / 100 : null,
      watch: { started: w25, half: w50, threeQuarters: w75, complete: w100 },
      watchThrough: { half: pct(w50), threeQuarters: pct(w75), complete: pct(w100) },
    }
  }).filter((r) => r.views > 0 || r.verifiedLeads > 0 || r.watch.started > 0 || r.watchViews > 0)
}

export async function GET() {
  const { userId } = await auth()
  if (!userId || userId !== process.env.ADMIN_USER_ID) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const [lifetime, last7] = await Promise.all([
    db.armEvent.groupBy({ by: ['arm', 'type'], _count: { _all: true } }),
    db.armEvent.groupBy({
      by: ['arm', 'type'],
      where: { createdAt: { gte: sevenDaysAgo } },
      _count: { _all: true },
    }),
  ])

  const recent = await db.armEvent.findMany({
    where: { type: 'verified_lead' },
    orderBy: { createdAt: 'desc' },
    take: 25,
    select: { createdAt: true, arm: true, trade: true, businessName: true, phone: true },
  })

  return NextResponse.json({
    since: sevenDaysAgo.toISOString(),
    last7: rollup(last7),
    lifetime: rollup(lifetime),
    recentVerified: recent,
  })
}
