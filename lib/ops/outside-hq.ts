// ===========================================
// Work done outside Ops HQ (OPS_AUTOFLOW, off by default)
// ===========================================
// Jacob merges PRs by hand, runs checks between jobs and changes his mind on a
// standing decision. Pure helpers for the three:
//
//   prNumbersInCommit   a production deployment's commit message names the PR it
//                       came from: GitHub's squash merge ends the subject with
//                       "(#12)", a merge commit starts "Merge pull request #12".
//                       The web checks already fetch the production deployment
//                       from Vercel; with the flag on they keep its commit message
//                       and add the PR numbers to website evidence
//                       productionPrsSeen. pr-state then counts those as merged.
//                       No GitHub call. A PR that reached production but was
//                       overtaken by a later commit before any check run is not
//                       seen; it still reads as open, the safe side.
//   activeDecisions     record_decision writes "DECISION: ..." activities;
//                       supersede_decision adds the new one plus a marker
//                       "DECISION SUPERSEDED [<old activity id>]: ...". Both stay in
//                       the history; only the decisions handed to specialists drop
//                       the superseded one. Nothing is deleted or edited.

export function prNumbersInCommit(message: string | null | undefined): number[] {
  const subject = (message ?? '').split('\n')[0].trim()
  const out = new Set<number>()
  const squash = /\(#(\d+)\)\s*$/.exec(subject)
  if (squash) out.add(Number(squash[1]))
  const merge = /^Merge pull request #(\d+)\b/i.exec(subject)
  if (merge) out.add(Number(merge[1]))
  return Array.from(out).filter((n) => Number.isFinite(n) && n > 0)
}

/** The evidence list after this check run: what was seen before plus what production shows now. */
export function prsSeenAfter(before: unknown, productionState: string | null | undefined, message: string | null | undefined): number[] | null {
  if (productionState !== 'READY') return null
  const now = prNumbersInCommit(message)
  if (!now.length) return null
  const prev = Array.isArray(before) ? before.filter((n): n is number => typeof n === 'number') : []
  const merged = Array.from(new Set([...prev, ...now])).sort((a, b) => a - b)
  return merged.length === prev.length ? null : merged.slice(-50)
}

export const SUPERSEDED_PREFIX = 'DECISION SUPERSEDED ['

export function supersededMarker(oldId: string, oldText: string, newText: string): string {
  return `${SUPERSEDED_PREFIX}${oldId}]: "${oldText}" is replaced by "${newText}"`
}

export function supersededIds(markers: string[]): Set<string> {
  const out = new Set<string>()
  for (const m of markers) {
    const id = /^DECISION SUPERSEDED \[([^\]]+)\]/.exec(m)?.[1]
    if (id) out.add(id)
  }
  return out
}

export type DecisionRow = { id: string; engagementId: string; body: string }

/** The decision rows still standing: every DECISION row whose id no marker names. */
export function activeDecisions(rows: DecisionRow[], markers: string[]): DecisionRow[] {
  const gone = supersededIds(markers)
  return rows.filter((r) => !gone.has(r.id))
}

/** The one standing decision that matches Jacob's words: exact (ignoring case), else the only one containing them. */
export function findDecision(rows: { id: string; text: string }[], words: string): { id: string; text: string } | { error: string } {
  const w = words.trim().toLowerCase()
  if (!w) return { error: 'say which decision to replace' }
  const exact = rows.filter((r) => r.text.trim().toLowerCase() === w)
  if (exact.length === 1) return exact[0]
  const part = rows.filter((r) => r.text.toLowerCase().includes(w))
  if (part.length === 1) return part[0]
  if (!part.length) return { error: `no standing decision matches "${words.trim()}"` }
  return { error: `${part.length} standing decisions match "${words.trim()}"; quote the one to replace: ${part.map((r) => `"${r.text}"`).join(', ')}` }
}
