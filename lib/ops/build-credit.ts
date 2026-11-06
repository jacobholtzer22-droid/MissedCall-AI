// ===========================================
// Build credit is out (OPS_AUTOFLOW, off by default)
// ===========================================
// The build key (ANTHROPIC_API_KEY_BUILDS, the repo secret ANTHROPIC_API_KEY on
// the client repos) running out of credit fails a run in one of two places:
//   a web build: the workflow's failure_tail (the Claude Code action's result
//     text) carries the API's message, "Your credit balance is too low to
//     access the Anthropic API..." or Claude Code's "Credit balance is too low";
//   an ads or chief run: lib/ops/hq/anthropic.ts throws "Anthropic HTTP 400:
//     Your credit balance is too low..." and the run's error holds it.
// A pre-flight cannot see the balance, so this is after the failure only: the
// job report files it as a Setup item and the chief does not offer a rerun,
// which would fail the same way.
//
// Cost per run: HQ runs on the platform key (chief, ads, research, photo) get
// output.costUsd when they end (lib/ops/hq/usage.ts). Web builds run on GitHub
// and send no cost. A run output with a numeric costUsd is averaged; otherwise
// the item says "cost not recorded".
//
// Pure.

const CREDIT = /credit balance is too low|purchase credits|insufficient (credit|balance)|out of credits?|billing_error/i

/** True when the run's error or the agent's last words say the build key is out of credit. */
export function isCreditFailure(...texts: (string | null | undefined)[]): boolean {
  return texts.some((t) => typeof t === 'string' && CREDIT.test(t))
}

/** The average recorded cost of recent runs, from output.costUsd; null when none recorded one. */
export function averageRunCost(outputs: unknown[]): number | null {
  const costs = outputs
    .map((o) => (o && typeof o === 'object' ? (o as Record<string, unknown>).costUsd : null))
    .filter((c): c is number => typeof c === 'number' && Number.isFinite(c) && c > 0)
  return costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : null
}

export function creditSetupItem(avgCost: number | null): string {
  const cost = avgCost === null ? 'cost not recorded' : `last runs cost about $${avgCost < 10 ? avgCost.toFixed(2) : Math.round(avgCost)} each`
  return `Build credit is out: add credit to the ANTHROPIC_API_KEY_BUILDS account; ${cost}.`
}

export const CREDIT_NO_RERUN = 'Do not offer or start a rerun for this run: it failed because the build credit is out and would fail the same way. Give Jacob the Setup line instead.'
