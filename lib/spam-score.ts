// ===========================================
// CONTACT FORM SPAM SCORING
// ===========================================
// Additive scoring filter for /api/contact. Pure and synchronous: no database,
// no network, no env reads beyond the threshold. Velocity counts are computed by
// the caller (see lib/spam-velocity.ts) and passed in, so this module can be unit
// tested with zero mocking.
//
// DESIGN RULES (do not break these when tuning):
//  1. A submission is NEVER dropped. A high score means status='spam' and no owner
//     notification. The WebsiteLead row is always written. Silent lead loss is the
//     worst failure mode in this system.
//  2. Only the honeypot auto-condemns. Every other signal is additive, and no
//     single category cap can reach the threshold on its own. Condemnation always
//     requires either the honeypot, a 3+ phrase solicitation cluster, or two
//     independent content categories agreeing.
//  3. The design must not lean on the honeypot. The bots observed in the wild are
//     replaying the real form payload, so they will send whatever fields they saw,
//     honeypot included. Content signals must be able to condemn without it.
//
// See CLAUDE.md section 17 for the weight rationale and false-positive analysis.

import { validateUsMobile } from '@/lib/phone-utils'

// ---------------------------------------------------------------------------
// Weights — tune here, never in the route.
// ---------------------------------------------------------------------------

export const SPAM_WEIGHTS = {
  /** Auto-condemn. Only signal permitted to single-handedly mark a submission. */
  HONEYPOT: 1000,

  /** gmail/googlemail local part with 4+ dots. One inbox faking many identities. */
  GMAIL_DOTS_4_PLUS: 60,
  /**
   * Exactly 3 dots. Start at 0, tune from admin view distribution.
   * The detector and the reason code stay live at weight 0 so the signal shows up
   * in /admin/spam and can be raised (20 is the analysed value) from this file
   * alone, without touching any logic.
   */
  GMAIL_DOTS_3: 0,

  /**
   * Raised 45 -> 55 in the resilience pass: with gmail dots removed entirely
   * (the cheapest thing for the operator to change), sample 3 landed at exactly
   * the threshold. No legitimate name tested fires the 2-of-3 gibberish rule, so
   * this weight contributes 0 to every analysed legitimate case.
   */
  GIBBERISH_NAME: 55,
  GIBBERISH_MESSAGE: 35,
  /** Gibberish alone must never reach the threshold. */
  GIBBERISH_CAP: 80,

  /** Structural NANP failure only. Assigned-area-code list is a TODO, see below. */
  PHONE_STRUCTURAL_INVALID: 40,

  /**
   * Raised 35 -> 40 in the resilience pass. Two suppression rules keep this off
   * real customers — see the detector for both.
   */
  BARE_DIGIT_RUN: 40,

  B2B_STRONG: 40,
  B2B_WEAK: 12,
  /** 3 strong phrases condemn. 2 do not. 6 weak phrases do not. */
  B2B_CAP: 120,

  /** Gated: only scores when gmail-dots or gibberish already fired. */
  EMAIL_NAME_MISMATCH: 20,

  VELOCITY_EMAIL_2: 30,
  VELOCITY_EMAIL_4: 60,
  VELOCITY_IP_3: 30,
  VELOCITY_IP_6: 60,
  VELOCITY_CAP: 60,

  /** Explicit siteverify success:false only. Never a missing token. See CLAUDE.md. */
  TURNSTILE_FAILED: 25,
} as const

export const DEFAULT_SPAM_THRESHOLD = 100

// Re-exported so the route can import every spam concern from one module, while
// the client-side form imports the constants alone (see lib/spam-constants.ts).
export { HONEYPOT_FIELD, LEGACY_HONEYPOT_FIELD } from '@/lib/spam-constants'

/**
 * Cold-outreach vocabulary. Homeowners requesting lawn care do not write these.
 * Matched against normalized text (lowercased, apostrophes stripped, hyphens to
 * spaces), so "This isn't a sales call" matches "a sales call" and
 * "It's a 20-minute demo" matches "20 minute demo".
 */
export const B2B_STRONG_PHRASES: readonly string[] = [
  'ai employee',
  'ai agent',
  'ai receptionist',
  'ai assistant',
  'a sales call',
  '20 minute demo',
  '15 minute demo',
  'increase leads by',
  'built and trained',
  'trained it on',
]

/** Ordinary business jargon. Real commercial customers do use these. */
export const B2B_WEAK_PHRASES: readonly string[] = [
  'book a call',
  'our clients',
  'our customers',
  'hours per week',
  'your reviews',
  'reach out to schedule',
]

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SpamReason =
  | 'honeypot'
  | 'gmail_dots_4plus'
  | 'gmail_dots_3'
  | 'gibberish_name'
  | 'gibberish_message'
  | 'phone_structural_invalid'
  | 'bare_digit_run'
  | 'b2b_strong'
  | 'b2b_weak'
  | 'email_name_mismatch'
  | 'velocity_email'
  | 'velocity_ip'
  | 'turnstile_failed'

export interface SpamInput {
  name: string
  phone?: string | null
  email?: string | null
  message?: string | null
  /** Raw honeypot field value(s) off the request body. */
  honeypot?: unknown
  /** True only on an explicit Turnstile siteverify success:false. */
  turnstileFailed?: boolean
}

export interface SpamVelocity {
  /** Prior submissions in the last 24h with the same normalized email, ALL tenants. */
  emailPriorCount24h: number
  /** Prior submissions in the last 24h from the same IP, ALL tenants. */
  ipPriorCount24h: number
}

export interface SpamVerdict {
  score: number
  /** Deduped reason codes, ordered by contribution descending. */
  reasons: SpamReason[]
  /** Human readable breakdown for the admin view. */
  detail: string[]
  threshold: number
  isSpam: boolean
}

// ---------------------------------------------------------------------------
// Threshold
// ---------------------------------------------------------------------------

export function getSpamThreshold(): number {
  const raw = process.env.SPAM_SCORE_THRESHOLD
  if (!raw) return DEFAULT_SPAM_THRESHOLD
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_SPAM_THRESHOLD
  return parsed
}

// ---------------------------------------------------------------------------
// Gibberish detection
// ---------------------------------------------------------------------------

// `y` counts as a vowel. Without it, real surnames like Krzysztof trip the
// vowel-ratio condition. Verified false on: Schmidt, Krzysztof, Nguyen, Ng, Xu,
// Bhattacharya, Szczepanski, Wojcik, Rzeszewski, Zbigniew.
const VOWELS = new Set(['a', 'e', 'i', 'o', 'u', 'y'])

const MIN_GIBBERISH_LENGTH = 6
const MAX_VOWEL_RATIO = 0.25
const MIN_CONSONANT_RUN = 5
const MIN_CASE_TRANSITIONS = 4

/**
 * True when a single unspaced token looks machine-generated.
 *
 * Requires 2 of 3 conditions, NOT 1. A single condition produces false positives
 * on real surnames — `Schmidt` has a 0.14 vowel ratio and would be condemned by a
 * naive vowel check. Both the 2-of-3 rule and treating `y` as a vowel are
 * load-bearing false-positive defenses; see the regression tests.
 */
export function isGibberish(token: string): boolean {
  const letters = token.replace(/[^A-Za-z]/g, '')
  if (letters.length < MIN_GIBBERISH_LENGTH) return false

  let vowels = 0
  let run = 0
  let maxRun = 0
  for (const ch of letters) {
    if (VOWELS.has(ch.toLowerCase())) {
      vowels += 1
      run = 0
    } else {
      run += 1
      if (run > maxRun) maxRun = run
    }
  }

  let transitions = 0
  for (let i = 1; i < letters.length; i += 1) {
    const prevUpper = letters[i - 1] === letters[i - 1].toUpperCase()
    const currUpper = letters[i] === letters[i].toUpperCase()
    if (prevUpper !== currUpper) transitions += 1
  }

  const conditions = [
    vowels / letters.length < MAX_VOWEL_RATIO,
    maxRun >= MIN_CONSONANT_RUN,
    transitions >= MIN_CASE_TRANSITIONS,
  ].filter(Boolean).length

  return conditions >= 2
}

function anyTokenIsGibberish(text: string): boolean {
  return text.split(/\s+/).some((t) => isGibberish(t))
}

// ---------------------------------------------------------------------------
// Message parsing
// ---------------------------------------------------------------------------

// Client sites join a picked service and a free-text note as "Service — note",
// and some prefix free-text answers with "Label:". Both wrappers are stripped so
// the detectors see the content the human (or bot) actually supplied.
const LABEL_PREFIX = /^[A-Za-z][A-Za-z /&'-]{0,40}:\s*/

/** Split a message into the content segments a human actually typed. */
function messageSegments(message: string): string[] {
  return message
    .split(/[\r\n]+|\s+[—–-]\s+/)
    .map((line) => line.replace(LABEL_PREFIX, '').trim())
    .filter((line) => line.length > 0)
}

const DIGIT_RUN_ONLY = /^[+\d\s().-]+$/

/** Strip to digits and drop a leading US country code, so "+1 (734) 555-2188"
 *  and "7345552188" compare equal. */
function digitsOnly(value: string): string {
  const d = value.replace(/\D/g, '')
  return d.length === 11 && d.startsWith('1') ? d.slice(1) : d
}

// ---------------------------------------------------------------------------
// Email helpers
// ---------------------------------------------------------------------------

const GMAIL_DOMAINS = new Set(['gmail.com', 'googlemail.com'])

function splitEmail(email: string): { local: string; domain: string } | null {
  const at = email.lastIndexOf('@')
  if (at <= 0 || at === email.length - 1) return null
  return {
    local: email.slice(0, at).trim().toLowerCase(),
    domain: email.slice(at + 1).trim().toLowerCase(),
  }
}

/**
 * Collapse an address to the inbox it actually reaches. Gmail ignores dots and
 * everything after a `+`, so `i.b.e.g.u.tu903@gmail.com` and `ibegutu903@gmail.com`
 * are the same mailbox. Used for cross-tenant velocity counting.
 */
export function normalizeEmailForVelocity(email: string): string {
  const parts = splitEmail(email)
  if (!parts) return email.trim().toLowerCase()
  const { domain } = parts
  let local = parts.local
  const plus = local.indexOf('+')
  if (plus >= 0) local = local.slice(0, plus)
  if (GMAIL_DOMAINS.has(domain)) local = local.replace(/\./g, '')
  return `${local}@${domain}`
}

// ---------------------------------------------------------------------------
// B2B phrase matching
// ---------------------------------------------------------------------------

/**
 * Normalization is load-bearing. Without apostrophe stripping and hyphen
 * folding, "This isn't a sales call" and "It's a 20-minute demo" both miss, which
 * drops the observed solicitation bot from 5 phrase hits to 3 — right onto the
 * detection floor.
 */
function normalizeForPhrases(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’'`]/g, '')
    .replace(/[‐-―-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export function scoreSubmission(input: SpamInput, velocity?: SpamVelocity): SpamVerdict {
  const threshold = getSpamThreshold()

  // --- (a) Honeypot: the only auto-condemn. Short-circuits everything else. ---
  //
  // isSpam is still derived from the threshold rather than hardcoded true, so that
  // shadow mode (a very high SPAM_SCORE_THRESHOLD) genuinely condemns NOTHING —
  // honeypot hits included. Hardcoding it here would have left one path that
  // suppressed owner notifications during the shadow-mode week.
  const honeypot = input.honeypot
  if (typeof honeypot === 'string' && honeypot.trim() !== '') {
    return {
      score: SPAM_WEIGHTS.HONEYPOT,
      reasons: ['honeypot'],
      detail: [`honeypot filled (+${SPAM_WEIGHTS.HONEYPOT})`],
      threshold,
      isSpam: SPAM_WEIGHTS.HONEYPOT >= threshold,
    }
  }

  const name = (input.name || '').trim()
  const phone = (input.phone || '').trim()
  const email = (input.email || '').trim()
  const message = (input.message || '').trim()

  const hits: { reason: SpamReason; points: number; detail: string }[] = []

  // --- (b) Gmail dot-obfuscation ---
  let gmailDotsFired = false
  if (email) {
    const parts = splitEmail(email)
    if (parts && GMAIL_DOMAINS.has(parts.domain)) {
      const plus = parts.local.indexOf('+')
      const beforeTag = plus >= 0 ? parts.local.slice(0, plus) : parts.local
      const dots = (beforeTag.match(/\./g) || []).length
      if (dots >= 4) {
        gmailDotsFired = true
        hits.push({
          reason: 'gmail_dots_4plus',
          points: SPAM_WEIGHTS.GMAIL_DOTS_4_PLUS,
          detail: `gmail local part has ${dots} dots (+${SPAM_WEIGHTS.GMAIL_DOTS_4_PLUS})`,
        })
      } else if (dots === 3) {
        // Weight is 0 today. Recorded anyway so the admin view shows the
        // distribution and the tier can be raised from SPAM_WEIGHTS alone.
        if (SPAM_WEIGHTS.GMAIL_DOTS_3 > 0) gmailDotsFired = true
        hits.push({
          reason: 'gmail_dots_3',
          points: SPAM_WEIGHTS.GMAIL_DOTS_3,
          detail: `gmail local part has 3 dots (+${SPAM_WEIGHTS.GMAIL_DOTS_3})`,
        })
      }
    }
  }

  // --- (c) Gibberish, capped ---
  let gibberishFired = false
  let gibberishPoints = 0
  if (name && anyTokenIsGibberish(name)) {
    gibberishFired = true
    gibberishPoints += SPAM_WEIGHTS.GIBBERISH_NAME
    hits.push({
      reason: 'gibberish_name',
      points: SPAM_WEIGHTS.GIBBERISH_NAME,
      detail: `name looks generated (+${SPAM_WEIGHTS.GIBBERISH_NAME})`,
    })
  }
  const segments = message ? messageSegments(message) : []
  if (segments.some((s) => anyTokenIsGibberish(s))) {
    gibberishFired = true
    gibberishPoints += SPAM_WEIGHTS.GIBBERISH_MESSAGE
    hits.push({
      reason: 'gibberish_message',
      points: SPAM_WEIGHTS.GIBBERISH_MESSAGE,
      detail: `message text looks generated (+${SPAM_WEIGHTS.GIBBERISH_MESSAGE})`,
    })
  }
  const gibberishOverflow = Math.max(0, gibberishPoints - SPAM_WEIGHTS.GIBBERISH_CAP)

  // --- (d) Structural NANP phone check ---
  //
  // TODO: assigned-area-code list. The samples used 271, 221 and 525, which are
  // structurally legal but unassigned, so they pass this check. Pull the official
  // list from NANPA's "Geographic Area Code Number Report" CSV export at
  // https://nationalnanpa.com/enas/geoAreaCodeNumberReport.do and add an
  // AREA_CODE_UNASSIGNED signal. Do not approximate it from memory — a wrong list
  // rejects real customers. Adding it later is a pure gain and needs no retuning.
  if (phone && !validateUsMobile(phone).ok) {
    hits.push({
      reason: 'phone_structural_invalid',
      points: SPAM_WEIGHTS.PHONE_STRUCTURAL_INVALID,
      detail: `phone fails NANP structure (+${SPAM_WEIGHTS.PHONE_STRUCTURAL_INVALID})`,
    })
  }

  // --- (e) Bare digit run where prose belongs ---
  //
  // TWO suppression rules, both protecting the same real behaviour — a customer
  // giving their own number in the message box:
  //
  //  1. Phone field EMPTY and the run is a structurally valid number. They typed
  //     it into the message instead of the phone field.
  //  2. The run EQUALS the phone field (compared as bare digits). They filled the
  //     field and repeated themselves.
  //
  // Rule 2 is what separates the real behaviour from the bots. A person repeating
  // their number sends the SAME digits twice; the observed bots send a DIFFERENT
  // number in the message than in the phone field (sample 1: 2711934617 vs
  // 9969063456; sample 3: 5254356086 vs 7129221395). Without rule 2, a real
  // customer with a dotted gmail that does not match their typed name and their
  // own number repeated in the message stacked to 60 + 20 + 40 = 120 and was
  // condemned. That is not an exotic submission. See the named regression test.
  const phoneFieldEmpty = phone === ''
  const phoneDigits = digitsOnly(phone)
  const bareRun = segments.find((s) => {
    if (!DIGIT_RUN_ONLY.test(s)) return false
    const digits = digitsOnly(s)
    if (digits.length < 7 || digits.length > 11) return false
    if (phoneFieldEmpty && validateUsMobile(s).ok) return false
    if (phoneDigits && digits === phoneDigits) return false
    return true
  })
  if (bareRun) {
    hits.push({
      reason: 'bare_digit_run',
      points: SPAM_WEIGHTS.BARE_DIGIT_RUN,
      detail: `bare digit run where free text belongs (+${SPAM_WEIGHTS.BARE_DIGIT_RUN})`,
    })
  }

  // --- (f) B2B solicitation vocabulary, capped ---
  let b2bOverflow = 0
  if (message) {
    const normalized = normalizeForPhrases(message)
    const strong = B2B_STRONG_PHRASES.filter((p) => normalized.includes(p))
    const weak = B2B_WEAK_PHRASES.filter((p) => normalized.includes(p))
    const raw = strong.length * SPAM_WEIGHTS.B2B_STRONG + weak.length * SPAM_WEIGHTS.B2B_WEAK
    b2bOverflow = Math.max(0, raw - SPAM_WEIGHTS.B2B_CAP)
    if (strong.length > 0) {
      hits.push({
        reason: 'b2b_strong',
        points: strong.length * SPAM_WEIGHTS.B2B_STRONG,
        detail: `solicitation phrases: ${strong.join(', ')} (+${strong.length * SPAM_WEIGHTS.B2B_STRONG})`,
      })
    }
    if (weak.length > 0) {
      hits.push({
        reason: 'b2b_weak',
        points: weak.length * SPAM_WEIGHTS.B2B_WEAK,
        detail: `business jargon: ${weak.join(', ')} (+${weak.length * SPAM_WEIGHTS.B2B_WEAK})`,
      })
    }
  }

  // --- (g) Email local part unrelated to name ---
  //
  // Gated on (b) or (c) having already fired. Ungated this would punish anyone
  // whose address predates their current name; gated, a normal customer never
  // reaches it. A real person's dotted gmail spells their name, which is exactly
  // what closes this gate.
  if ((gmailDotsFired || gibberishFired) && email && name) {
    const parts = splitEmail(email)
    if (parts) {
      const plus = parts.local.indexOf('+')
      const local = (plus >= 0 ? parts.local.slice(0, plus) : parts.local)
        .replace(/[^a-z]/g, '')
      const nameTokens = name
        .toLowerCase()
        .split(/\s+/)
        .map((t) => t.replace(/[^a-z]/g, ''))
        .filter((t) => t.length >= 3)
      // Names with no token of 3+ letters (Ng, Xu) cannot be evaluated — skip.
      if (nameTokens.length > 0 && !nameTokens.some((t) => local.includes(t.slice(0, 3)))) {
        hits.push({
          reason: 'email_name_mismatch',
          points: SPAM_WEIGHTS.EMAIL_NAME_MISMATCH,
          detail: `email local part unrelated to name (+${SPAM_WEIGHTS.EMAIL_NAME_MISMATCH})`,
        })
      }
    }
  }

  // --- (h) Cross-tenant velocity, capped ---
  let velocityOverflow = 0
  if (velocity) {
    let velocityPoints = 0
    if (velocity.emailPriorCount24h >= 3) {
      velocityPoints += SPAM_WEIGHTS.VELOCITY_EMAIL_4
      hits.push({
        reason: 'velocity_email',
        points: SPAM_WEIGHTS.VELOCITY_EMAIL_4,
        detail: `same inbox seen ${velocity.emailPriorCount24h}x in 24h across all clients (+${SPAM_WEIGHTS.VELOCITY_EMAIL_4})`,
      })
    } else if (velocity.emailPriorCount24h >= 1) {
      velocityPoints += SPAM_WEIGHTS.VELOCITY_EMAIL_2
      hits.push({
        reason: 'velocity_email',
        points: SPAM_WEIGHTS.VELOCITY_EMAIL_2,
        detail: `same inbox seen ${velocity.emailPriorCount24h}x in 24h across all clients (+${SPAM_WEIGHTS.VELOCITY_EMAIL_2})`,
      })
    }
    if (velocity.ipPriorCount24h >= 5) {
      velocityPoints += SPAM_WEIGHTS.VELOCITY_IP_6
      hits.push({
        reason: 'velocity_ip',
        points: SPAM_WEIGHTS.VELOCITY_IP_6,
        detail: `same IP seen ${velocity.ipPriorCount24h}x in 24h across all clients (+${SPAM_WEIGHTS.VELOCITY_IP_6})`,
      })
    } else if (velocity.ipPriorCount24h >= 2) {
      velocityPoints += SPAM_WEIGHTS.VELOCITY_IP_3
      hits.push({
        reason: 'velocity_ip',
        points: SPAM_WEIGHTS.VELOCITY_IP_3,
        detail: `same IP seen ${velocity.ipPriorCount24h}x in 24h across all clients (+${SPAM_WEIGHTS.VELOCITY_IP_3})`,
      })
    }
    velocityOverflow = Math.max(0, velocityPoints - SPAM_WEIGHTS.VELOCITY_CAP)
  }

  // --- Turnstile: explicit failure only, never a missing token. See CLAUDE.md. ---
  if (input.turnstileFailed) {
    hits.push({
      reason: 'turnstile_failed',
      points: SPAM_WEIGHTS.TURNSTILE_FAILED,
      detail: `turnstile siteverify returned success:false (+${SPAM_WEIGHTS.TURNSTILE_FAILED})`,
    })
  }

  const gross = hits.reduce((sum, h) => sum + h.points, 0)
  const score = Math.max(0, gross - gibberishOverflow - b2bOverflow - velocityOverflow)

  const ordered = [...hits].sort((a, b) => b.points - a.points)
  const reasons: SpamReason[] = []
  for (const h of ordered) if (!reasons.includes(h.reason)) reasons.push(h.reason)

  const detail = ordered.map((h) => h.detail)
  if (gibberishOverflow > 0) detail.push(`gibberish capped at ${SPAM_WEIGHTS.GIBBERISH_CAP} (-${gibberishOverflow})`)
  if (b2bOverflow > 0) detail.push(`solicitation capped at ${SPAM_WEIGHTS.B2B_CAP} (-${b2bOverflow})`)
  if (velocityOverflow > 0) detail.push(`velocity capped at ${SPAM_WEIGHTS.VELOCITY_CAP} (-${velocityOverflow})`)

  return {
    score,
    reasons,
    detail,
    threshold,
    // >= not >. A threshold should mean "at or above condemns"; with > the
    // configured value would itself be a dead boundary, and a sample landing on
    // exactly the threshold would be delivered.
    isSpam: score >= threshold,
  }
}
