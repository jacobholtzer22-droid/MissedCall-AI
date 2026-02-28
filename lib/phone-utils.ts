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
