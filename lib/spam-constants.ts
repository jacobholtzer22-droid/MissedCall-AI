// Shared between the server-side scorer and the client-side contact form.
// Deliberately dependency-free so importing it into a client component does not
// pull lib/spam-score.ts (and Prisma-adjacent server code) into the browser bundle.

/**
 * Honeypot input name. A nonsense token on purpose: a plausible name like
 * `company` gets populated by Chrome autofill, which silently killed real leads
 * before. Any non-empty value auto-condemns the submission.
 */
export const HONEYPOT_FIELD = 'hp_7d3a_ref'

/** Older honeypot name, still emitted by /api/demo-lead. Accepted at the same weight. */
export const LEGACY_HONEYPOT_FIELD = 'website'
