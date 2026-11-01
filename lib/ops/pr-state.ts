// ===========================================
// Is the site's newest PR merged? (from what the platform recorded, no GitHub call)
// ===========================================
// Pure. The facts are the platform's own records:
//   - the newest succeeded site_build / site_update AgentRun with a PR (output.prUrl)
//     and a gate that did not fail, the same runs latestPr (lib/ops/hq/web.ts) uses;
//   - applied web_push approvals with action merge (applyWebPush squash-merges and
//     records detail.prNumber).
// A PR merged or closed by hand in GitHub is not recorded, so it reads as open:
// callers that must not run ahead of a merge treat "open" and "unknown" as not merged.
// With OPS_AUTOFLOW on, pr-state-server also passes the PR numbers the web checks
// saw production deployed from (website evidence productionPrsSeen, from the
// production commit message; lib/ops/outside-hq.ts), so a hand merge counts.

export type PrRun = { kind: string; status: string; finishedAt: Date | string | null; output: unknown }
export type MergeRecord = { prNumber: number }

export type PrState = { state: 'merged'; number: number } | { state: 'open'; number: number } | { state: 'unknown' }

export function prNumberOf(output: unknown): number | null {
  const o = (output ?? {}) as Record<string, unknown>
  if (o.verifyPassed === false) return null
  const n = typeof o.prUrl === 'string' ? Number(/\/pull\/(\d+)/.exec(o.prUrl)?.[1]) : NaN
  return Number.isFinite(n) && n > 0 ? n : null
}

export function sitePrState(runs: PrRun[], merges: MergeRecord[]): PrState {
  const newest = runs
    .filter((r) => (r.kind === 'site_build' || r.kind === 'site_update') && r.status === 'succeeded' && prNumberOf(r.output) !== null)
    .sort((a, b) => new Date(b.finishedAt ?? 0).getTime() - new Date(a.finishedAt ?? 0).getTime())[0]
  if (!newest) return { state: 'unknown' }
  const number = prNumberOf(newest.output)!
  return merges.some((m) => m.prNumber === number) ? { state: 'merged', number } : { state: 'open', number }
}

/** The waiting note when the client approved but the merge is still ahead. */
export function mergeFirstNote(pr: PrState): string {
  return pr.state === 'open' ? `Client approved the preview; merge the open PR (#${pr.number}) first` : 'Client approved the preview; merge the open PR first'
}

/**
 * What "Looks good" does to the website deliverable: move to approved only from a
 * review step and only with the recorded PR merged; otherwise keep the step and
 * leave the merge-first note for Jacob. null when the step is not a review step.
 */
export function onLooksGood(websiteStep: string | null | undefined, pr: PrState): { step: 'approved' | null; waitingNote: string } | null {
  if (websiteStep !== 'send_preview' && websiteStep !== 'client_review') return null
  return pr.state === 'merged'
    ? { step: 'approved', waitingNote: 'Client approved the preview; the merge is your Push' }
    : { step: null, waitingNote: mergeFirstNote(pr) }
}
