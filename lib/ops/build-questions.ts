// ===========================================
// Build anyway, ask at the end (OPS_AUTOFLOW, off by default)
// ===========================================
// Jacob's rule: build with what is known, look up the public listing for the
// gaps, ask him at the end. A fact the client has not given never stops a
// build. The template already has the convention for an unknown (AA-Template
// AGENT.md rule 1 and "Questions for Jacob"): the config field is null, its
// section does not render, the fact is listed under UNRESOLVED in
// BUILD-REPORT.md and as one question in CLIENT-TODO.md's "## Questions for
// Jacob". GBP.json fills what the public listing has first. Nothing visible is
// put on the page for a gap (verify check 8 fails on TODO, TKTK, [CITY] and the
// like), so a gap can hide a section but never publish a wrong fact.
//
// With the flag on:
//   the callback stores the build's open questions on the website evidence
//     (openQuestions, openQuestionsAt) after a green site_build or site_update;
//   the Ready-to-send strip drafts ONE text with them (questionsText);
//   the go-live gate lists each one (questionGateItems).
// launch.indexable stays false for every build (AGENT.md rule 7); only go_live
// flips it, and the gate holds go_live while a question is open.
//
// Pure.

import type { GateItem } from '@/lib/ops/launch-gate'

type Ev = Record<string, unknown>

/** Website evidence after a build's callback: the questions it came back with (none clears them). */
export function questionsEvidence(kind: string, succeeded: boolean, questions: string[], now = new Date()): Ev | null {
  if (!succeeded || (kind !== 'site_build' && kind !== 'site_update')) return null
  return { openQuestions: questions, openQuestionsAt: now.toISOString() }
}

/** The photo question, added when the build ran with no photos and the build's own list has none. */
export const PHOTOS_QUESTION = 'Can you send real photos of your work? Finished jobs, before and afters, your truck and crew. Right now the site has no photos.'

/**
 * The open questions on the website evidence. buildWithoutPhotos (set by
 * start_web_task when it built with no photos) adds the photo question when the
 * build did not already ask for photos.
 */
export function openQuestionsOf(evidence: Ev | null | undefined): { questions: string[]; at: string | null } {
  const q = evidence?.openQuestions
  const questions = Array.isArray(q) ? q.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim()) : []
  if (evidence?.buildWithoutPhotos === true && !questions.some((x) => /\b(photos?|pictures?|pics)\b/i.test(x))) questions.unshift(PHOTOS_QUESTION)
  return { questions, at: typeof evidence?.openQuestionsAt === 'string' ? evidence.openQuestionsAt : null }
}

/**
 * The site's public phone or email. Without them the site cannot go live at all
 * (AA-Template's go_live refuses and verify check 26 fails), so the gate item
 * cannot be skipped.
 */
export const isContactQuestion = (q: string) =>
  (/\b(phone|e-?mail|inbox)\b/i.test(q) || /\bnumber\b.*\bcall\b|\bcall\b.*\bnumber\b/i.test(q)) && !/\b(hours?|answers?|pick up)\b/i.test(q)

/** One gate item per open question. Contact questions cannot be skipped; the rest skip with "skip questions". */
export function questionGateItems(evidence: Ev | null | undefined): GateItem[] {
  return openQuestionsOf(evidence).questions.map((q) =>
    isContactQuestion(q)
      ? { key: 'missing_contact' as const, text: `open question from the build (cannot be skipped, the site would have no way to reach the client): ${q}` }
      : { key: 'open_question' as const, text: `open question from the build: ${q}` }
  )
}

const gsm = (s: string) => s.replace(/[\u2013\u2014]/g, ',').replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/\s+/g, ' ').trim()

export const MAX_TEXT_QUESTIONS = 8

/** The one text to the client: what is done first, then the questions, numbered. */
export function questionsText(name: string, questions: string[]): string | null {
  const qs = questions.map(gsm).filter(Boolean)
  if (!qs.length) return null
  const shown = qs.slice(0, MAX_TEXT_QUESTIONS)
  return [
    `${name ? `Hey ${name}, Jacob here.` : 'Hey, Jacob here.'} Your site's first version is built. I filled in everything I could from what you sent and your Google listing.`,
    `To finish it I need ${shown.length === 1 ? 'one thing' : 'a few things'} from you:\n${shown.map((q, i) => `${i + 1}. ${q}`).join('\n')}`,
    `${qs.length > shown.length ? "There are a couple more small ones I'll ask after these. " : ''}Rough answers are totally fine, just reply here.`,
  ].join('\n\n')
}
