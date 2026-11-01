// ===========================================
// /intake/<token>: the client's own intake link (CLIENT_INTAKE_LINK)
// ===========================================
// Pure and client-safe except for the signing helpers, which take the key as
// an argument (lib/ops/client-intake-server.ts reads it from the env). Off
// unless CLIENT_INTAKE_LINK is exactly 'true': with it off the page and every
// /api/intake route answer 404 and the chief has no link tool.
//
// The page is public, so the token is the only thing that lets anyone in.
//
//   token   = <engagementId>.<expires, base36 ms>.<nonce>.<signature>
//   sign    = HMAC-SHA256(key, "client-intake:v1:" + the first three parts),
//             base64url, first 32 characters. The prefix keeps it from ever
//             verifying as another token signed with the same key (the watch
//             link signs "<leadId>.<arm>.<exp>" with OTP_SECRET).
//   key     = CLIENT_INTAKE_SECRET, else OTP_SECRET (the repo's existing
//             signing secret, lib/watch-token.ts). Neither set: no links.
//   expiry  = 30 days from issue (CLIENT_LINK_TTL_MS).
//   revoke  = the nonce must equal Engagement.intake.clientLink.nonce. A new
//             link replaces the nonce, so every older link stops working;
//             revoking clears it. clientLink is not an INTAKE_KEY: no admin
//             PATCH, save_intake or merge can write it.
//
// No PII in the URL: an engagement id (a cuid) and random characters.
// Everything the routes read or write is scoped to the engagement id inside a
// verified token; nothing else is reachable.
//
// Answers are stored verbatim, question by question, in
// Engagement.intake.questionnaire (also not an INTAKE_KEY). The chief maps
// them into the structured intake the same way it maps pasted answers, when
// Jacob asks. Nothing here writes a brief.

import { createHmac, randomBytes, timingSafeEqual } from 'crypto'
import type { Intake } from '@/lib/ops/intake'

export function clientIntakeEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.CLIENT_INTAKE_LINK === 'true'
}

/** The signing key, or null when neither secret is set. */
export function clientIntakeKey(env: Record<string, string | undefined> = process.env): string | null {
  return env.CLIENT_INTAKE_SECRET?.trim() || env.OTP_SECRET?.trim() || null
}

export const CLIENT_LINK_TTL_MS = 30 * 24 * 60 * 60 * 1000
const SIG_LENGTH = 32
const DOMAIN = 'client-intake:v1:'

/** What Engagement.intake.clientLink holds. */
export type ClientLinkState = { nonce: string; issuedAt: string; expiresAt: string }

/** What Engagement.intake.questionnaire holds. Keys are question numbers as strings. */
export type QuestionnaireState = {
  answers: Record<string, string>
  updatedAt: string
  /** First time the client pressed Done. */
  finishedAt?: string
  /** Latest time they pressed Done. */
  lastFinishedAt?: string
}

/** Intake plus the two keys this feature keeps beside it. */
export type IntakeWithLink = Intake & { clientLink?: ClientLinkState; questionnaire?: QuestionnaireState }

export function newNonce(): string {
  return randomBytes(9).toString('base64url')
}

function signature(payload: string, key: string): string {
  return createHmac('sha256', key).update(DOMAIN + payload).digest('base64url').slice(0, SIG_LENGTH)
}

export function signClientLink(engagementId: string, nonce: string, expiresAtMs: number, key: string): string {
  const payload = `${engagementId}.${expiresAtMs.toString(36)}.${nonce}`
  return `${payload}.${signature(payload, key)}`
}

export type LinkClaim =
  | { ok: true; engagementId: string; nonce: string; expiresAt: number }
  | { ok: false; reason: 'missing' | 'malformed' | 'no_key' | 'bad_signature' | 'expired' }

/** Signature and expiry only. The nonce is checked against the engagement by the server. */
export function verifyClientLink(token: string | null | undefined, key: string | null, now = Date.now()): LinkClaim {
  if (!token) return { ok: false, reason: 'missing' }
  if (!key) return { ok: false, reason: 'no_key' }
  if (token.length > 200) return { ok: false, reason: 'malformed' }
  const parts = token.split('.')
  if (parts.length !== 4) return { ok: false, reason: 'malformed' }
  const [engagementId, exp, nonce, sig] = parts
  if (!/^[a-z0-9]{10,40}$/.test(engagementId) || !/^[a-z0-9]{1,12}$/.test(exp) || !/^[A-Za-z0-9_-]{8,24}$/.test(nonce) || !sig) {
    return { ok: false, reason: 'malformed' }
  }
  const expected = Buffer.from(signature(`${engagementId}.${exp}.${nonce}`, key), 'utf8')
  const given = Buffer.from(sig, 'utf8')
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { ok: false, reason: 'bad_signature' }
  const expiresAt = parseInt(exp, 36)
  if (!Number.isFinite(expiresAt) || expiresAt < now) return { ok: false, reason: 'expired' }
  return { ok: true, engagementId, nonce, expiresAt }
}

/** True when this claim is the engagement's current link (not replaced or revoked). */
export function claimIsCurrent(claim: { engagementId: string; nonce: string }, engagement: { id: string; intake: IntakeWithLink }): boolean {
  const state = engagement.intake.clientLink
  if (engagement.id !== claim.engagementId || !state?.nonce) return false
  const a = Buffer.from(state.nonce, 'utf8')
  const b = Buffer.from(claim.nonce, 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}

export function clientLinkUrl(token: string, base = process.env.NEXT_PUBLIC_APP_URL || 'https://www.alignandacquire.com'): string {
  return `${base.replace(/\/$/, '')}/intake/${token}`
}

// -------------------------------------------
// The questions (docs/ops/onboarding-questionnaire.md, verbatim; a test holds them to the doc)
// -------------------------------------------

export type Question = { n: number; section: string; text: string; info?: boolean }

const q = (n: number, section: string, text: string, info = false): Question => ({ n, section, text, ...(info ? { info } : {}) })

export const QUESTIONS: Question[] = [
  q(1, 'THE BUSINESS', "Legal business name, and the name you want customers to see if it's different"),
  q(2, 'THE BUSINESS', 'Every service you offer. Then tell me the 2 or 3 you want MORE of (your money makers)'),
  q(3, 'THE BUSINESS', "Anything you DON'T want calls for? Jobs too small, services you don't do, commercial, rentals, DIY people, etc. This keeps me from paying for junk clicks"),
  q(4, 'THE BUSINESS', 'Rough average job value for your main services'),
  q(5, 'THE BUSINESS', 'Residential, commercial, or both?'),
  q(6, 'THE BUSINESS', "Years in business, licensed and insured (license # if your trade has one), any certifications or brands you're certified with"),
  q(7, 'THE BUSINESS', "What sets you apart? Free estimates, financing, warranties, same day service, family or veteran owned, etc. Only stuff that's 100% true since it goes in the ads"),
  q(8, 'THE BUSINESS', "Any promo or offer you'd be willing to run (ex: $50 off first service, free inspection)"),
  q(9, 'SERVICE AREA', 'Your home base address (for your Google listing, it does NOT have to show publicly)'),
  q(10, 'SERVICE AREA', "Every city/town you'll actually drive to and the max distance you'll go. Which areas do you want the most jobs in?"),
  q(11, 'PHONE + LEADS', 'What number should customers call?'),
  q(12, 'PHONE + LEADS', "Who answers and what hours can you realistically pick up? Ads sending calls to a phone nobody answers is wasted money, so I'll run the ads around your hours"),
  q(13, 'PHONE + LEADS', 'Do you do emergency or after-hours work?'),
  q(14, 'PHONE + LEADS', 'Email where you want website quote requests sent'),
  q(15, 'GOOGLE BUSINESS PROFILE', "Do you have a Google Business Profile (your listing on Google Maps)? If yes, is it verified, and can you add me as a manager? If not, I'll set it up with you. Verification usually needs a short video showing your truck, tools, signage, etc."),
  q(16, 'GOOGLE BUSINESS PROFILE', 'How many reviews do you have and where? (Google, Facebook, Yelp, Angi, Nextdoor)'),
  q(17, 'GOOGLE ADS ACCOUNT', "The Gmail you want tied to the account. I'll create it under my manager account and send you an invite"),
  q(18, 'GOOGLE ADS ACCOUNT', "Monthly ad budget you're comfortable with. This goes straight to Google, separate from what you pay me. I'll give you my recommendation but I want your number"),
  q(19, 'GOOGLE ADS ACCOUNT', 'Main goal: phone calls, quote requests, or both? Any busy or slow seasons?'),
  q(20, 'GOOGLE ADS ACCOUNT', "Once the account is set up you'll add a card for billing directly inside Google Ads (Google bills you directly, never text me card info). I'll walk you through it, takes 2 min", true),
  q(21, 'GOOGLE ADS ACCOUNT', 'Any competitors you see all over Google that you want to go after?'),
  q(22, 'WEBSITE', "Do you own a domain already? If not, any preference on the name?"),
  q(23, 'WEBSITE', 'Logo (highest quality file you have) and brand colors. No logo is fine, just tell me'),
  q(24, 'WEBSITE', "Photos: real job pics, before/afters, your truck, you and your crew. The more the better. I don't use stock or AI photos, real work converts way better. Google Drive link works great"),
  q(25, 'WEBSITE', 'Any websites you like the look of, competitor or not'),
  q(26, 'WEBSITE', 'Your social links (Facebook, Instagram, etc.)'),
  q(27, 'WEBSITE', 'A few sentences on you and how you got started, for the About page'),
  q(28, 'WEBSITE', "Any customer reviews/testimonials you're good with me using on the site"),
]

export const ANSWERABLE = QUESTIONS.filter((x) => !x.info).map((x) => x.n)
export const MAX_ANSWER_CHARS = 4000

// -------------------------------------------
// Answers
// -------------------------------------------

export class AnswerError extends Error {}

/**
 * Validate a save from the page: { answers: { "<n>": "<text>" } } with only
 * answerable question numbers, strings up to MAX_ANSWER_CHARS. An empty
 * string clears that answer. Throws AnswerError on anything else.
 */
export function readAnswerPatch(body: unknown): Record<string, string> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AnswerError('body must be an object')
  const keys = Object.keys(body as object)
  if (keys.length !== 1 || keys[0] !== 'answers') throw new AnswerError('only answers can be saved here')
  const answers = (body as { answers: unknown }).answers
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) throw new AnswerError('answers must be an object')
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(answers as Record<string, unknown>)) {
    if (!/^\d{1,2}$/.test(k) || !ANSWERABLE.includes(Number(k))) throw new AnswerError(`no question ${k}`)
    if (typeof v !== 'string') throw new AnswerError(`answer ${k} must be text`)
    if (v.length > MAX_ANSWER_CHARS) throw new AnswerError(`answer ${k} is too long`)
    out[String(Number(k))] = v.replace(/\r\n/g, '\n')
  }
  return out
}

/** The intake with these answers merged in (partial saves keep every other answer). */
export function applyAnswers(intake: IntakeWithLink, patch: Record<string, string>, now = new Date()): IntakeWithLink {
  const answers = { ...(intake.questionnaire?.answers ?? {}) }
  for (const [k, v] of Object.entries(patch)) {
    if (v.trim()) answers[k] = v
    else delete answers[k]
  }
  return { ...intake, questionnaire: { ...(intake.questionnaire ?? {}), answers, updatedAt: now.toISOString() } }
}

export const answeredCount = (intake: IntakeWithLink) =>
  Object.values(intake.questionnaire?.answers ?? {}).filter((v) => v.trim().length > 0).length

/** Priority questions (the ad campaign) still empty. */
export const PRIORITY = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 17, 18, 19]
export function priorityMissing(intake: IntakeWithLink): number[] {
  const a = intake.questionnaire?.answers ?? {}
  return PRIORITY.filter((n) => !a[String(n)]?.trim())
}

/**
 * Done pressed. Returns the intake to store and the Ops HQ note to write, or
 * no note when nothing changed since the last Done (a second press, or a
 * reload and Done again).
 */
export function finishIntake(intake: IntakeWithLink, now = new Date()): { intake: IntakeWithLink; note: string | null } {
  const qs = intake.questionnaire ?? { answers: {}, updatedAt: now.toISOString() }
  const last = qs.lastFinishedAt ? Date.parse(qs.lastFinishedAt) : null
  const lastFile = Math.max(0, ...(intake.assets ?? []).filter((a) => a.via === 'client_link').map((a) => Date.parse(a.uploadedAt) || 0))
  const changed = last === null || Date.parse(qs.updatedAt) > last || lastFile > last
  const next: IntakeWithLink = {
    ...intake,
    questionnaire: { ...qs, finishedAt: qs.finishedAt ?? now.toISOString(), lastFinishedAt: now.toISOString() },
  }
  return { intake: next, note: changed ? finishNote(next, last !== null) : null }
}

export function finishNote(intake: IntakeWithLink, again: boolean): string {
  const files = (intake.assets ?? []).filter((a) => a.via === 'client_link')
  const photos = files.filter((a) => a.kind === 'photo').length
  const videos = files.filter((a) => a.kind === 'video').length
  const logo = files.some((a) => a.kind === 'logo')
  const missing = priorityMissing(intake)
  return [
    `${again ? 'Answers updated' : 'Answers in'} from the client's intake link: ${answeredCount(intake)} of ${ANSWERABLE.length} answered`,
    `files from the link: ${photos} photo${photos === 1 ? '' : 's'}, ${videos} video${videos === 1 ? '' : 's'}${logo ? ', a logo' : ''}`,
    missing.length ? `still empty from the campaign set: ${missing.join(', ')}` : 'the campaign set (1 to 14, 17 to 19) is complete',
    'Nothing was sent. Ask the chief to map the answers; the brief still waits for your OK.',
  ].join('; ')
}

// -------------------------------------------
// What the page may see (never Jacob's notes, the GBP read, the brief or URLs)
// -------------------------------------------

export type PublicIntake = {
  businessName: string
  firstName: string
  answers: Record<string, string>
  files: { filename: string; kind: string }[]
  finished: boolean
}

export function publicView(e: { displayName: string; contactName: string | null; intake: IntakeWithLink }): PublicIntake {
  const first = e.contactName?.trim().split(/\s+/)[0] ?? ''
  return {
    businessName: e.displayName.trim(),
    firstName: first && !/\d/.test(first) ? first : '',
    answers: { ...(e.intake.questionnaire?.answers ?? {}) },
    files: (e.intake.assets ?? [])
      .filter((a) => a.kind === 'photo' || a.kind === 'video' || a.kind === 'logo')
      .map((a) => ({ filename: a.filename, kind: a.kind })),
    finished: Boolean(e.intake.questionnaire?.finishedAt),
  }
}

// -------------------------------------------
// Uploads and limits
// -------------------------------------------

/** The kinds a client may upload through the link (no documents, no chat). */
export const LINK_UPLOAD_KINDS = ['photo', 'logo'] as const
/** Most files an engagement can hold before the link refuses more. */
export const CLIENT_LINK_MAX_FILES = 300

/** Per-IP limits per route, per minute. */
export const CLIENT_LINK_LIMITS = {
  read: 60,
  save: 60,
  token: 240,
  register: 120,
  finish: 10,
} as const
export type ClientLinkRoute = keyof typeof CLIENT_LINK_LIMITS
