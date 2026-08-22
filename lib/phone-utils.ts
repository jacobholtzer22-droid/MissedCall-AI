// ===========================================
// PHONE NUMBER NORMALIZATION
// ===========================================
// Normalizes phone numbers for comparison (handles +1, dashes, spaces, parentheses)
// US numbers: "+1 (555) 123-4567", "555-123-4567", "5551234567" → "5551234567"

/**
 * Normalize a phone number to a canonical form for comparison.
 * Strips all non-digits, then for US numbers (10 or 11 digits):
 * - 11 digits starting with 1 → last 10 digits
 * - 10 digits → as-is
 * - Other lengths → digits only (international)
 */
export function normalizePhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.slice(1)
  }
  return digits
}

/**
 * Normalize a phone number to E.164 format (+1XXXXXXXXXX for US).
 * Use this when storing or comparing with external APIs like Telnyx.
 */
export function normalizeToE164(phone: string | undefined | null): string {
  if (!phone || typeof phone !== 'string') return ''
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  if (digits.length >= 10) return `+1${digits.slice(-10)}`
  return ''
}

/**
 * Check if two phone numbers refer to the same number (normalized comparison).
 */
export function phonesMatch(a: string, b: string): boolean {
  const na = normalizePhoneNumber(a)
  const nb = normalizePhoneNumber(b)
  if (na.length >= 10 && nb.length >= 10) {
    return na.slice(-10) === nb.slice(-10)
  }
  return na === nb
}

// ===========================================
// US MOBILE VALIDATION
// ===========================================
// normalizeToE164 is lenient by design: it returns '' for junk rather than
// throwing, which is right for matching but wrong for accepting user input.
// A lead once submitted "McGee" as their mobile, which normalized to '' and
// produced a booking with no confirmation SMS and no reminders.
//
// Use validateUsMobile for anything a human types. It is the single source of
// truth for both the /book client and the API routes, so the inline error the
// visitor sees and the server's rejection reason always agree.

export type PhoneValidation = { ok: true; e164: string } | { ok: false; reason: string }

const CONTAINS_LETTERS = /[A-Za-z]/

export function validateUsMobile(raw: string | null | undefined): PhoneValidation {
  const input = typeof raw === 'string' ? raw.trim() : ''
  if (!input) {
    return { ok: false, reason: 'Please enter your mobile number.' }
  }
  if (CONTAINS_LETTERS.test(input)) {
    return { ok: false, reason: 'Numbers only please. Letters are not a phone number.' }
  }

  const digits = input.replace(/\D/g, '')
  const national = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits

  if (national.length !== 10) {
    return { ok: false, reason: 'Enter a 10 digit US mobile number, like (555) 123-4567.' }
  }

  const areaCode = national.slice(0, 3)
  const exchange = national.slice(3, 6)

  // NANP: area code and exchange both have to start 2-9.
  if (areaCode[0] === '0' || areaCode[0] === '1') {
    return { ok: false, reason: 'That area code is not valid. Check the number and try again.' }
  }
  if (exchange[0] === '0' || exchange[0] === '1') {
    return { ok: false, reason: 'That does not look like a valid US number. Check it and try again.' }
  }
  // N11 service codes (411, 911, ...) are not assignable area codes.
  if (areaCode[1] === '1' && areaCode[2] === '1') {
    return { ok: false, reason: 'That area code is not valid. Check the number and try again.' }
  }
  // All one digit, e.g. 0000000000 / 1111111111.
  if (/^(\d)\1{9}$/.test(national)) {
    return { ok: false, reason: 'That does not look like a real number. Check it and try again.' }
  }
  // 555-0100 through 555-0199 are reserved for fiction.
  if (exchange === '555' && national.slice(6, 8) === '01') {
    return { ok: false, reason: 'That is a placeholder number. Enter your real mobile so I can text you.' }
  }

  return { ok: true, e164: `+1${national}` }
}

/** Convenience wrapper for audits and filters. */
export function isValidUsMobile(raw: string | null | undefined): boolean {
  return validateUsMobile(raw).ok
}
