// ===========================================
// Ops HQ autoflow: draft the brief when the intake is ready (OPS_AUTOFLOW)
// ===========================================
// Pure rules plus a runner with every side effect injected (the real wiring is
// autoDraftBrief in lib/ops/hq/chief.ts). With OPS_AUTOFLOW off nothing here runs.
//
// When the intake is complete enough, the chief's own brief writing runs once,
// in one bounded model call with no tools, and the result is a DRAFT: posted in
// the HQ chat and kept on the intake (intake.briefDraft), never stored as the
// brief. Jacob's "looks good" goes through the existing set_brief path, which
// stores it and moves the website step to build. Nothing here stores a brief,
// moves a step, dispatches a build or sends anything to anyone.
//
// "Complete enough" is the existing rule, not a new one: intakeMissing() in
// lib/ops/intake.ts (phone, services, service area, about, photos: "the five
// things a build cannot do without", the same list get_client's summary.missing
// shows the chief before it writes a brief), plus at least
// BRIEF_DRAFT_MIN_PHOTOS client photos.
//
// Once per intake version: the version is a hash of the intake's material
// content (every answer field, Jacob's notes and the client's questionnaire
// answers; never the files, timestamps, the GBP lookup time, the link nonce or
// the draft itself). Photos are not material: set_brief rewrites the Assets
// section from the intake when the brief is stored. A new version while a draft
// is waiting replaces it once; at most BRIEF_DRAFT_MAX drafts per client.

import { createHash } from 'crypto'
import { INTAKE_KEYS, intakeMissing, type Intake } from '@/lib/ops/intake'

/**
 * Minimum client photos before an automatic draft. Site brief standards
 * section 7: the hero is a finished job, service photos map to their service
 * pages, the rest go to the gallery. Questionnaire Q2 asks for the 2 or 3 money
 * makers, so 1 hero + 3 service photos + 2 for the gallery is the smallest set
 * that fills those slots with real work. Fewer and the brief is written around
 * gaps a stock fill would cover, which the standards rule out without Jacob's say.
 */
export const BRIEF_DRAFT_MIN_PHOTOS = 6
/** Automatic drafts per client, ever. Jacob can always ask the chief for another. */
export const BRIEF_DRAFT_MAX = 3
/** A draft claimed but not finished after this long may be retried. */
export const BRIEF_DRAFT_STALE_MS = 15 * 60 * 1000

export type BriefDraftState = {
  version: string
  status: 'drafting' | 'pending' | 'failed'
  startedAt: string
  draftedAt?: string
  text?: string
  error?: string
  /** failed only: the call itself broke (no key, no template, a network error), not the output. May be tried again. */
  retryable?: boolean
  /** Drafts attempted so far for this client, this one included. */
  count: number
}

export type IntakeWithDraft = Intake & { briefDraft?: BriefDraftState; questionnaire?: { answers?: Record<string, string> } }

export const DRAFT_TRIGGERS = ['save_intake', 'file_photos', 'intake_link_done'] as const
export type DraftTrigger = (typeof DRAFT_TRIGGERS)[number]

/** The material version of an intake: what a brief is written from, and nothing else. */
export function intakeVersion(intake: IntakeWithDraft): string {
  const material: Record<string, unknown> = {}
  for (const k of INTAKE_KEYS) {
    if (k === 'assets') continue
    const v = (intake as Record<string, unknown>)[k]
    if (v === undefined || v === null || v === '') continue
    material[k] = k === 'gbp' && v && typeof v === 'object' ? { ...(v as Record<string, unknown>), lookedUpAt: undefined } : v
  }
  const answers = intake.questionnaire?.answers
  if (answers && Object.keys(answers).length) material.questionnaire = answers
  return createHash('sha256').update(stableJson(material)).digest('hex').slice(0, 16)
}

function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`
  if (v && typeof v === 'object') {
    return `{${Object.keys(v as object)
      .sort()
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stableJson((v as Record<string, unknown>)[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(v)
}

export type DraftInput = {
  /** The website deliverable's step, or undefined when the client has no website deliverable. */
  websiteStep: string | null | undefined
  /** Engagement.brief: a stored (approved) brief. */
  brief: string | null
  intake: IntakeWithDraft
  now?: Date
}

export type DraftDecision = { draft: true; version: string; replaces: string | null } | { draft: false; reason: string }

export function shouldDraftBrief(i: DraftInput): DraftDecision {
  if (i.websiteStep === undefined) return { draft: false, reason: 'no website deliverable' }
  if (i.websiteStep !== null && i.websiteStep !== 'brief') return { draft: false, reason: `website step is ${i.websiteStep}, past brief` }
  if (i.brief?.trim()) return { draft: false, reason: 'a brief is already stored' }
  const missing = intakeMissing(i.intake)
  if (missing.length) return { draft: false, reason: `intake still missing: ${missing.join(', ')}` }
  const photos = (i.intake.assets ?? []).filter((a) => a.kind === 'photo').length
  if (photos < BRIEF_DRAFT_MIN_PHOTOS) return { draft: false, reason: `${photos} photo${photos === 1 ? '' : 's'} on file, ${BRIEF_DRAFT_MIN_PHOTOS} needed` }
  const version = intakeVersion(i.intake)
  const prior = i.intake.briefDraft
  if (prior?.version === version && !(prior.status === 'failed' && prior.retryable)) return { draft: false, reason: `already drafted for this intake version (${prior.status})` }
  const now = (i.now ?? new Date()).getTime()
  if (prior?.status === 'drafting' && now - Date.parse(prior.startedAt) < BRIEF_DRAFT_STALE_MS) return { draft: false, reason: 'a draft is being written' }
  if ((prior?.count ?? 0) >= BRIEF_DRAFT_MAX) return { draft: false, reason: `${BRIEF_DRAFT_MAX} automatic drafts already; ask the chief for another` }
  return { draft: true, version, replaces: prior?.status === 'pending' ? prior.version : null }
}

/**
 * set_brief's own shape checks, in its order and with its exact messages, so a
 * draft that set_brief would refuse is never posted. set_brief calls this too.
 */
export function briefShapeProblem(brief: string): string | null {
  if (brief.length < 200) return 'the brief is too short to build from; fill the template'
  if (!/^#{1,3}\s*Standards applied\s*$/im.test(brief)) {
    return 'the brief needs a "## Standards applied" section (docs/ops/site-brief-standards.md, rule 10): three to eight lines naming each standard you applied and any place the client\'s answers overrode one'
  }
  if (/indexable[^\n]*\btrue\b/i.test(brief)) return 'launch.indexable must stay false in a brief; go_live flips it later'
  return null
}

export function briefProblem(brief: string, slug: string | null): string | null {
  return briefShapeProblem(brief) ?? (slug && !brief.includes(slug) ? `the brief must carry businessSlug ${slug} exactly` : null)
}

/** The one user turn the drafting call gets. */
export function draftPrompt(p: { client: unknown; template: string; standards: string }): string {
  return [
    'Write this client\'s site brief now, as a DRAFT for Jacob to read. You have no tools and cannot ask anything: work only from the client record below.',
    'Fill AA-Template\'s BRIEF.template.md (below) from the intake answers and the client\'s questionnaire answers, apply every rule in docs/ops/site-brief-standards.md (below), put unknowns under UNKNOWN and never invent anything, carry businessSlug from platformAccount.slug exactly, keep launch.indexable false, and end with a "## Standards applied" section of three to eight lines (where the client\'s answers override a standard, the client wins and you say so). Leave out the Assets and Old site sections; they are written from the intake when the brief is stored.',
    'Reply with the brief markdown only: no preamble, no closing line, no em dashes.',
    `## The client record (get_client)\n\n${JSON.stringify(p.client, null, 1)}`,
    `## BRIEF.template.md\n\n${p.template}`,
    `## docs/ops/site-brief-standards.md\n\n${p.standards}`,
  ].join('\n\n')
}

// -------------------------------------------
// The runner (side effects injected)
// -------------------------------------------

export type DraftDeps = {
  load(engagementId: string): Promise<{ name: string; websiteStep: string | null | undefined; brief: string | null; slug: string | null; intake: IntakeWithDraft } | null>
  /** Row-locked: re-checks shouldDraftBrief and, when still due, writes the drafting claim. Returns the claim or null. */
  claim(engagementId: string): Promise<BriefDraftState | null>
  /** The one bounded model call: no tools, one turn. Returns the brief text. */
  write(engagementId: string): Promise<string>
  /** Row-locked write of the finished draft (or the failure) for exactly this version. */
  finish(engagementId: string, state: BriefDraftState): Promise<void>
  /** Post the draft in the HQ chat for Jacob. */
  post(engagementId: string, name: string, text: string, replaces: boolean): Promise<void>
  activity(engagementId: string, body: string): Promise<void>
  log?: (line: string) => void
}

export type DraftOutcome = { drafted: boolean; reason: string }

export async function draftBriefIfReady(engagementId: string, trigger: DraftTrigger, deps: DraftDeps, now = new Date()): Promise<DraftOutcome> {
  const log = deps.log ?? ((l: string) => console.log(l))
  const c = await deps.load(engagementId)
  if (!c) return { drafted: false, reason: 'no such client' }
  const d = shouldDraftBrief({ websiteStep: c.websiteStep, brief: c.brief, intake: c.intake, now })
  if (!d.draft) return { drafted: false, reason: d.reason }
  const claim = await deps.claim(engagementId)
  if (!claim) return { drafted: false, reason: 'claimed by another trigger, or no longer due' }
  log(`[autoflow] brief draft started for ${c.name} (trigger ${trigger}, intake version ${claim.version})`)
  let text: string
  try {
    text = (await deps.write(engagementId)).trim()
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    // Retryable: the next trigger may try this version again (still capped by BRIEF_DRAFT_MAX).
    await deps.finish(engagementId, { ...claim, status: 'failed', error, retryable: true })
    await deps.activity(engagementId, `[autoflow] Brief draft failed (trigger ${trigger}): ${error}. Nothing was stored; the next intake save tries again, or ask the chief to write it.`)
    log(`[autoflow] brief draft FAILED for ${c.name}: ${error}`)
    return { drafted: false, reason: error }
  }
  const problem = briefProblem(text, c.slug)
  if (problem) {
    await deps.finish(engagementId, { ...claim, status: 'failed', error: problem })
    await deps.activity(engagementId, `[autoflow] Brief draft not posted (trigger ${trigger}): ${problem}. Ask the chief to write it.`)
    log(`[autoflow] brief draft REFUSED for ${c.name}: ${problem}`)
    return { drafted: false, reason: problem }
  }
  await deps.finish(engagementId, { ...claim, status: 'pending', draftedAt: now.toISOString(), text })
  await deps.post(engagementId, c.name, text, d.replaces !== null)
  await deps.activity(engagementId, `[autoflow] Brief drafted from the intake, waiting for your OK (trigger ${trigger}, intake version ${claim.version}). Nothing was stored, built or sent.`)
  log(`[autoflow] brief draft posted for ${c.name}`)
  return { drafted: true, reason: `drafted for intake version ${claim.version}` }
}

/** The HQ chat message that carries the draft. */
export function draftMessage(name: string, text: string, replaces: boolean): string {
  return [
    `Brief draft for ${name}, written from the intake${replaces ? ' (the intake changed, so this replaces the earlier draft)' : ''}. Nothing is stored or built yet.`,
    'Say "looks good" and I\'ll store it with set_brief, or tell me what to change.',
    '',
    text,
  ].join('\n')
}
