import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import ArmsClient, { type ArmsData } from './ArmsClient'

export const dynamic = 'force-dynamic'

const ARMS = ['A', 'B', 'C', 'unassigned'] as const

function rollup(rows: { arm: string; type: string; _count: { _all: number } }[]) {
  const get = (arm: string, type: string) =>
    rows.find((r) => r.arm === arm && r.type === type)?._count._all ?? 0

  return ARMS.map((arm) => {
    const views = get(arm, 'view')
    const verifiedLeads = get(arm, 'verified_lead')
    const bookings = get(arm, 'schedule')
    const w25 = get(arm, 'video_25')
    const w50 = get(arm, 'video_50')
    const w75 = get(arm, 'video_75')
    const w100 = get(arm, 'video_100')
    // Watch-through is measured against people who actually STARTED the video
    // (the 25% mark), not against page views. Dividing by views would mix in
    // everyone who never pressed play and make every arm look broken.
    const pct = (n: number) => (w25 > 0 ? Math.round((n / w25) * 1000) / 10 : null)
    return {
      arm,
      views,
      verifiedLeads,
      bookings,
      verifiedRate: views > 0 ? Math.round((verifiedLeads / views) * 10000) / 100 : null,
      watch: { started: w25, half: w50, threeQuarters: w75, complete: w100 },
      watchThrough: { half: pct(w50), threeQuarters: pct(w75), complete: pct(w100) },
    }
  }).filter((r) => r.views > 0 || r.verifiedLeads > 0 || r.watch.started > 0)
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
