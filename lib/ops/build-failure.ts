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

// A red gate. aa-build.yml sends verify_tail, the last 40 lines of
// `npm run verify` (which is `next build` and then the checks). When next build
// dies there is no FAILED summary line and the workflow reports the failing
// check as "next build"; the error itself is only in the tail.

const BUILD_ERROR = /^(Error\b|TypeError\b|Type error\b|ReferenceError\b|SyntaxError\b|Module not found\b)|Can't resolve|Error occurred prerendering|ENOENT|no such file/i
const NOISE = /^(npm (ERR!|error|warn)|> |at |\^|~+$|-+$|Failed to compile\.?$|Build error occurred$|Next\.js build worker exited)/i

/** The line of the gate output that says what broke, or null. */
export function gateErrorLine(verifyTail: string | null): string | null {
  const lines = (verifyTail ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !NOISE.test(l))
  const line = lines.find((l) => BUILD_ERROR.test(l)) ?? lines.pop()
  if (!line) return null
  return line.length > REASON_MAX ? `${line.slice(0, REASON_MAX - 3)}...` : line
}

/** "gate red: next build failed on X" or "gate red: failing #4, #21"; null when the gate passed or was not reported. */
export function gateReason(verifyPassed: boolean | null, failingChecks: string[], verifyTail: string | null): string | null {
  if (verifyPassed !== false) return null
  const checks = failingChecks.filter((c) => c && c !== 'next build')
  const line = gateErrorLine(verifyTail)
  if (checks.length) return `gate red: failing ${checks.join(', ')}${line && failingChecks.includes('next build') ? `; next build failed on ${line}` : ''}`
  return line ? `gate red: next build failed on ${line}` : 'gate red'
}
