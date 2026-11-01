// ===========================================
// /review/<token>: the client reviews their preview (PREVIEW_FEEDBACK)
// ===========================================
// Off unless PREVIEW_FEEDBACK is exactly 'true': the page and every
// /api/review route answer 404, the chief has no link tool, and the preview
// text draft is unchanged.
//
// Same token scheme as the intake link (lib/ops/client-intake.ts), with its own
// purpose prefix ("preview-feedback:v1:"), so an intake link never opens this
// page or the other way round. The nonce lives at Engagement.intake.previewLink
// (not an INTAKE_KEY), the notes at intake.previewFeedback (not an INTAKE_KEY):
// save_intake, the admin PATCH and the intake link cannot write either.
//
// Notes become a site_update instruction by a fixed template, not a model call:
// the client's own words, page by page, are already what the site agent needs,
// and a template cannot invent a change or soften one. The draft is posted in
// the HQ chat for Jacob; only his "go" makes the chief start the run.
//
// "Looks good" records the approval and moves the website step from send_preview
// or client_review to `approved` ("Approved, ready for go-live" in STEP_CATALOG),
// waiting on Jacob, because the merge is still his Push. The step right after
// client_review in the catalog is `revisions`, which is for a client who asked for
// changes, so approval skips it. Nothing here merges, dispatches, goes live or sends.

import { createHash, timingSafeEqual } from 'crypto'
import type { Intake } from '@/lib/ops/intake'
import type { ClientLinkState } from '@/lib/ops/client-intake'

export function previewFeedbackEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.PREVIEW_FEEDBACK === 'true'
}

export type PreviewFeedbackState = {
  notes: Record<string, string>
  updatedAt: string
  /** The preview the notes were written against. */
  previewUrl?: string
  submittedAt?: string
  /** Hash of the notes last turned into a draft, so the same notes post once. */
  submittedHash?: string
  draft?: string
  approvedAt?: string
}

export type IntakeWithPreview = Intake & { previewLink?: ClientLinkState; previewFeedback?: PreviewFeedbackState }

export function previewNonceIsCurrent(claim: { engagementId: string; nonce: string }, e: { id: string; intake: IntakeWithPreview }): boolean {
  const state = e.intake.previewLink
  if (e.id !== claim.engagementId || !state?.nonce) return false
  const a = Buffer.from(state.nonce, 'utf8')
  const b = Buffer.from(claim.nonce, 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}

export function previewLinkUrl(token: string, base = process.env.NEXT_PUBLIC_APP_URL || 'https://www.alignandacquire.com'): string {
  return `${base.replace(/\/$/, '')}/review/${token}`
}

// -------------------------------------------
// The pages
// -------------------------------------------

export type ReviewPage = { key: string; label: string }

/**
 * One box per page of the site. No route list is recorded in the website
 * evidence, so the pages are the fixed set plus one per service on the intake
 * (site brief standards section 1: each service gets its page), at most 8.
 */
export function reviewPages(intake: Intake): ReviewPage[] {
  const services = (intake.services ?? [])
    .map((s) => s.name?.trim())
    .filter((n): n is string => Boolean(n))
    .slice(0, 8)
  return [
    { key: 'home', label: 'Home page' },
    ...services.map((name, n) => ({ key: `service-${n + 1}`, label: `${name} page` })),
    { key: 'about', label: 'About page' },
    { key: 'contact', label: 'Contact page' },
    { key: 'other', label: 'Anything else' },
  ]
}

export class NotesError extends Error {}
export const MAX_NOTE_CHARS = 4000

/** { notes: { "<page key>": "<text>" } }, keys from reviewPages only. */
export function readNotesPatch(body: unknown, pages: ReviewPage[]): Record<string, string> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new NotesError('body must be an object')
  const keys = Object.keys(body as object)
  if (keys.length !== 1 || keys[0] !== 'notes') throw new NotesError('only notes can be saved here')
  const notes = (body as { notes: unknown }).notes
  if (!notes || typeof notes !== 'object' || Array.isArray(notes)) throw new NotesError('notes must be an object')
  const allowed = new Set(pages.map((p) => p.key))
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(notes as Record<string, unknown>)) {
    if (!allowed.has(k)) throw new NotesError(`no page ${k}`)
    if (typeof v !== 'string') throw new NotesError(`note ${k} must be text`)
    if (v.length > MAX_NOTE_CHARS) throw new NotesError(`note ${k} is too long`)
    out[k] = v.replace(/\r\n/g, '\n')
  }
  return out
}

/** Autosave: merge, clear on empty, keep every other note and intake key. */
export function applyNotes(intake: IntakeWithPreview, patch: Record<string, string>, previewUrl: string | null, now = new Date()): IntakeWithPreview {
  const notes = { ...(intake.previewFeedback?.notes ?? {}) }
  for (const [k, v] of Object.entries(patch)) {
    if (v.trim()) notes[k] = v
    else delete notes[k]
  }
  return { ...intake, previewFeedback: { ...(intake.previewFeedback ?? {}), notes, updatedAt: now.toISOString(), ...(previewUrl ? { previewUrl } : {}) } }
}

const filledNotes = (state: PreviewFeedbackState | undefined) => Object.entries(state?.notes ?? {}).filter(([, v]) => v.trim())

export const notesHash = (notes: [string, string][]) => createHash('sha256').update(JSON.stringify(notes.sort())).digest('hex').slice(0, 16)

/**
 * The site_update instruction from the client's notes, by a fixed template:
 * their words, page by page, and the standing limits. Null with no notes.
 */
export function draftInstruction(client: string, pages: ReviewPage[], state: PreviewFeedbackState | undefined): string | null {
  const notes = filledNotes(state)
  if (!notes.length) return null
  const label = new Map(pages.map((p) => [p.key, p.label]))
  const lines = pages.filter((p) => notes.some(([k]) => k === p.key)).map((p) => `- ${label.get(p.key)}: ${state!.notes[p.key].trim().replace(/\s*\n\s*/g, ' ')}`)
  return [
    `Client feedback on the preview of ${client}'s site, in their own words${state?.previewUrl ? ` (preview ${state.previewUrl})` : ''}. Make these changes and nothing else:`,
    ...lines,
    'Rules: change only what a note asks for; keep every other page, section and line as it is; do not invent facts, prices, reviews or claims; when a note asks for something the site cannot do or that needs a fact you do not have, leave it and list it under Questions for Jacob in CLIENT-TODO.md. No em dashes.',
  ].join('\n')
}

/** Submit: the intake to store and the draft to post, or null when these notes were already drafted. */
export function submitNotes(intake: IntakeWithPreview, client: string, pages: ReviewPage[], now = new Date()): { intake: IntakeWithPreview; draft: string | null } {
  const state = intake.previewFeedback
  const draft = draftInstruction(client, pages, state)
  if (!draft || !state) return { intake, draft: null }
  const hash = notesHash(filledNotes(state))
  if (state.submittedHash === hash) return { intake, draft: null }
  return { intake: { ...intake, previewFeedback: { ...state, submittedAt: now.toISOString(), submittedHash: hash, draft } }, draft }
}

/** The step "Looks good" moves to, or null when the website is not at a review step. */
export function stepOnApprove(current: string | null | undefined): 'approved' | null {
  return current === 'send_preview' || current === 'client_review' ? 'approved' : null
}

/** The HQ chat message that carries the draft. Jacob's "go" starts the run. */
export function draftMessage(client: string, draft: string): string {
  return [
    `${client} sent notes on the preview. Here is the site_update I would run. Say "go" and I'll start it; nothing has run, nothing is merged.`,
    '',
    draft,
  ].join('\n')
}

export type PublicReview = {
  businessName: string
  firstName: string
  previewUrl: string | null
  pages: ReviewPage[]
  notes: Record<string, string>
  submitted: boolean
  approved: boolean
}

export function publicReview(e: { displayName: string; contactName: string | null; intake: IntakeWithPreview; previewUrl: string | null }): PublicReview {
  const first = e.contactName?.trim().split(/\s+/)[0] ?? ''
  return {
    businessName: e.displayName.trim(),
    firstName: first && !/\d/.test(first) ? first : '',
    previewUrl: e.previewUrl,
    pages: reviewPages(e.intake),
    notes: { ...(e.intake.previewFeedback?.notes ?? {}) },
    submitted: Boolean(e.intake.previewFeedback?.submittedAt),
    approved: Boolean(e.intake.previewFeedback?.approvedAt),
  }
}

export const REVIEW_LIMITS = { read: 60, save: 60, submit: 10, approve: 10 } as const
export type ReviewRoute = keyof typeof REVIEW_LIMITS
