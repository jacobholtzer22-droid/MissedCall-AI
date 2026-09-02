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

export type ArmRow = {
  arm: string
  views: number
  verifiedLeads: number
  /** null, not 0, when there are no views: "no traffic" is not "0% conversion". */
  verifiedRate: number | null
}

function rollup(rows: { arm: string; type: string; _count: { _all: number } }[]): ArmRow[] {
  return ARMS.map((arm) => {
    const views = rows.find((r) => r.arm === arm && r.type === 'view')?._count._all ?? 0
    const verifiedLeads = rows.find((r) => r.arm === arm && r.type === 'verified_lead')?._count._all ?? 0
    return {
      arm,
      views,
      verifiedLeads,
      verifiedRate: views > 0 ? Math.round((verifiedLeads / views) * 10000) / 100 : null,
    }
  }).filter((r) => r.views > 0 || r.verifiedLeads > 0)
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
