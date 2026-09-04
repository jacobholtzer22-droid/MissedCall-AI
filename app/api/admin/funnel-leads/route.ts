// ===========================================
// ADMIN FUNNEL LEADS — attribution readout
// ===========================================
// Feeds /admin/leads. Read only.
//
// Exists because "untagged" was the answer for every lead: the funnel captured
// UTMs only, on the URL only, so an organic Facebook click, a Google search and
// someone typing the address all landed in one indistinguishable bucket. Every
// row here carries a first touch, a last touch and a plain-English sentence.

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getMarketingBusiness } from '@/lib/marketing-funnel'
import { describeJourney, describeTouch, sanitizeTouch } from '@/lib/attribution'

const ADMIN_USER_ID = process.env.ADMIN_USER_ID
const MAX_ROWS = 200

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { userId } = await auth()
  if (!userId || userId !== ADMIN_USER_ID) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  try {
    const business = await getMarketingBusiness()
    if (!business) return NextResponse.json({ error: 'No marketing business configured' }, { status: 503 })

    const params = new URL(request.url).searchParams
    const verifiedOnly = params.get('verified') === '1'

    const leads = await db.websiteLead.findMany({
      where: {
        businessId: business.id,
        status: { not: 'spam' },
        ...(verifiedOnly ? { NOT: { otpVerifiedAt: null } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: MAX_ROWS,
      select: {
        id: true, name: true, phone: true, email: true, message: true, status: true,
        funnelVariant: true, bookingSurface: true, otpVerifiedAt: true, createdAt: true,
        attributionFirst: true, attributionLast: true, fbp: true, fbc: true,
      },
    })

    // Bookings are keyed by phone, not by a lead FK: a landing-calendar booking
    // can exist with no lead row at all, and a lead can book from a different
    // device than the one that walked the funnel.
    const phones = leads.map((l) => l.phone).filter((p): p is string => Boolean(p))
    const appts = phones.length
      ? await db.appointment.findMany({
          where: { businessId: business.id, customerPhone: { in: phones }, status: { not: 'cancelled' } },
          orderBy: { createdAt: 'desc' },
          select: { customerPhone: true, scheduledAt: true, bookingSurface: true, source: true },
        })
      : []
    const apptByPhone = new Map<string, (typeof appts)[number]>()
    for (const a of appts) if (!apptByPhone.has(a.customerPhone)) apptByPhone.set(a.customerPhone, a)

    const rows = leads.map((l) => {
      const first = sanitizeTouch(l.attributionFirst)
      const last = sanitizeTouch(l.attributionLast)
      const appt = l.phone ? apptByPhone.get(l.phone) ?? null : null
      const surface = l.bookingSurface ?? appt?.bookingSurface ?? null
      return {
        id: l.id,
        name: (l.message?.match(/^First name: (.+)$/m)?.[1] ?? l.name ?? '').trim(),
        company: l.message?.match(/^Company: (.+)$/m)?.[1]?.trim() ?? '',
        trade: l.message?.match(/^Trade: (.+)$/m)?.[1]?.trim() ?? '',
        phone: l.phone,
        email: l.email,
        status: l.status,
        arm: l.funnelVariant,
        verified: Boolean(l.otpVerifiedAt),
        createdAt: l.createdAt.toISOString(),
        first: first ?? null,
        last: last ?? null,
        firstLabel: first ? describeTouch(first) : null,
        lastLabel: last ? describeTouch(last) : null,
        hasFbclid: Boolean(first?.fbclid || last?.fbclid),
        hasFbp: Boolean(l.fbp),
        hasFbc: Boolean(l.fbc),
        bookingSurface: surface,
        bookedAt: appt?.scheduledAt.toISOString() ?? null,
        journey: describeJourney({ ...(first ? { first } : {}), ...(last ? { last } : {}) }, surface),
      }
    })

    return NextResponse.json({ leads: rows })
  } catch (err) {
    console.error('[admin/funnel-leads] failed:', err)
    return NextResponse.json({ error: 'Failed to load leads' }, { status: 500 })
  }
}
