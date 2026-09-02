// ===========================================
// 24h "still no booking" follow-up
// ===========================================
// One text, once, to a lead who verified their number, got the instant text,
// and never booked. Eligibility is decided here; sendLeadFollowUpSms owns the
// claim and the allowlist suppression.
//
// Deliberately conservative about what counts as "no booking": if we cannot
// prove they have not booked, we do not text.

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sendLeadFollowUpSms } from '@/lib/lead-sms'
import { getMarketingBusiness } from '@/lib/marketing-funnel'

export const dynamic = 'force-dynamic'

/** Wait a full day, but never chase someone from last week. */
const MIN_AGE_HOURS = 24
const MAX_AGE_HOURS = 72

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return true // matches the other cron routes
  const header = request.headers.get('authorization')
  return header === `Bearer ${secret}`
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const business = await getMarketingBusiness()
  if (!business) return NextResponse.json({ error: 'No marketing business' }, { status: 503 })

  const now = Date.now()
  const candidates = await db.websiteLead.findMany({
    where: {
      businessId: business.id,
      // Verified and already texted once. demoSmsSentAt is the proof the
      // instant text actually dispatched, so a lead whose first text failed is
      // never chased with a second one.
      demoSmsSentAt: {
        not: null,
        lte: new Date(now - MIN_AGE_HOURS * 3_600_000),
        gte: new Date(now - MAX_AGE_HOURS * 3_600_000),
      },
      followUpSentAt: null,
      phone: { not: null },
      status: { not: 'spam' },
    },
    select: { id: true, phone: true, name: true, message: true },
    take: 100,
  })

  let sent = 0
  let skipped = 0
  const errors: string[] = []

  for (const lead of candidates) {
    try {
      // Booked already? Appointment is keyed on the phone, not the lead, so a
      // booking made from a different device still counts.
      const booked = await db.appointment.count({
        where: { customerPhone: lead.phone as string, status: { not: 'cancelled' } },
      })
      if (booked > 0) {
        skipped++
        continue
      }

      const firstName = (lead.message?.match(/^First name: (.+)$/m)?.[1] ?? lead.name ?? '').trim()
      const businessName = lead.message?.match(/^Company: (.+)$/m)?.[1]?.trim() ?? ''

      const res = await sendLeadFollowUpSms(lead.id, lead.phone as string, { firstName, businessName })
      if (res.sent) sent++
      else skipped++
    } catch (err) {
      // Per-lead catch: one bad row must not abort the batch.
      errors.push(`${lead.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  console.log(`[cron/lead-follow-up] candidates=${candidates.length} sent=${sent} skipped=${skipped} errors=${errors.length}`)
  return NextResponse.json({ candidates: candidates.length, sent, skipped, errors })
}

export const POST = GET
