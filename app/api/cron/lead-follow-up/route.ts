// ===========================================
// 24h "still no booking" follow-up
// ===========================================
// One text, once, to a lead who verified their number, got the instant text,
// and never booked. Eligibility is decided here; sendLeadFollowUpSms owns the
// claim and the allowlist suppression.
//
// Deliberately conservative about what counts as "no booking": if we cannot
// prove they have not booked, we do not text.
//
// Only between 11:00 AM and 7:00 PM Eastern (lib/lead-follow-up-window.ts). A
// lead whose 24h mark lands outside that window is picked up by the first
// hourly run after the next 11:00 AM ET, well inside the 72h cap.

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sendLeadFollowUpSms } from '@/lib/lead-sms'
import { isTestPhone } from '@/lib/test-allowlist'
import { getMarketingBusiness } from '@/lib/marketing-funnel'
import { isOptedOut } from '@/lib/sms-opt-out'
import {
  FOLLOW_UP_MAX_AGE_HOURS,
  FOLLOW_UP_MIN_AGE_HOURS,
  followUpDue,
  isInFollowUpWindow,
} from '@/lib/lead-follow-up-window'
import { FOLLOW_UP_EXCLUDED_STATUSES } from './statuses'
import Telnyx from 'telnyx'
import { normalizeToE164 } from '@/lib/phone-utils'
import { leadTouch3Enabled, runLeadTouch3, touch3MessageId, type LeadTouch3Result } from '@/lib/lead-touch-3'

export const dynamic = 'force-dynamic'

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

  // Outside the send window nobody is due, so skip the query entirely. The
  // window is the same for every lead, which is why this can be global.
  if (!isInFollowUpWindow(new Date())) {
    console.log('[cron/lead-follow-up] outside the 11:00 AM to 7:00 PM ET send window, nothing sent')
    return NextResponse.json({ candidates: 0, sent: 0, skipped: 0, errors: [], outsideWindow: true })
  }

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
        lte: new Date(now - FOLLOW_UP_MIN_AGE_HOURS * 3_600_000),
        gte: new Date(now - FOLLOW_UP_MAX_AGE_HOURS * 3_600_000),
      },
      // They must actually have received the first text. A lead whose instant
      // text never dispatched is not owed a "you didn't book" nudge.
      demoSmsSentAt: { not: null },
      followUpSentAt: null,
      phone: { not: null },
      status: { notIn: FOLLOW_UP_EXCLUDED_STATUSES },
      // Marked by hand in /admin as not a contractor. No automated text goes to
      // a lead Jacob has already decided is junk.
      junk: false,
    },
    select: { id: true, phone: true, name: true, message: true, calendarToken: true, otpVerifiedAt: true, funnelVariant: true },
    take: 100,
  })

  let sent = 0
  let skipped = 0
  const errors: string[] = []

  for (const lead of candidates) {
    try {
      // Same rule the query encodes, checked through the tested function so the
      // two cannot drift. Anything failing it here is a query bug, not a lead.
      if (!lead.otpVerifiedAt || !followUpDue(lead.otpVerifiedAt, new Date(now))) {
        skipped++
        continue
      }

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

      // Replied STOP. Checked before the claim so the row is not stamped as
      // followed up; it ages out of the 24 to 72 hour window on its own.
      if (await isOptedOut(business.id, lead.phone as string, `leadId=${lead.id}`)) {
        console.log(`[cron/lead-follow-up] SKIP leadId=${lead.id} reason=opted_out`)
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

      const res = await sendLeadFollowUpSms(lead.id, lead.phone as string, {
        firstName,
        businessName,
        calendarToken: lead.calendarToken,
        // Same expression as the instant text's call site
        // (app/api/demo-lead/wizard/route.ts). Without it the link tagged
        // utm_campaign=unassigned, so every follow-up booking was unattributable
        // to its arm. Copy is unchanged: the arm only sets that one parameter.
        watchArm: lead.funnelVariant === 'B' ? 'B' : 'A',
      })
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

  // LEAD_TOUCH_3_SMS (off by default): the third text, as a second step. Same
  // window (checked above), its own claim. Off: nothing below runs and the
  // response is exactly what it was.
  let touch3: LeadTouch3Result | null = null
  if (leadTouch3Enabled()) {
    touch3 = await runLeadTouch3(touch3Deps(business.id), new Date())
  }

  console.log(`[cron/lead-follow-up] candidates=${candidates.length} sent=${sent} skipped=${skipped} errors=${errors.length}`)
  return NextResponse.json(
    touch3 ? { candidates: candidates.length, sent, skipped, errors, touch3 } : { candidates: candidates.length, sent, skipped, errors }
  )
}

/** The real side effects behind lib/lead-touch-3.ts. Only built when the flag is on. */
function touch3Deps(businessId: string) {
  const from = process.env.MARKETING_TELNYX_NUMBER || null
  return {
    findCandidates: (since: Date, until: Date) =>
      db.websiteLead.findMany({
        where: {
          businessId,
          otpVerifiedAt: { not: null, gte: since, lte: until },
          demoSmsSentAt: { not: null },
          // Touch 2 must have gone out.
          followUpSentAt: { not: null },
          phone: { not: null },
          status: { notIn: FOLLOW_UP_EXCLUDED_STATUSES },
          junk: false,
        },
        select: { id: true, phone: true, name: true, message: true, calendarToken: true, otpVerifiedAt: true, followUpSentAt: true },
        take: 100,
      }),
    isBooked: async (phone: string) =>
      (await db.appointment.count({ where: { customerPhone: phone, status: { not: 'cancelled' } } })) > 0,
    isOptedOut: (phone: string, leadId: string) => isOptedOut(businessId, phone, `leadId=${leadId} touch=3`),
    // The claim IS the outbound log row (see lib/lead-touch-3.ts): a Message
    // with a deterministic id, so a second create fails on the primary key.
    claim: async (lead: { id: string; phone: string | null }, body: string) => {
      const to = normalizeToE164(lead.phone)
      if (!to) return false
      const existing = await db.conversation.findFirst({
        where: { businessId, callerPhone: to },
        orderBy: { lastMessageAt: 'desc' },
        select: { id: true },
      })
      const conversationId =
        existing?.id ??
        (await db.conversation.create({
          data: { businessId, callerPhone: to, status: 'active', lastMessageAt: new Date() },
          select: { id: true },
        })).id
      try {
        await db.message.create({
          data: { id: touch3MessageId(lead.id), conversationId, direction: 'outbound', content: body },
        })
        return true
      } catch {
        return false
      }
    },
    release: async (leadId: string) => {
      await db.message.deleteMany({ where: { id: touch3MessageId(leadId) } })
    },
    send: async (phone: string, body: string) => {
      const to = normalizeToE164(phone)
      if (!from || !process.env.TELNYX_API_KEY) throw new Error('no_sender')
      if (!to) throw new Error('unusable_phone')
      const telnyx = new Telnyx({ apiKey: process.env.TELNYX_API_KEY })
      const res = await telnyx.messages.send({ from, to, text: body })
      return (res as { data?: { id?: string } })?.data?.id ?? null
    },
    recordSent: async (leadId: string, providerId: string | null) => {
      // After the send, and never able to fail it.
      try {
        const row = await db.message.update({
          where: { id: touch3MessageId(leadId) },
          data: { telnyxSid: providerId },
          select: { conversationId: true },
        })
        await db.conversation.update({ where: { id: row.conversationId }, data: { lastMessageAt: new Date() } })
      } catch (err) {
        console.error(`[lead-touch-3] outbound log update FAILED (text was sent) leadId=${leadId}:`, err)
      }
    },
  }
}

export const POST = GET
