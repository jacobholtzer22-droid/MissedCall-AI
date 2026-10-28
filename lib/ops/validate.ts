// ===========================================
// /admin/ops — request body validation
// ===========================================
// Hand-rolled like the rest of the admin API (no zod). Each reader returns the
// value or throws a BadRequest, which the routes turn into a 400.

export class BadRequest extends Error {}

export function readJsonObject(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequest('Body must be a JSON object')
  return body as Record<string, unknown>
}

/** Every key must be in `allowed`; an unknown key is a 400, never ignored. */
export function rejectUnknownKeys(obj: Record<string, unknown>, allowed: readonly string[], label = 'field') {
  const unknown = Object.keys(obj).filter((k) => !allowed.includes(k))
  if (unknown.length > 0) throw new BadRequest(`Unknown ${label}${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}`)
}

/** An optional field: left out (undefined) reads as null, otherwise nullableString. */
export function optionalString(v: unknown, field: string, max = 2000): string | null {
  return v === undefined ? null : nullableString(v, field, max)
}

/** Trimmed string, '' becomes null. */
export function nullableString(v: unknown, field: string, max = 2000): string | null {
  if (v === null) return null
  if (typeof v !== 'string') throw new BadRequest(`${field} must be a string or null`)
  const t = v.trim()
  if (t.length > max) throw new BadRequest(`${field} is longer than ${max} characters`)
  return t || null
}

export function nullableNumber(v: unknown, field: string): number | null {
  if (v === null || v === '') return null
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  if (!Number.isFinite(n) || n < 0) throw new BadRequest(`${field} must be a non-negative number or null`)
  return Math.round(n * 100) / 100
}

export function nullableDate(v: unknown, field: string): Date | null {
  if (v === null || v === '') return null
  if (typeof v !== 'string') throw new BadRequest(`${field} must be an ISO date string or null`)
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) throw new BadRequest(`${field} is not a valid date`)
  return d
}

export function oneOf<T extends string>(v: unknown, allowed: readonly T[], field: string): T {
  if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) {
    throw new BadRequest(`${field} must be one of: ${allowed.join(', ')}`)
  }
  return v as T
}

export function listOf<T extends string>(v: unknown, allowed: readonly T[], field: string): T[] {
  if (!Array.isArray(v)) throw new BadRequest(`${field} must be an array`)
  return Array.from(new Set(v.map((x) => oneOf(x, allowed, field))))
}

export const STRIPE_CUSTOMER_ID = /^cus_[A-Za-z0-9]+$/
