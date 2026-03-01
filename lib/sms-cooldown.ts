// ===========================================
// SMS COOLDOWN - Prevents sending automated messages
// to the same contact within a configurable period (default 7 days)
// ===========================================
// Applied to: missed call SMS, AI-initiated follow-ups
// NOT applied to: manual messages, compliance responses (STOP confirmation)

import { db } from '@/lib/db'
import { phonesMatch } from '@/lib/phone-utils'

const DEFAULT_COOLDOWN_DAYS = 7
const ENV_COOLDOWN_DAYS = process.env.SMS_COOLDOWN_DAYS
  ? parseInt(process.env.SMS_COOLDOWN_DAYS, 10)
  : null

export interface CooldownCheckResult {
  allowed: boolean
  lastMessageSent?: Date
}

/**
 * Get the cooldown period in days for a business.
 * Priority: business.smsCooldownDays > env SMS_COOLDOWN_DAYS > default 7
 */
/**
 * Check if the caller's number is in the business's cooldown bypass list.
 * Used for admin/testing — bypass numbers skip cooldown but still respect blocked/contacts.
 */
export function isCooldownBypassNumber(
  callerPhone: string,
  cooldownBypassNumbers: unknown
): boolean {
  const list = Array.isArray(cooldownBypassNumbers) ? cooldownBypassNumbers : []
  if (list.length === 0) return false
  return list.some(
    (entry) => typeof entry === 'string' && entry.trim() && phonesMatch(callerPhone, entry.trim())
  )
}

/**
 * Get the cooldown period in days for a business.
 * Priority: business.smsCooldownDays > env SMS_COOLDOWN_DAYS > default 7
 */
export function getCooldownDays(business: { smsCooldownDays?: number | null } | null): number {
  if (business?.smsCooldownDays != null && business.smsCooldownDays > 0) {
    return business.smsCooldownDays
  }
  if (ENV_COOLDOWN_DAYS != null && ENV_COOLDOWN_DAYS > 0) {
    return ENV_COOLDOWN_DAYS
  }
  return DEFAULT_COOLDOWN_DAYS
}

/**
 * Check if we can send an automated message to this phone number.
 * Returns { allowed: true } if OK to send, { allowed: false, lastMessageSent } if in cooldown.
 */
export async function checkCooldown(
  businessId: string,
  phoneNumber: string,
  business?: { smsCooldownDays?: number | null } | null
): Promise<CooldownCheckResult> {
  const cooldownDays = getCooldownDays(business ?? null)
  const cutoff = new Date(Date.now() - cooldownDays * 24 * 60 * 60 * 1000)

  const record = await db.contactCooldown.findUnique({
    where: {
      businessId_phoneNumber: { businessId, phoneNumber },
    },
  })

  if (!record) {
    return { allowed: true }
  }

  if (record.lastMessageSent >= cutoff) {
    return { allowed: false, lastMessageSent: record.lastMessageSent }
  }

  return { allowed: true }
}

/**
 * Record that we sent an automated message to this phone number.
 * Call this AFTER successfully sending.
 */
export async function recordMessageSent(
  businessId: string,
  phoneNumber: string
): Promise<void> {
  await db.contactCooldown.upsert({
    where: {
      businessId_phoneNumber: { businessId, phoneNumber },
    },
    create: {
      businessId,
      phoneNumber,
      lastMessageSent: new Date(),
    },
    update: {
      lastMessageSent: new Date(),
    },
  })
}

/**
 * Log that a message was skipped due to cooldown.
 * Use for analytics / cost savings tracking.
 */
export async function logCooldownSkip(
  businessId: string,
  phoneNumber: string,
  lastMessageSent: Date,
  messageType?: string
): Promise<void> {
  try {
    await db.cooldownSkipLog.create({
      data: {
        businessId,
        phoneNumber,
        lastMessageSent,
        messageType: messageType ?? null,
      },
    })
    console.log('💰 COOLDOWN_SKIP: Message not sent (within cooldown period)', {
      businessId,
      phoneNumber,
      lastMessageSent: lastMessageSent.toISOString(),
      messageType: messageType ?? 'automated',
    })
  } catch (err) {
    console.error('Failed to log cooldown skip:', err)
  }
}
