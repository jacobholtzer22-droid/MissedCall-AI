// ===========================================
// CONTACTS CHECK - Skip automated SMS to existing contacts
// ===========================================
// Runs BEFORE cooldown check. If caller is in client's address book, skip SMS.

import { db } from '@/lib/db'
import { normalizePhoneNumber, phonesMatch } from '@/lib/phone-utils'

/**
 * Check if the given phone number exists in the business's contacts list.
 * Uses normalized comparison to handle formatting differences.
 */
export async function isExistingContact(
  businessId: string,
  callerPhone: string
): Promise<boolean> {
  const contacts = await db.contact.findMany({
    where: { businessId },
    select: { phoneNumber: true },
  })
  const normalizedCaller = normalizePhoneNumber(callerPhone)
  if (normalizedCaller.length < 10) return false

  return contacts.some((c) => phonesMatch(callerPhone, c.phoneNumber))
}

/**
 * Log that a message was skipped because the caller is an existing contact.
 * Uses CooldownSkipLog for analytics / cost savings reporting.
 */
export async function logContactSkip(
  businessId: string,
  phoneNumber: string,
  messageType?: string
): Promise<void> {
  try {
    await db.cooldownSkipLog.create({
      data: {
        businessId,
        phoneNumber,
        reason: 'existing_contact',
        lastMessageSent: new Date(0), // N/A - we never sent; required field
        messageType: messageType ?? 'missed_call',
      },
    })
    console.log('📇 CONTACT_SKIP: Message not sent (caller is existing contact)', {
      businessId,
      phoneNumber,
      messageType: messageType ?? 'missed_call',
    })
  } catch (err) {
    console.error('Failed to log contact skip:', err)
  }
}
