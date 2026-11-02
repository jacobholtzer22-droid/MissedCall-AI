// ===========================================
// The intake wizard: the client portal sign-up flow (PORTAL_INTAKE_WIZARD, off by default)
// ===========================================
// Pure and client-safe. The same wizard serves two doors onto one intake record
// (Engagement.intake, the record CLIENT_INTAKE_LINK writes):
//   the portal    /onboarding/intake, right after the existing self-signup
//                 (app/onboarding creates or claims the Business, then sends the
//                 client here instead of /dashboard). Clerk-protected by the
//                 existing middleware rule for /onboarding(.*).
//   the link      /intake/<token>, the signed no-account link, which renders this
//                 wizard instead of the one-page form when the flag is on.
//
// Steps, in order (stepsFor):
//   1 plan        what the client bought. From the board when the record is
//                 already Jacob's (shown for a yes); otherwise the client says:
//                 missed-call yes or no, and website / Google Ads / Business Profile.
//   2 missedcall  only with missed-call: the questionnaire's PHONE + LEADS section.
//   3 common      every other question that applies to what they bought, by section,
//                 worded exactly as docs/ops/onboarding-questionnaire.md.
//   4 legal       official business name, business address, ZIP (intake.legal).
//   5 files       photos, videos and the logo through the existing uploader.
//   6 card        STRIPE_CARD_AT_SIGNUP (piece 2). Not in the list with its flag off.
//   7 adsbilling  ADS_BILLING_INVITE (piece 3), only with Google Ads. Same.
//
// Which question applies to which service is USED_BY, taken from the doc's "Where
// each answer lands" table ("Used by"). A question shows when any service the
// client has uses it. With no service chosen at all, every question shows.
// PHONE + LEADS (11 to 14) is the missed-call step; without missed-call those
// questions still show in step 3 when the website or ads use them, so a website
// never loses its phone and email.
//
// Saved state, beside the questionnaire answers (none of it an INTAKE_KEY, so no
// admin PATCH or merge writes it):
//   intake.wizard  { plan, planSource, planConfirmedAt, step, completed, updatedAt }
//   intake.legal   { legalName, address, zip, updatedAt }

import { QUESTIONS, type IntakeWithLink, type Question } from '@/lib/ops/client-intake'

export function portalIntakeWizardEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.PORTAL_INTAKE_WIZARD === 'true'
}

/** Where the self-signup sends the client once the Business exists. With the flag off: /dashboard, as today. */
export function afterSignupPath(env: Record<string, string | undefined> = process.env): string {
  return portalIntakeWizardEnabled(env) ? '/onboarding/intake' : '/dashboard'
}

export type Service = 'missedcall' | 'website' | 'ads' | 'gbp'
export type Plan = { missedcall: boolean; website: boolean; ads: boolean; gbp: boolean }
export type PlanSource = 'board' | 'matched' | 'client'

export type StepKey = 'plan' | 'missedcall' | 'common' | 'legal' | 'files' | 'card' | 'adsbilling'

export type WizardState = {
  plan?: Plan
  planSource?: PlanSource
  planConfirmedAt?: string
  step?: StepKey
  completed?: StepKey[]
  updatedAt?: string
}
export type LegalState = { legalName?: string; address?: string; zip?: string; updatedAt?: string }
export type IntakeWithWizard = IntakeWithLink & { wizard?: WizardState; legal?: LegalState }

/** Which services use each answer: docs/ops/onboarding-questionnaire.md, "Where each answer lands". */
export const USED_BY: Record<number, Service[] | 'all'> = {
  1: 'all',
  2: 'all',
  3: ['ads'],
  4: ['ads'],
  5: ['website', 'ads'],
  6: ['website', 'ads'],
  7: ['website', 'ads'],
  8: ['website', 'ads'],
  9: ['gbp', 'website'],
  10: ['website', 'ads', 'missedcall'],
  11: ['missedcall', 'website', 'ads'],
  12: ['missedcall', 'website', 'ads'],
  13: ['missedcall', 'website', 'ads'],
  14: ['missedcall', 'website'],
  15: ['gbp'],
  16: ['website', 'gbp'],
  17: ['ads'],
  18: ['ads'],
  19: ['ads'],
  20: ['ads'],
  21: ['ads'],
  22: ['website'],
  23: ['website', 'gbp'],
  24: ['website', 'gbp'],
  25: ['website'],
  26: ['website'],
  27: ['website'],
  28: ['website'],
}

/** The questionnaire's PHONE + LEADS section: the missed-call step. */
export const MISSED_CALL_QUESTIONS = [11, 12, 13, 14]
/** Asked next to the uploader in step 5, not in step 3. */
export const FILE_QUESTIONS = [23, 24]

const NONE: Plan = { missedcall: false, website: false, ads: false, gbp: false }
const hasAny = (p: Plan) => p.missedcall || p.website || p.ads || p.gbp

export function appliesTo(n: number, plan: Plan): boolean {
  const used = USED_BY[n]
  if (!used) return false
  if (used === 'all' || !hasAny(plan)) return true
  return used.some((s) => plan[s])
}

export function stepsFor(plan: Plan | undefined, env: Record<string, string | undefined> = process.env): StepKey[] {
  const p = plan ?? NONE
  return [
    'plan',
    ...(p.missedcall ? (['missedcall'] as const) : []),
    'common',
    'legal',
    'files',
    // Pieces 2 and 3: absent with their flags off, so nothing renders.
    ...(env.STRIPE_CARD_AT_SIGNUP === 'true' ? (['card'] as const) : []),
    ...(env.ADS_BILLING_INVITE === 'true' && (p.ads || !hasAny(p)) ? (['adsbilling'] as const) : []),
  ]
}

/** The questions a step shows, verbatim, in questionnaire order. */
export function questionsFor(step: StepKey, plan: Plan | undefined): Question[] {
  const p = plan ?? NONE
  if (step === 'missedcall') return p.missedcall ? QUESTIONS.filter((q) => MISSED_CALL_QUESTIONS.includes(q.n)) : []
  if (step === 'files') return QUESTIONS.filter((q) => FILE_QUESTIONS.includes(q.n) && appliesTo(q.n, p))
  if (step !== 'common') return []
  return QUESTIONS.filter((q) => !FILE_QUESTIONS.includes(q.n) && !(p.missedcall && MISSED_CALL_QUESTIONS.includes(q.n)) && appliesTo(q.n, p))
}

/** The plan as the board has it: an engagement's services and deliverable types. */
export function planFromBoard(services: string[], deliverableTypes: string[] = []): Plan | null {
  const has = (s: string) => services.includes(s) || deliverableTypes.includes(s)
  const plan: Plan = { missedcall: has('missedcall'), website: has('website'), ads: has('ads'), gbp: has('gbp') }
  return hasAny(plan) ? plan : null
}

export const SERVICE_LABEL: Record<Service, string> = {
  missedcall: 'Missed-call text back',
  website: 'Website',
  ads: 'Google Ads',
  gbp: 'Google Business Profile',
}

// -------------------------------------------
// Saves
// -------------------------------------------

export class WizardError extends Error {}

const STEP_KEYS: StepKey[] = ['plan', 'missedcall', 'common', 'legal', 'files', 'card', 'adsbilling']

export type WizardPatch =
  | { kind: 'plan'; plan: Plan; confirm: boolean }
  | { kind: 'confirm' }
  | { kind: 'legal'; legal: { legalName: string; address: string; zip: string } }
  | { kind: 'step'; step: StepKey; done?: StepKey }

const text = (v: unknown, name: string, max: number) => {
  if (v === undefined || v === null) return ''
  if (typeof v !== 'string') throw new WizardError(`${name} must be text`)
  if (v.length > max) throw new WizardError(`${name} is too long`)
  return v.trim()
}

/** One save from the wizard. Exactly one of plan, confirm, legal, step. Throws WizardError on anything else. */
export function readWizardPatch(body: unknown): WizardPatch {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new WizardError('body must be an object')
  const b = body as Record<string, unknown>
  const keys = Object.keys(b)
  if (keys.length === 2 && keys.includes('plan') && keys.includes('confirm') || (keys.length === 1 && keys[0] === 'plan')) {
    const p = b.plan as Record<string, unknown>
    if (!p || typeof p !== 'object' || Array.isArray(p)) throw new WizardError('plan must be an object')
    const extra = Object.keys(p).filter((k) => !['missedcall', 'website', 'ads', 'gbp'].includes(k))
    if (extra.length) throw new WizardError(`not a plan item: ${extra.join(', ')}`)
    const bool = (k: string) => {
      if (p[k] !== undefined && typeof p[k] !== 'boolean') throw new WizardError(`${k} must be true or false`)
      return p[k] === true
    }
    return { kind: 'plan', plan: { missedcall: bool('missedcall'), website: bool('website'), ads: bool('ads'), gbp: bool('gbp') }, confirm: b.confirm === true }
  }
  if (keys.length === 1 && keys[0] === 'confirm' && b.confirm === true) return { kind: 'confirm' }
  if (keys.length === 1 && keys[0] === 'legal') {
    const l = b.legal as Record<string, unknown>
    if (!l || typeof l !== 'object' || Array.isArray(l)) throw new WizardError('legal must be an object')
    const extra = Object.keys(l).filter((k) => !['legalName', 'address', 'zip'].includes(k))
    if (extra.length) throw new WizardError(`not a legal field: ${extra.join(', ')}`)
    const zip = text(l.zip, 'zip', 10)
    if (zip && !/^\d{5}(-\d{4})?$/.test(zip)) throw new WizardError('ZIP must be 5 digits')
    return { kind: 'legal', legal: { legalName: text(l.legalName, 'legalName', 200), address: text(l.address, 'address', 300), zip } }
  }
  if ((keys.length === 1 || keys.length === 2) && keys.includes('step') && keys.every((k) => k === 'step' || k === 'done')) {
    if (!STEP_KEYS.includes(b.step as StepKey)) throw new WizardError('no such step')
    if (b.done !== undefined && !STEP_KEYS.includes(b.done as StepKey)) throw new WizardError('no such step')
    return { kind: 'step', step: b.step as StepKey, ...(b.done ? { done: b.done as StepKey } : {}) }
  }
  throw new WizardError('save plan, confirm, legal or step, one at a time')
}

/** The intake with one wizard save merged in. A plan the client sets is theirs ('client'); the board is never changed. */
export function applyWizardPatch(intake: IntakeWithWizard, patch: WizardPatch, now = new Date()): IntakeWithWizard {
  const at = now.toISOString()
  const w: WizardState = { ...(intake.wizard ?? {}), updatedAt: at }
  if (patch.kind === 'plan') {
    w.plan = patch.plan
    w.planSource = 'client'
    if (patch.confirm) w.planConfirmedAt = at
    else delete w.planConfirmedAt
  } else if (patch.kind === 'confirm') {
    if (!w.plan) throw new WizardError('there is no plan to confirm yet')
    w.planConfirmedAt = at
  } else if (patch.kind === 'legal') {
    return { ...intake, wizard: w, legal: { ...patch.legal, updatedAt: at } }
  } else {
    w.step = patch.step
    if (patch.done) w.completed = Array.from(new Set([...(w.completed ?? []), patch.done]))
  }
  return { ...intake, wizard: w }
}

/** A prefill from the board, stored once and only when the client has not set a plan of their own. */
export function withBoardPlan(intake: IntakeWithWizard, plan: Plan | null, source: 'board' | 'matched', now = new Date()): IntakeWithWizard {
  if (!plan || intake.wizard?.plan) return intake
  return { ...intake, wizard: { ...(intake.wizard ?? {}), plan, planSource: source, updatedAt: now.toISOString() } }
}

/**
 * A merge_portal Push: the target's intake with the portal record's answers,
 * files, wizard and legal folded in. The target's own answers win.
 */
export function mergeIntakes(target: IntakeWithWizard, from: IntakeWithWizard, now = new Date()): IntakeWithWizard {
  const urls = new Set((target.assets ?? []).map((a) => a.url))
  const answers = { ...(from.questionnaire?.answers ?? {}), ...(target.questionnaire?.answers ?? {}) }
  const qs = target.questionnaire ?? from.questionnaire
  const out: IntakeWithWizard = { ...target, assets: [...(target.assets ?? []), ...(from.assets ?? []).filter((a) => !urls.has(a.url))] }
  if (qs) out.questionnaire = { ...qs, answers, updatedAt: now.toISOString() }
  const wizard = target.wizard ?? from.wizard
  if (wizard) out.wizard = wizard
  const legal = target.legal ?? from.legal
  if (legal) out.legal = legal
  return out
}

// -------------------------------------------
// What the page sees
// -------------------------------------------

export type WizardView = {
  businessName: string
  firstName: string
  plan: Plan | null
  planSource: PlanSource | null
  planConfirmed: boolean
  steps: StepKey[]
  step: StepKey
  completed: StepKey[]
  answers: Record<string, string>
  legal: { legalName: string; address: string; zip: string }
  files: { filename: string; kind: string }[]
  finished: boolean
}

export function wizardView(
  e: { displayName: string; contactName: string | null; intake: IntakeWithWizard },
  env: Record<string, string | undefined> = process.env
): WizardView {
  const i = e.intake
  const first = e.contactName?.trim().split(/\s+/)[0] ?? ''
  const plan = i.wizard?.plan ?? null
  const steps = stepsFor(plan ?? undefined, env)
  const saved = i.wizard?.step
  // Resume where they left off; a plan not yet confirmed always starts at the plan.
  const step: StepKey = !i.wizard?.planConfirmedAt ? 'plan' : saved && steps.includes(saved) ? saved : 'plan'
  return {
    businessName: e.displayName.trim(),
    firstName: first && !/\d/.test(first) ? first : '',
    plan,
    planSource: i.wizard?.planSource ?? null,
    planConfirmed: Boolean(i.wizard?.planConfirmedAt),
    steps,
    step,
    completed: (i.wizard?.completed ?? []).filter((s) => steps.includes(s)),
    answers: { ...(i.questionnaire?.answers ?? {}) },
    legal: { legalName: i.legal?.legalName ?? '', address: i.legal?.address ?? '', zip: i.legal?.zip ?? '' },
    files: (i.assets ?? []).filter((a) => a.kind === 'photo' || a.kind === 'video' || a.kind === 'logo').map((a) => ({ filename: a.filename, kind: a.kind })),
    finished: Boolean(i.questionnaire?.finishedAt),
  }
}

/** The plan and legal lines the "answers in" note adds for a wizard finish. */
export function wizardNoteLines(i: IntakeWithWizard): string[] {
  const p = i.wizard?.plan
  const items = p ? (Object.keys(SERVICE_LABEL) as Service[]).filter((s) => p[s]).map((s) => SERVICE_LABEL[s]) : []
  const source = i.wizard?.planSource === 'client' ? 'as the client says' : i.wizard?.planSource === 'matched' ? 'from the matching client on the board' : 'from the board'
  const legal = i.legal?.legalName || i.legal?.address || i.legal?.zip
  return [
    p ? `plan ${source}: ${items.length ? items.join(', ') : 'nothing picked'}${i.wizard?.planConfirmedAt ? '' : ' (not confirmed)'}` : 'no plan picked',
    legal ? `legal details in (name, address, ZIP)` : 'no legal details yet',
  ]
}

/** The note for a finish through the wizard: the link note, named for where it came from, plus the plan and legal lines. */
export function wizardFinishNote(note: string, intake: IntakeWithWizard, via: 'portal' | 'link'): string {
  const named = via === 'portal' ? note.replace("from the client's intake link", 'from the client portal sign-up').replace('files from the link', 'files from the portal') : note
  const [head, ...rest] = named.split('; ')
  return [head, ...wizardNoteLines(intake), ...rest].join('; ')
}

// -------------------------------------------
// Copy (client-facing)
// -------------------------------------------

export const COPY = {
  stepTitle: {
    plan: 'Your plan',
    missedcall: 'PHONE + LEADS',
    common: 'About your business',
    legal: 'Business legal details',
    files: 'Photos, videos and your logo',
    card: 'Billing',
    adsbilling: 'Google Ads billing',
  } satisfies Record<StepKey, string>,
  planBoard: "Here's what I have for your plan. Is that right?",
  planYes: "That's right",
  planNo: "Something's off",
  planAskMissedCall: 'Does your plan include the missed-call system?',
  planAskServices: 'Which of these did you get? Check all that apply.',
  yes: 'Yes',
  no: 'No',
  legalIntro: 'Google uses these to verify your business for ads. Use the name and address exactly as they are on your LLC paperwork.',
  legalName: 'Official business name (exactly as registered, with LLC or Inc)',
  legalAddress: 'Business address',
  legalZip: 'ZIP code',
  filesIntro: 'Add as many as you have. They upload as you pick them.',
  back: 'Back',
  next: 'Save and continue',
  done: 'Done',
  saving: 'Saving...',
  saved: 'Saved',
  notSaved: 'Not saved. Click out of the box to try again.',
  autosave: 'Every answer saves on its own as you go. You can close this page and come back anytime.',
  intro: "rough answers are totally fine, and if you're unsure on anything just say so and we'll knock it out on a quick call.",
  thanksTitle: 'Got it, thank you.',
  thanksBody: "I'll go through your answers and reach out if I need anything else. You can come back here anytime to add more or change an answer.",
  backToAnswers: 'Back to my answers',
  toDashboard: 'Go to your dashboard',
  doneError: "That didn't go through. Check your connection and press Done again.",
  signoff: 'Thanks, looking forward to helping you out. Jacob',
}
