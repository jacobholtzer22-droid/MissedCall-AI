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
import { isTestPhone } from '@/lib/test-allowlist'
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
      // Keyed on OTP VERIFICATION, never on row creation.
      //
      // A WebsiteLead row can exist before the number is proven — /api/contact
      // writes one for every website submission — so keying on createdAt would
      // eventually text someone who never verified anything. otpVerifiedAt is
      // written only on the bank path, behind a consumed single-use ticket.
      otpVerifiedAt: {
        not: null,
        lte: new Date(now - MIN_AGE_HOURS * 3_600_000),
        gte: new Date(now - MAX_AGE_HOURS * 3_600_000),
      },
      // They must actually have received the first text. A lead whose instant
      // text never dispatched is not owed a "you didn't book" nudge.
      demoSmsSentAt: { not: null },
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

      // Friends and testers are excluded by default. Set
      // FOLLOW_UP_INCLUDE_TEST_NUMBERS=true to chase them too.
      if (isTestPhone(lead.phone) && process.env.FOLLOW_UP_INCLUDE_TEST_NUMBERS !== 'true') {
        skipped++
        continue
      }

      // CLAIM BEFORE SENDING. Two overlapping cron runs can both pass the
      // booking check above; only one can win this conditional update, and the
      // loser never reaches the send. Claiming inside the sender would leave a
      // window where both had already decided to text.
      const claim = await db.websiteLead.updateMany({
        where: { id: lead.id, followUpSentAt: null },
        data: { followUpSentAt: new Date() },
      })
      if (claim.count === 0) {
        skipped++
        continue
      }

      const firstName = (lead.message?.match(/^First name: (.+)$/m)?.[1] ?? lead.name ?? '').trim()
      const businessName = lead.message?.match(/^Company: (.+)$/m)?.[1]?.trim() ?? ''

      const res = await sendLeadFollowUpSms(lead.id, lead.phone as string, { firstName, businessName })
      if (res.sent) {
        sent++
      } else {
        // Release the claim so a later run can retry a send that never left.
        await db.websiteLead.updateMany({ where: { id: lead.id }, data: { followUpSentAt: null } })
        skipped++
      }
    } catch (err) {
      // Per-lead catch: one bad row must not abort the batch.
      errors.push(`${lead.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  console.log(`[cron/lead-follow-up] candidates=${candidates.length} sent=${sent} skipped=${skipped} errors=${errors.length}`)
  return NextResponse.json({ candidates: candidates.length, sent, skipped, errors })
}

export const POST = GET
