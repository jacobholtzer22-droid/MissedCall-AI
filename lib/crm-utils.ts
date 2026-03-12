// ===========================================
// CRM UTILS - Find or create contact and log activity
// ===========================================

import { db } from '@/lib/db'
import { normalizePhoneNumber, normalizeToE164, phonesMatch } from '@/lib/phone-utils'

const PLACEHOLDER_PHONE_PREFIX = '__email_only__'

export type FindOrCreateContactParams = {
  businessId: string
  phoneNumber?: string | null
  email?: string | null
  name?: string | null
  source: string
  address?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  notes?: string | null
}

/**
 * Find an existing contact by phone first, then by email.
 * Returns null if neither phone nor email match (and we have nothing to create with).
 */
async function findExistingContact(
  businessId: string,
  phoneNumber: string | undefined | null,
  email: string | undefined | null
): Promise<{ id: string; phoneNumber: string; email: string | null; name: string | null; address: string | null; city: string | null; state: string | null; zip: string | null; notes: string | null } | null> {
  const normalizedPhone = phoneNumber?.trim() ? normalizePhoneNumber(phoneNumber.trim()) : null
  const hasPhone = normalizedPhone && normalizedPhone.length >= 10
  const hasEmail = email?.trim() ?? null

  if (hasPhone) {
    const contacts = await db.contact.findMany({ where: { businessId } })
    const match = contacts.find((c) => phonesMatch(phoneNumber!, c.phoneNumber))
    if (match) {
      return {
        id: match.id,
        phoneNumber: match.phoneNumber,
        email: match.email,
        name: match.name,
        address: match.address,
        city: match.city,
        state: match.state,
        zip: match.zip,
        notes: match.notes,
      }
    }
  }

  if (hasEmail) {
    const byEmail = await db.contact.findFirst({
      where: { businessId, email: hasEmail.trim() },
    })
    if (byEmail) {
      return {
        id: byEmail.id,
        phoneNumber: byEmail.phoneNumber,
        email: byEmail.email,
        name: byEmail.name,
        address: byEmail.address,
        city: byEmail.city,
        state: byEmail.state,
        zip: byEmail.zip,
        notes: byEmail.notes,
      }
    }
  }

  return null
}

/**
 * Activity type labels for descriptions.
 */
function activityDescription(type: string, source: string): string {
  const labels: Record<string, string> = {
    missed_call: 'New lead from missed call',
    website_form: 'Contact form submission',
    sms_conversation: 'SMS conversation',
    voicemail: 'Voicemail received',
    manual: 'Added manually',
    referral: 'Referral',
    google_ad: 'Lead from Google ad',
  }
  return labels[type] ?? `${type.replace(/_/g, ' ')}`
}

/**
 * Find or create a contact for the business, then create an Activity record.
 * - Tries to find by phoneNumber first, then by email.
 * - If found: updates only fields that are not already set; sets lastContactedAt to now.
 * - If not found: creates Contact with provided fields, status 'new', and source.
 * - Always creates an Activity for the business/contact with the given type and a description.
 * Returns the contact record. Does not throw; logs errors and returns null on DB failure.
 */
export async function findOrCreateContact(
  params: FindOrCreateContactParams
): Promise<{ id: string; phoneNumber: string; name: string | null; email: string | null; source: string | null } | null> {
  const {
    businessId,
    phoneNumber: rawPhone,
    email,
    name,
    source,
    address,
    city,
    state,
    zip,
    notes,
  } = params

  const hasPhone = rawPhone?.trim() && normalizePhoneNumber(rawPhone.trim()).length >= 10
  const hasEmail = email?.trim()
  if (!hasPhone && !hasEmail) {
    return null
  }

  try {
    const existing = await findExistingContact(businessId, rawPhone ?? null, email ?? null)

    if (existing) {
      const updates: {
        name?: string
        email?: string
        address?: string
        city?: string
        state?: string
        zip?: string
        notes?: string
        lastContactedAt: Date
      } = {
        lastContactedAt: new Date(),
      }
      if (name?.trim() && !existing.name) updates.name = name.trim()
      if (hasEmail && !existing.email) updates.email = email!.trim()
      if (address?.trim() && !existing.address) updates.address = address.trim()
      if (city?.trim() && !existing.city) updates.city = city.trim()
      if (state?.trim() && !existing.state) updates.state = state.trim()
      if (zip?.trim() && !existing.zip) updates.zip = zip.trim()
      if (notes?.trim()) {
        const newNotes = existing.notes ? `${existing.notes}\n\n${notes.trim()}` : notes.trim()
        updates.notes = newNotes
      }

      const updated = await db.contact.update({
        where: { id: existing.id },
        data: updates,
      })

      await db.activity.create({
        data: {
          businessId,
          contactId: updated.id,
          type: source,
          description: activityDescription(source, source),
          metadata: null,
        },
      })

      return {
        id: updated.id,
        phoneNumber: updated.phoneNumber,
        name: updated.name,
        email: updated.email,
        source: updated.source,
      }
    }

    const phoneForCreate = hasPhone
      ? normalizeToE164(rawPhone!.trim()) || rawPhone!.trim()
      : `${PLACEHOLDER_PHONE_PREFIX}${Date.now().toString(36)}`

    const contact = await db.contact.create({
      data: {
        businessId,
        phoneNumber: phoneForCreate,
        name: name?.trim() || null,
        email: hasEmail ? email!.trim() : null,
        address: address?.trim() || null,
        city: city?.trim() || null,
        state: state?.trim() || null,
        zip: zip?.trim() || null,
        notes: notes?.trim() || null,
        source,
        status: 'new',
        lastContactedAt: new Date(),
      },
    })

    await db.activity.create({
      data: {
        businessId,
        contactId: contact.id,
        type: source,
        description: activityDescription(source, source),
        metadata: null,
      },
    })

    return {
      id: contact.id,
      phoneNumber: contact.phoneNumber,
      name: contact.name,
      email: contact.email,
      source: contact.source,
    }
  } catch (err) {
    console.error('[findOrCreateContact]', err)
    return null
  }
}
