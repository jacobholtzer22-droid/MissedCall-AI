// ===========================================
// AD ATTRIBUTION (UTM + fbclid)
// ===========================================
// Captured on the /book landing view, carried through funnel state, and written
// into the notes text of both the partial WebsiteLead and the Appointment.
//
// Deliberately stored as a formatted text block rather than columns: this repo
// has no prisma/migrations baseline, so adding real columns means a live
// `prisma db push`. Follow-up ticket is to baseline migrations, then promote
// these to first-class columns.

export const ATTRIBUTION_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'fbclid',
] as const

export type AttributionKey = (typeof ATTRIBUTION_KEYS)[number]
export type Attribution = Partial<Record<AttributionKey, string>>

const MAX_VALUE_LENGTH = 200

/** Read attribution params off a query string. Client-side, on landing view. */
export function parseAttribution(search: string): Attribution {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const out: Attribution = {}
  for (const key of ATTRIBUTION_KEYS) {
    const value = params.get(key)
    if (value && value.trim()) out[key] = value.trim().slice(0, MAX_VALUE_LENGTH)
  }
  return out
}

/**
 * Server-side cleanup of client-supplied attribution. The funnel posts this
 * back to us, so treat it as untrusted: known keys only, strings only, no
 * newlines (they would corrupt the notes block), length capped.
 */
export function sanitizeAttribution(input: unknown): Attribution {
  if (!input || typeof input !== 'object') return {}
  const raw = input as Record<string, unknown>
  const out: Attribution = {}
  for (const key of ATTRIBUTION_KEYS) {
    const value = raw[key]
    if (typeof value !== 'string') continue
    const clean = value.replace(/[\r\n]+/g, ' ').trim().slice(0, MAX_VALUE_LENGTH)
    if (clean) out[key] = clean
  }
  return out
}

export function hasAttribution(a: Attribution | null | undefined): boolean {
  return Boolean(a && ATTRIBUTION_KEYS.some((k) => a[k]))
}

/** Multi-line block for notes fields and owner email. */
export function formatAttributionBlock(a: Attribution | null | undefined): string {
  if (!hasAttribution(a)) return 'Attribution: none (direct or untagged link)'
  const lines = ATTRIBUTION_KEYS.filter((k) => a![k]).map((k) => `  ${k}: ${a![k]}`)
  return ['Attribution:', ...lines].join('\n')
}

/** Compact single line for owner SMS, where length matters. */
export function formatAttributionLine(a: Attribution | null | undefined): string {
  if (!hasAttribution(a)) return 'Source: direct'
  const parts = [a!.utm_source, a!.utm_medium, a!.utm_campaign].filter(Boolean)
  return parts.length ? `Source: ${parts.join(' / ')}` : 'Source: tagged link'
}
