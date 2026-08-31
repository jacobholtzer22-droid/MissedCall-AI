// ===========================================
// GET /api/admin/funnel-ab — structure A/B report
// ===========================================
// Per arm: landing views, every FunnelEvent step (OTP included), verified
// leads, bookings, and the two ratios that actually decide the test.
//
// ⚠️ A and B meant "which video played" until 2026-08-31 and mean "which funnel
// structure" after it. Rows either side of that line are not comparable, which
// is why `since` defaults to the cutover instead of all time. Widen it only if
// you know you are mixing two different experiments.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

/** The deploy that redefined the arms. */
const STRUCTURE_TEST_START = '2026-08-31T00:00:00.000Z'

const ARMS = ['A', 'B'] as const
type Arm = (typeof ARMS)[number]

function ratio(numerator: number, denominator: number): number | null {
  // null, not 0: "no views yet" and "views but nobody converted" are different
  // findings, and rendering both as 0% hides the first one.
  if (denominator <= 0) return null
  return Math.round((numerator / denominator) * 10000) / 10000
}

export async function GET(request: NextRequest) {
  const { userId } = await auth()
  if (!userId || userId !== process.env.ADMIN_USER_ID) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const sinceRaw = request.nextUrl.searchParams.get('since')
  const untilRaw = request.nextUrl.searchParams.get('until')

  const since = sinceRaw ? new Date(sinceRaw) : new Date(STRUCTURE_TEST_START)
  const until = untilRaw ? new Date(untilRaw) : new Date()
  if (Number.isNaN(since.getTime()) || Number.isNaN(until.getTime())) {
    return NextResponse.json({ error: 'Invalid since/until. Use ISO dates.' }, { status: 400 })
  }
  if (since > until) {
    return NextResponse.json({ error: '`since` is after `until`.' }, { status: 400 })
  }

  const window = { gte: since, lte: until }

  const [events, leads, appointments] = await Promise.all([
    db.funnelEvent.groupBy({
      by: ['funnelVariant', 'name', 'step'],
      where: { createdAt: window },
      _count: { _all: true },
    }),
    // "Verified lead" is a lead row that exists at all: since this change,
    // nothing writes a WebsiteLead from the funnel without redeeming an OTP
    // ticket, so existence IS the verification. Partial rows count — someone
    // who verified and then abandoned is still a real, callable lead.
    db.websiteLead.groupBy({
      by: ['funnelVariant'],
      where: { createdAt: window, status: { not: 'spam' } },
      _count: { _all: true },
    }),
    db.appointment.groupBy({
      by: ['funnelVariant'],
      where: { createdAt: window, status: { not: 'cancelled' } },
      _count: { _all: true },
    }),
  ])

  const byArm = ARMS.map((arm: Arm) => {
    const armEvents = events.filter((e) => e.funnelVariant === arm)

    const steps: Record<string, number> = {}
    for (const e of armEvents) {
      // Key on the step where there is one, else the event name: landing_view
      // and thanks_view carry a step, honeypot_blocked is only meaningful by
      // name. Both need to show up.
      const key = e.step ?? e.name
      steps[key] = (steps[key] ?? 0) + e._count._all
    }

    const views = steps['landing'] ?? 0
    const verifiedLeads = leads.find((l) => l.funnelVariant === arm)?._count._all ?? 0
    const bookings = appointments.find((a) => a.funnelVariant === arm)?._count._all ?? 0

    return {
      variant: arm,
      landingViews: views,
      steps,
      otp: {
        sent: steps['otp_sent'] ?? 0,
        verified: steps['otp_verified'] ?? 0,
        failed: steps['otp_failed'] ?? 0,
      },
      verifiedLeads,
      bookings,
      leadsPerView: ratio(verifiedLeads, views),
      bookingsPerView: ratio(bookings, views),
    }
  })

  // Rows written before either arm was assigned, or by traffic that never got a
  // cookie. Surfaced rather than dropped: a large number here means the report
  // is missing traffic and the ratios are understated.
  const unassignedLeads = leads.find((l) => l.funnelVariant === null)?._count._all ?? 0
  const unassignedBookings = appointments.find((a) => a.funnelVariant === null)?._count._all ?? 0

  return NextResponse.json({
    since: since.toISOString(),
    until: until.toISOString(),
    note:
      'A/B meant which VIDEO played before 2026-08-31 and which STRUCTURE after. ' +
      'Do not compare across that date.',
    variants: byArm,
    unassigned: { leads: unassignedLeads, bookings: unassignedBookings },
  })
}
