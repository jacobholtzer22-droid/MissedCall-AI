// ===========================================
// SMS OPT-OUT CHECK (marketing funnel sends)
// ===========================================
// A STOP on a business's number writes a BlockedNumber row for that business
// (app/api/webhooks/sms, label 'sms-opt-out'; an admin block with any other
// label counts too). Every automated text to a lead must check it before
// sending: until this existed only the reminder cron did, so a lead who replied
// STOP to the first text could still get the 24h follow-up and a booking
// confirmation.
//
// Fails CLOSED: if the lookup errors, the caller is told the number is opted
// out and the send is skipped and logged. Texting someone who said STOP is the
// worse failure.

import { db } from '@/lib/db'
import { normalizeToE164, phonesMatch } from '@/lib/phone-utils'

export async function isOptedOut(businessId: string, phone: string, context: string): Promise<boolean> {
  try {
    const e164 = normalizeToE164(phone)
    const exact = await db.blockedNumber.findFirst({ where: { businessId, phoneNumber: e164 }, select: { id: true } })
    if (exact) return true
    // Rows stored in another format (admin-entered blocks).
    const all = await db.blockedNumber.findMany({ where: { businessId }, select: { phoneNumber: true }, take: 500 })
    return all.some((b) => phonesMatch(b.phoneNumber, phone))
  } catch (err) {
    console.error(
      `[sms-opt-out] lookup FAILED, treating as opted out ${context} error=${err instanceof Error ? err.message : String(err)}`
    )
    return true
  }
}
