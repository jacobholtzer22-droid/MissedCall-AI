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

// ===========================================
// FIRST / LAST TOUCH
// ===========================================
// The block above is the original single-shot capture: whatever was on the URL
// at the moment of the landing view, flattened into a notes string. It could
// only ever answer "what was on this link", which is why every organic and
// every returning visitor read as "untagged" — no UTM on the URL meant no
// signal at all, even when document.referrer said Facebook plainly.
//
// What follows keeps two touches per person instead: the first visit that
// carried ANY signal, and the most recent visit of any kind. Stored as JSON on
// the lead and the booking, so a lead can be read months later without
// reconstructing it from a text blob.

/** Referrer buckets. Anything unrecognised falls through to its hostname. */
export const REFERRER_DIRECT = 'direct'
export const REFERRER_FACEBOOK = 'facebook_referral'
export const REFERRER_INSTAGRAM = 'instagram_referral'
export const REFERRER_GOOGLE = 'google_organic'

const FACEBOOK_HOSTS = new Set([
  'facebook.com', 'www.facebook.com', 'l.facebook.com', 'lm.facebook.com',
  'm.facebook.com', 'web.facebook.com', 'business.facebook.com',
  'fb.com', 'www.fb.com', 'fb.me',
])
const INSTAGRAM_HOSTS = new Set([
  'instagram.com', 'www.instagram.com', 'l.instagram.com', 'm.instagram.com',
])

/**
 * Classify document.referrer.
 *
 * Host matching is exact against a set, NOT `includes('facebook.com')`: a
 * substring test says yes to `facebook.com.phishing.example`, and an attacker
 * choosing their own hostname should not get to label themselves as our best
 * performing channel.
 *
 * Google is matched on the `google.` prefix plus a public suffix, so google.de
 * and google.co.uk classify with google.com instead of leaking dozens of
 * one-row buckets into the report.
 */
export function classifyReferrer(referrer: string | null | undefined): string {
  const raw = (referrer ?? '').trim()
  if (!raw) return REFERRER_DIRECT
  let host: string
  try {
    host = new URL(raw).hostname.toLowerCase().replace(/^www\d*\./, 'www.')
  } catch {
    return REFERRER_DIRECT
  }
  if (!host) return REFERRER_DIRECT
  if (FACEBOOK_HOSTS.has(host)) return REFERRER_FACEBOOK
  if (INSTAGRAM_HOSTS.has(host)) return REFERRER_INSTAGRAM
  if (/^(www\.)?google\.[a-z.]{2,}$/.test(host)) return REFERRER_GOOGLE
  return host.slice(0, MAX_VALUE_LENGTH)
}

/** True when the referrer is our own site: a same-origin hop, not a channel. */
export function isSelfReferral(referrer: string | null | undefined, selfHost: string): boolean {
  try {
    return new URL((referrer ?? '').trim()).hostname.toLowerCase() === selfHost.toLowerCase()
  } catch {
    return false
  }
}

export type AttributionTouch = {
  source?: string
  medium?: string
  campaign?: string
  content?: string
  term?: string
  fbclid?: string
  /** Output of classifyReferrer. Always set, "direct" when there was none. */
  referrer?: string
  /** Funnel arm the visit landed on. */
  arm?: string
  /** Path landed on, so "booked from landing" is answerable later. */
  path?: string
  /** ISO 8601. */
  ts?: string
}

const TOUCH_KEYS: (keyof AttributionTouch)[] = [
  'source', 'medium', 'campaign', 'content', 'term',
  'fbclid', 'referrer', 'arm', 'path', 'ts',
]

export type AttributionPair = { first?: AttributionTouch; last?: AttributionTouch }

/** Medium stamped on the links we text. Never allowed to become first touch. */
export const RETURN_MEDIUM = 'funnel_return'

function clean(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const v = value.replace(/[\r\n]+/g, ' ').trim().slice(0, MAX_VALUE_LENGTH)
  return v || undefined
}

/** Build a touch from a query string plus the referrer. Pure; runs both sides. */
export function buildTouch(input: {
  search: string
  referrer?: string | null
  arm?: string | null
  path?: string | null
  now?: Date
}): AttributionTouch {
  const params = new URLSearchParams(
    input.search.startsWith('?') ? input.search.slice(1) : input.search
  )
  const touch: AttributionTouch = {
    source: clean(params.get('utm_source')),
    medium: clean(params.get('utm_medium')),
    campaign: clean(params.get('utm_campaign')),
    content: clean(params.get('utm_content')),
    term: clean(params.get('utm_term')),
    fbclid: clean(params.get('fbclid')),
    referrer: classifyReferrer(input.referrer),
    arm: clean(input.arm) ?? undefined,
    path: clean(input.path) ?? undefined,
    ts: (input.now ?? new Date()).toISOString(),
  }
  for (const k of TOUCH_KEYS) if (touch[k] === undefined) delete touch[k]
  return touch
}

/**
 * Does this visit carry anything worth calling a source?
 *
 * A bare visit with no UTM, no fbclid and no referrer is "direct", which is a
 * perfectly good LAST touch but must never claim to be the first: overwriting
 * a Facebook ad with "direct" because someone typed the URL on their laptop the
 * next morning is exactly the data loss this whole change exists to stop.
 */
export function touchHasSignal(t: AttributionTouch | null | undefined): boolean {
  if (!t) return false
  if (t.medium === RETURN_MEDIUM) return false // our own SMS, never a first touch
  return Boolean(
    t.source || t.medium || t.campaign || t.content || t.term || t.fbclid ||
      (t.referrer && t.referrer !== REFERRER_DIRECT)
  )
}

/** Merge a new visit into the stored pair. First touch is immutable. */
export function mergeTouch(existing: AttributionPair | null | undefined, next: AttributionTouch): AttributionPair {
  const pair: AttributionPair = { ...(existing ?? {}) }
  pair.last = next
  if (!pair.first && touchHasSignal(next)) pair.first = next
  return pair
}

/** Untrusted input from a cookie or a request body. Known keys, strings only. */
export function sanitizeTouch(input: unknown): AttributionTouch | undefined {
  if (!input || typeof input !== 'object') return undefined
  const raw = input as Record<string, unknown>
  const out: AttributionTouch = {}
  for (const k of TOUCH_KEYS) {
    const v = clean(raw[k])
    if (v) out[k] = v
  }
  return Object.keys(out).length ? out : undefined
}

export function sanitizePair(input: unknown): AttributionPair {
  if (!input || typeof input !== 'object') return {}
  const raw = input as Record<string, unknown>
  const out: AttributionPair = {}
  const first = sanitizeTouch(raw.first)
  const last = sanitizeTouch(raw.last)
  if (first) out.first = first
  if (last) out.last = last
  return out
}

/**
 * Meta's _fbc cookie, built from an fbclid when the browser never set one.
 * Format: fb.<subdomainIndex>.<creationTimeMs>.<fbclid>. Index 1 is what Meta's
 * own snippet writes for a normal www host.
 */
export function buildFbc(fbclid: string | null | undefined, now = Date.now()): string | null {
  const id = clean(fbclid)
  return id ? `fb.1.${now}.${id}` : null
}

// ── Human-readable readout ────────────────────────────────────────────────
// These exist so the admin never renders a raw JSON blob, and so "untagged" is
// never the answer: every branch below names something concrete.

const CHANNEL_NAMES: Record<string, string> = {
  [REFERRER_FACEBOOK]: 'Facebook',
  [REFERRER_INSTAGRAM]: 'Instagram',
  [REFERRER_GOOGLE]: 'Google search',
  [REFERRER_DIRECT]: 'direct',
}

function shortDate(ts?: string): string {
  if (!ts) return ''
  const d = new Date(ts)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** "Facebook ad aa_founder_v1", "Google search", "direct". Never blank. */
export function describeTouch(t: AttributionTouch | null | undefined): string {
  if (!t) return 'no signal captured'
  const channel =
    t.source ??
    (t.fbclid ? 'Facebook' : undefined) ??
    (t.referrer ? CHANNEL_NAMES[t.referrer] ?? t.referrer : undefined) ??
    'direct'
  const kind = t.medium === RETURN_MEDIUM ? 'our text' : t.medium
  const named = t.campaign ?? t.content ?? t.term
  const parts = [channel]
  if (kind && kind !== channel) parts.push(kind)
  if (named) parts.push(named)
  return parts.join(' ')
}

const SURFACE_NAMES: Record<string, string> = {
  landing: 'the landing calendar',
  watch: 'the watch page calendar',
  calendar: 'a texted calendar link',
}

/**
 * One sentence, e.g.
 * "First saw us via Facebook ad aa_founder_tirekicker_v1 on Sep 3, returned
 *  direct on Sep 3, booked from the landing calendar."
 */
export function describeJourney(pair: AttributionPair | null | undefined, bookingSurface?: string | null): string {
  const first = pair?.first
  const last = pair?.last
  if (!first && !last) return 'No attribution captured for this lead.'

  const parts: string[] = []
  const opener = first ?? last!
  parts.push(`First saw us via ${describeTouch(opener)}${shortDate(opener.ts) ? ` on ${shortDate(opener.ts)}` : ''}`)

  // Only worth a clause when the return is a different visit from the first.
  if (last && last.ts !== opener.ts) {
    parts.push(`returned ${describeTouch(last)}${shortDate(last.ts) ? ` on ${shortDate(last.ts)}` : ''}`)
  }
  if (bookingSurface) {
    parts.push(`booked from ${SURFACE_NAMES[bookingSurface] ?? bookingSurface}`)
  }
  return `${parts.join(', ')}.`
}

/**
 * UTMs stamped on every link we send by text.
 *
 * Kept here rather than at each call site so the three senders (the post-OTP
 * demo text, the follow-up text, and the AI's booking reply) cannot drift into
 * three different spellings of the same channel — which would split one
 * channel across three rows in every report.
 *
 * medium is RETURN_MEDIUM on purpose: touchHasSignal() refuses it as a first
 * touch, so our own follow-up can never take credit for finding someone.
 */
export function withSmsUtms(url: string, arm?: string | null): string {
  try {
    const u = new URL(url)
    u.searchParams.set('utm_source', 'sms')
    u.searchParams.set('utm_medium', RETURN_MEDIUM)
    u.searchParams.set('utm_campaign', (arm ?? 'unassigned').toString().toLowerCase())
    return u.toString()
  } catch {
    return url
  }
}
