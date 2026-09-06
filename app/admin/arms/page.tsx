import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import ArmsClient, { type ArmsData, type StepRow } from './ArmsClient'
import { FUNNEL_VIDEOS, armsMissingVideo } from '@/lib/funnel-videos'
import { getMarketingBusiness } from '@/lib/marketing-funnel'
import { sanitizeTouch } from '@/lib/attribution'

export const dynamic = 'force-dynamic'

const ARMS = ['A', 'B', 'C', 'unassigned'] as const


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

/**
 * Leads and bookings per arm, broken down by the AD that produced them
 * (utm_term). Aggregated in JS rather than SQL because the touch is a JSON
 * column and the row counts here are in the dozens — a groupBy would need a raw
 * query for no benefit at this size.
 *
 * Rows whose ad name is absent are bucketed under "(no ad in link)" rather than
 * dropped: those leads are real, and hiding them would make the tagged ads look
 * like they produced all the traffic.
 */
async function adBreakdown(businessId: string, since?: Date) {
  const [leads, appts] = await Promise.all([
    db.websiteLead.findMany({
      where: { businessId, status: { not: 'spam' }, ...(since ? { createdAt: { gte: since } } : {}) },
      select: { funnelVariant: true, attributionFirst: true },
    }),
    db.appointment.findMany({
      where: { businessId, status: { not: 'cancelled' }, ...(since ? { createdAt: { gte: since } } : {}) },
      select: { funnelVariant: true, attributionFirst: true },
    }),
  ])

  const NO_AD = '(no ad in link)'
  const rows = new Map<string, { arm: string; ad: string; leads: number; bookings: number }>()
  const bump = (arm: string | null, touch: unknown, field: 'leads' | 'bookings') => {
    const t = sanitizeTouch(touch)
    const key = `${arm ?? 'unassigned'}|${t?.term ?? NO_AD}`
    const row = rows.get(key) ?? { arm: arm ?? 'unassigned', ad: t?.term ?? NO_AD, leads: 0, bookings: 0 }
    row[field]++
    rows.set(key, row)
  }
  for (const l of leads) bump(l.funnelVariant, l.attributionFirst, 'leads')
  for (const a of appts) bump(a.funnelVariant, a.attributionFirst, 'bookings')

  return Array.from(rows.values()).sort(
    (x, y) => x.arm.localeCompare(y.arm) || y.leads - x.leads || y.bookings - x.bookings
  )
}

/**
 * The funnel as steps, per arm.
 *
 * Each step is a count and a share of the step ABOVE it, because that is where
 * the leak shows: 767 landing views against 16 OTP sends is invisible in a
 * table of totals and obvious in a table of ratios.
 *
 * Sources differ per step by necessity — ArmEvent for page-level events,
 * FunnelEvent for wizard screens, PhoneVerification for the OTP leg — so each
 * row names where it came from in the UI rather than pretending to one table.
 */
async function stepFunnel(since?: Date): Promise<StepRow[][]> {
  const when = since ? { createdAt: { gte: since } } : {}
  const [armEvents, funnelEvents, otps] = await Promise.all([
    db.armEvent.groupBy({ by: ['arm', 'type'], where: when, _count: { _all: true } }),
    db.funnelEvent.findMany({
      where: { ...when, name: { in: ['gate_opened', 'gate_step_completed', 'gate_exit_not_a_fit'] } },
      select: { name: true, step: true, funnelVariant: true },
    }),
    db.phoneVerification.findMany({
      where: when,
      select: { funnelVariant: true, verifiedAt: true, deliveryStatus: true },
    }),
  ])

  const armOf = (a: string | null | undefined) => a ?? 'unassigned'
  const arms = Array.from(
    new Set([
      'A',
      'B',
      ...armEvents.map((e) => e.arm),
      ...funnelEvents.map((e) => armOf(e.funnelVariant)),
      ...otps.map((o) => armOf(o.funnelVariant)),
    ])
  ).sort()

  const armCount = (arm: string, type: string) =>
    armEvents.find((e) => e.arm === arm && e.type === type)?._count._all ?? 0
  const feCount = (arm: string, name: string, step?: string) =>
    funnelEvents.filter(
      (e) => armOf(e.funnelVariant) === arm && e.name === name && (step ? e.step === step : true)
    ).length

  return arms.map((arm) => {
    const mine = otps.filter((o) => armOf(o.funnelVariant) === arm)
    const steps: [string, number, string][] = [
      ['Landing views', armCount(arm, 'view'), 'ArmEvent'],
      ['Modal opens', feCount(arm, 'gate_opened'), 'FunnelEvent'],
      ['1. Trade', feCount(arm, 'gate_step_completed', 'trade'), 'FunnelEvent'],
      ['2. First name', feCount(arm, 'gate_step_completed', 'firstName'), 'FunnelEvent'],
      ['3. Cell', feCount(arm, 'gate_step_completed', 'phone'), 'FunnelEvent'],
      ['4. Email', feCount(arm, 'gate_step_completed', 'email'), 'FunnelEvent'],
      ['Disqualified', feCount(arm, 'gate_exit_not_a_fit'), 'FunnelEvent'],
      ['OTP sent', mine.length, 'PhoneVerification'],
      ['OTP delivered', mine.filter((o) => o.deliveryStatus === 'delivered').length, 'Telnyx'],
      ['OTP verified', mine.filter((o) => o.verifiedAt).length, 'PhoneVerification'],
      ['Watch views', armCount(arm, 'watch_view'), 'ArmEvent'],
      ['Bookings', armCount(arm, 'schedule'), 'ArmEvent'],
    ]

    let prev: number | null = null
    return steps.map(([label, count, source]) => {
      // Disqualified is a branch off the trade screen, not a stage everyone
      // passes through, so it neither takes a percentage nor becomes the
      // denominator for OTP sent.
      const isBranch = label === 'Disqualified'
      const row: StepRow = {
        arm,
        label,
        count,
        source,
        pctOfPrev: isBranch || prev === null || prev === 0 ? null : Math.round((count / prev) * 1000) / 10,
      }
      if (!isBranch) prev = count
      return row
    })
  })
}

export default async function ArmsPage() {
  const { userId } = await auth()
  if (!userId || userId !== process.env.ADMIN_USER_ID) redirect('/dashboard')

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const [lifetime, last7, recent, srcLifetime, src7] = await Promise.all([
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
    bookingsBySource(),
    bookingsBySource(sevenDaysAgo),
  ])

  const [stepsLifetime, steps7] = await Promise.all([stepFunnel(), stepFunnel(sevenDaysAgo)])

  const marketing = await getMarketingBusiness()
  const [adsLifetime, ads7] = marketing
    ? await Promise.all([adBreakdown(marketing.id), adBreakdown(marketing.id, sevenDaysAgo)])
    : [[], []]

  // Configured source per arm, plus what the ledger actually recorded serving.
  // They should agree; if they do not, the env changed mid-test.
  const servedRows = await db.armEvent.groupBy({
    by: ['arm', 'videoUrl'],
    where: { type: 'watch_view', videoUrl: { not: null } },
    _count: { _all: true },
  })

  const data: ArmsData = {
    videos: (['A', 'B'] as const).map((arm) => ({
      arm,
      path: `/book/${arm.toLowerCase()}`,
      configured: FUNNEL_VIDEOS[arm].src,
      served: servedRows
        .filter((r) => r.arm === arm)
        .sort((a, b) => b._count._all - a._count._all)
        .map((r) => ({ url: r.videoUrl as string, count: r._count._all })),
    })),
    missingVideo: armsMissingVideo(),
    bookingSources: { last7: src7, lifetime: srcLifetime },
    ads: { last7: ads7, lifetime: adsLifetime },
    steps: { last7: steps7, lifetime: stepsLifetime },
    last7: rollup(last7),
    lifetime: rollup(lifetime),
    recentVerified: recent.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
  }

  return <ArmsClient data={data} />
}
