// ===========================================
// GATE FILTERS — keep agencies off the calendar and off the pixel
// ===========================================
// Two marketing agencies booked demo calls on 2026-09-09. They passed the trade
// gate because there was no option that described them, so they fired Lead and
// Schedule and the ad set began optimising toward more of them. An agency lead
// is worse than no lead: it costs a calendar slot AND teaches Meta to buy more.
//
// Pure and dependency-free so the modal and the API route share one list and
// one regex. Client-safe: no DB, no env, no server imports.

/** Stored value of the agency dead-end option. */
export const AGENCY = 'agency'
export const AGENCY_LABEL = 'Marketing agency, software, or consultant'

/** The one trade that reveals a free-text box. */
export const OTHER_TRADE = 'Other home service'

/**
 * Typed answers that mean "I sell to contractors" rather than "I am one".
 *
 * Edited here and nowhere else. Ordered roughly by how often they showed up in
 * the two agency submissions, not alphabetically, so the reason for each is
 * still legible.
 */
export const BLOCKED_KEYWORDS = [
  'agency',
  'agencies',
  'marketing',
  'marketer',
  'lead gen',
  'lead generation',
  'leads',
  'saas',
  'software',
  'app',
  'consultant',
  'consulting',
  'automation',
  'automations',
  'ai',
  'chatbot',
  'white label',
  'whitelabel',
  'reseller',
  'seo',
  'ads',
  'advertising',
  'funnel',
  'funnels',
  'crm',
  'coach',
  'coaching',
  'media',
] as const

/** Regex-escape, so a keyword containing punctuation can never alter the pattern. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Whole-word, case-insensitive, longest-first.
 *
 * Word boundaries are the whole point: without them "ai" matches "painting",
 * "ads" matches "roads", "app" matches "appliance" and "seo" would be safe only
 * by luck. Every one of those is a real contractor being turned away, which is
 * a far worse outcome than an agency getting through.
 *
 * Multi-word entries ("lead gen") are sorted first so the alternation prefers
 * the longer match; with \b on both ends either would match, but this keeps the
 * matched text accurate when the pattern is used for reporting.
 */
export const BLOCKED_KEYWORD_REGEX = new RegExp(
  `\\b(${[...BLOCKED_KEYWORDS]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegex)
    .join('|')})\\b`,
  'i'
)

/**
 * Does this free-text trade describe someone selling to contractors?
 * Returns the matched keyword so the block can be audited, or null.
 */
export function matchBlockedKeyword(text: string | null | undefined): string | null {
  const t = (text ?? '').trim()
  if (!t) return null
  const m = BLOCKED_KEYWORD_REGEX.exec(t)
  return m ? m[1].toLowerCase() : null
}

export function isBlockedTradeText(text: string | null | undefined): boolean {
  return matchBlockedKeyword(text) !== null
}

/** Max length of the "what kind of work do you do?" box, client and server. */
export const TRADE_OTHER_MAX = 60
