// ===========================================
// /book FUNNEL CONSTANTS
// ===========================================

/**
 * Seconds of free playback before the gate opens.
 *   0  = gate before playback starts (shipped default)
 *  >0  = video plays freely until this timestamp, then pauses and gates
 * Both paths are implemented in the video section.
 */
export const GATE_AT_SECONDS = 0

export const NOT_AN_OWNER = "I don't own one"

export const TRADES = [
  'Landscaping / Lawn Care',
  'Tree Service',
  'Junk Removal or Dumpster',
  'HVAC',
  'Plumbing',
  'Electrical',
  'Auto Detailing',
  'Painting',
  'Snow Removal',
  'Other trade',
  NOT_AN_OWNER,
] as const

export type Trade = (typeof TRADES)[number]

/** First-party cookie holding only the lead id. httpOnly, read server-side. */
export const GATE_COOKIE = 'aa_demo_gate'
export const GATE_COOKIE_MAX_AGE = 60 * 60 * 24 * 90 // 90 days

export const MISSES_PER_WEEK = ['1 or 2', '3 to 10', 'More than 10', 'No idea, my phone never stops'] as const
export const WHO_ANSWERS = [
  'Me, when I can',
  'It mostly goes to voicemail',
  'Office help or an answering service',
] as const

/** Progressive (XXX) XXX-XXXX formatting as the visitor types. */
export function formatPhoneInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 10)
  if (digits.length === 0) return ''
  if (digits.length <= 3) return `(${digits}`
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

/**
 * Length promised to the visitor, in minutes. Deliberately separate from
 * SLOT_MINUTES in lib/marketing-slots.ts, which is the calendar BLOCK length.
 * The block is longer than the promised call so a call that runs over does not
 * collide with the next one.
 */
export const CALL_LENGTH_MINUTES = 15
