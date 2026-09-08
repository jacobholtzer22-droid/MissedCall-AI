/**
 * Create the missing lead row for bookings that never had one.
 *
 *   npx tsx --env-file=.env.local scripts/backfill-booking-leads.ts
 *   npx tsx --env-file=.env.local scripts/backfill-booking-leads.ts --apply
 *
 * The landing calendar takes people who never touched the gate, and until the
 * booking-leads change those bookings existed as an Appointment and nothing
 * else: absent from /admin/leads, with no attribution attached to a name.
 *
 * Everything here comes off the Appointment row — name, phone, email, company,
 * arm, surface, and the booked slot. Attribution is copied from the appointment
 * when it has some. When it does not, the row says "direct" and says plainly
 * that it was backfilled, because the aa_attr cookie is gone and Vercel keeps no
 * historical request logs to recover it from.
 */

import { db } from '@/lib/db'
import { getMarketingBusiness, findPartialLeadByPhone } from '@/lib/marketing-funnel'
import { sanitizeTouch, describeJourney, type AttributionTouch } from '@/lib/attribution'

const APPLY = process.argv.includes('--apply')
const SINCE = new Date('2026-09-01T00:00:00.000Z')

function noteField(notes: string | null, key: string): string {
  return notes?.match(new RegExp(`^${key}: (.+)$`, 'm'))?.[1]?.trim() ?? ''
}

async function main() {
  const business = await getMarketingBusiness()
  if (!business) throw new Error('no marketing business configured')

  const appts = await db.appointment.findMany({
    where: { businessId: business.id, createdAt: { gte: SINCE }, status: { not: 'cancelled' } },
    orderBy: { createdAt: 'asc' },
  })

  let created = 0
  let skipped = 0

  for (const a of appts) {
    const existing = await findPartialLeadByPhone(business.id, a.customerPhone)
    const anyLead =
      existing ??
      (await db.websiteLead.findFirst({
        where: { businessId: business.id, phone: a.customerPhone },
        orderBy: { createdAt: 'desc' },
      }))
    if (anyLead) {
      console.log(`${a.customerPhone}  ${a.customerName.padEnd(12)} already has lead ${anyLead.id} — skipped`)
      skipped++
      continue
    }

    const first = sanitizeTouch(a.attributionFirst)
    const last = sanitizeTouch(a.attributionLast)
    const company = noteField(a.notes, 'Company')
    const trade = noteField(a.notes, 'Trade')
    const variant = a.variant ?? (noteField(a.notes, 'Variant') || null)
    const surface = a.bookingSurface ?? (a.source === 'website' ? 'watch' : 'calendar')

    // No captured touch: say direct, and say why it says direct.
    const backfilledTouch: AttributionTouch | undefined = first
      ? undefined
      : {
          referrer: 'direct',
          arm: a.funnelVariant ?? undefined,
          ts: a.createdAt.toISOString(),
        }

    const journey = first
      ? describeJourney({ ...(first ? { first } : {}), ...(last ? { last } : {}) }, surface)
      : `No attribution was captured at the time of this booking. Recorded as direct.`

    const message = [
      surface === 'landing'
        ? 'Booked straight from the landing calendar (no gate).'
        : 'Booked from the funnel.',
      '',
      `Trade: ${trade || 'not collected on this path'}`,
      `First name: ${a.customerName}`,
      `Phone: ${a.customerPhone}`,
      `Email: ${a.customerEmail ?? 'not given'}`,
      company ? `Company: ${company}` : null,
      `Funnel arm: ${a.funnelVariant ?? 'unassigned'}`,
      `Booking surface: ${surface}`,
      `Source: meta_demo_video`,
      '',
      journey,
      '',
      `BOOKED ${a.scheduledAt.toISOString()} (see appointment ${a.id}).`,
      '',
      'Lead row backfilled 2026-09-08: this booking came through the landing',
      'calendar before bookings created lead rows, so nothing existed for it in',
      '/admin/leads. Fields are recovered from the appointment record. The',
      'aa_attr cookie is long gone and Vercel keeps no historical request logs,',
      'so the touch below is a placeholder, not a measurement.',
    ]
      .filter((l) => l !== null)
      .join('\n')

    console.log(
      `${APPLY ? 'WRITE' : 'PLAN '} ${a.customerPhone}  ${a.customerName.padEnd(12)} ` +
        `company="${company}" arm=${a.funnelVariant ?? '-'} surface=${surface} ` +
        `attribution=${first ? 'from appointment' : 'BACKFILLED direct'}`
    )

    if (APPLY) {
      const row = await db.websiteLead.create({
        data: {
          businessId: business.id,
          name: a.customerName,
          phone: a.customerPhone,
          email: a.customerEmail,
          message,
          status: 'converted',
          variant,
          funnelVariant: a.funnelVariant,
          bookingSurface: surface,
          ...(first ? { attributionFirst: first } : backfilledTouch ? { attributionFirst: backfilledTouch } : {}),
          ...(last ? { attributionLast: last } : backfilledTouch ? { attributionLast: backfilledTouch } : {}),
        },
      })
      console.log(`         lead ${row.id}`)
    }
    created++
  }

  console.log('\n' + JSON.stringify({ mode: APPLY ? 'APPLIED' : 'DRY RUN', created, skipped }, null, 1))
}

main().finally(() => db.$disconnect())
