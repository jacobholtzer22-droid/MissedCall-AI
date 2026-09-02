import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import ArmsClient, { type ArmsData } from './ArmsClient'

export const dynamic = 'force-dynamic'

const ARMS = ['A', 'B', 'C', 'unassigned'] as const

function rollup(rows: { arm: string; type: string; _count: { _all: number } }[]) {
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

export default async function ArmsPage() {
  const { userId } = await auth()
  if (!userId || userId !== process.env.ADMIN_USER_ID) redirect('/dashboard')

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const [lifetime, last7, recent] = await Promise.all([
    db.armEvent.groupBy({ by: ['arm', 'type'], _count: { _all: true } }),
    db.armEvent.groupBy({
      by: ['arm', 'type'],
      where: { createdAt: { gte: sevenDaysAgo } },
      _count: { _all: true },
    }),
    db.armEvent.findMany({
      where: { type: 'verified_lead' },
      orderBy: { createdAt: 'desc' },
      take: 25,
      select: { createdAt: true, arm: true, trade: true, businessName: true, phone: true },
    }),
  ])

  const data: ArmsData = {
    last7: rollup(last7),
    lifetime: rollup(lifetime),
    recentVerified: recent.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
  }

  return <ArmsClient data={data} />
}
