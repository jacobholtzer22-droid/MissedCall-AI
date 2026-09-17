// ===========================================
// LEAD EVENT GUARD: one Meta Lead per person
// ===========================================
// Lead is the event the ad sets optimise toward. It can fire from two places:
// OTP success (app/api/demo-lead/wizard) and a booking made on the landing
// calendar, which skips OTP (app/api/demo-book). Both go through this claim
// before EITHER half of the deduped pair (browser pixel, CAPI) fires, and the
// browser half only fires when the server reports the claim was won.
//
// Server-only: imports the DB.

import { db } from '@/lib/db'

export type LeadEventClaim =
  | { claimed: true }
  | { claimed: false; reason: 'already_sent' | 'sibling_already_sent' | 'db_error' }

/**
 * Claim the Lead event for this lead row.
 *
 * Per row is not quite enough. The wizard links to an existing row only while
 * it is still `partial`, so someone who booked on the landing calendar (row now
 * `converted`) and later walks the gate gets a NEW row. Any other row with the
 * same phone that already fired counts, and its stamp is copied across so the
 * new row reads correctly on its own.
 *
 * Fails closed: on a DB error nothing fires. A missed Lead is recoverable; a
 * double-counted one quietly skews what Meta buys.
 */
export async function claimLeadEvent(input: {
  leadId: string
  businessId: string
  phone: string
  eventId: string
}): Promise<LeadEventClaim> {
  try {
    const sibling = await db.websiteLead.findFirst({
      where: {
        businessId: input.businessId,
        phone: input.phone,
        id: { not: input.leadId },
        leadEventSentAt: { not: null },
      },
      select: { id: true, leadEventSentAt: true, leadEventId: true },
    })
    if (sibling) {
      await db.websiteLead.updateMany({
        where: { id: input.leadId, leadEventSentAt: null },
        data: { leadEventSentAt: sibling.leadEventSentAt, leadEventId: sibling.leadEventId },
      })
      console.log(`[lead-event] SKIP leadId=${input.leadId} reason=sibling_already_sent sibling=${sibling.id}`)
      return { claimed: false, reason: 'sibling_already_sent' }
    }

    const claim = await db.websiteLead.updateMany({
      where: { id: input.leadId, leadEventSentAt: null },
      data: { leadEventSentAt: new Date(), leadEventId: input.eventId },
    })
    if (claim.count === 0) {
      console.log(`[lead-event] SKIP leadId=${input.leadId} reason=already_sent`)
      return { claimed: false, reason: 'already_sent' }
    }
    console.log(`[lead-event] CLAIMED leadId=${input.leadId} eventId=${input.eventId}`)
    return { claimed: true }
  } catch (err) {
    console.error(
      `[lead-event] FAILED leadId=${input.leadId} error=${err instanceof Error ? err.message : String(err)}`
    )
    return { claimed: false, reason: 'db_error' }
  }
}
