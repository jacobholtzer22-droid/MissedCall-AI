// ===========================================
// /admin/ops: why a build run failed
// ===========================================
// Pure. On a failed run aa-build.yml sends failure_tail: the last 20 lines of
// the agent's final result text (or "Claude stopped without a result (...)").
// The callback stores it on the run, and the chief and the job report read it
// to say why the run failed.

const TAIL_MAX = 4000
const REASON_MAX = 300

/** The failure text the workflow sent, trimmed and capped; null when there is none. */
export function readFailureTail(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t ? t.slice(-TAIL_MAX) : null
}

/** One line for the run's error: the last non-empty line of the tail. */
export function failureReason(tail: string | null): string | null {
  const last = tail
    ?.split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .pop()
  if (!last) return null
  return last.length > REASON_MAX ? `${last.slice(0, REASON_MAX - 3)}...` : last
}
