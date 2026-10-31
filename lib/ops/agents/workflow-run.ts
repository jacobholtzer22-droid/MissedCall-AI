// ===========================================
// /admin/ops agents — confirming the workflow actually runs
// ===========================================
// A 204 from repository_dispatch only means GitHub accepted the event. If the
// repo has no aa-build.yml on its default branch, nothing ever runs and the
// AgentRun would sit at 'dispatched' forever. Three guards:
//
//   1. Before dispatch, aa-build.yml must be readable through the API, and so
//      must the repo's Actions runs, or guard 2 could never see the run
//      (confirmWorkflowReady). Either fails: refuse. A fine-grained token
//      without "Actions: read" can list runs on public repos only.
//   2. After a 204, watchForWorkflowRun polls the repo's aa-build runs for up
//      to WATCH_MS and writes the run id to AgentRun.externalId (and the run
//      URL to output.runUrl). Nothing appears: the run fails with
//      "workflow never started".
//   3. The ops sync fails any run still 'dispatched' STALE_MS after dispatch,
//      run id or not (failStaleDispatchedRuns): "callback never arrived; check
//      the workflow run", with the run URL when known. It is the backstop for
//      a watcher the platform killed, and for a workflow that ran but whose
//      callback was rejected or never sent.
//
// A run failed by either guard that turns out to have run is still finished
// by its callback (callback.ts, lateCallbackMayFinish), so a slow GitHub
// queue never loses a build's result.
//
// Runs carry no run_id GitHub can see before the job starts, so a run is
// matched by time: the oldest repository_dispatch run of aa-build.yml created
// no earlier than CLOCK_SKEW_MS before the dispatch and not already claimed by
// another AgentRun.

import type { Prisma } from '@prisma/client'
import { waitUntil } from '@vercel/functions'
import { db } from '@/lib/db'
import { getFileContent, listWorkflowFileRuns, type WorkflowRun } from '@/lib/ops/github'
import { emit } from '@/lib/ops/hq/events'
import { WORKFLOW_PATH } from './shared'

export const NO_WORKFLOW_REASON = 'repo has no aa-build workflow, run sync-workflow first'
export const NO_ACTIONS_READ_REASON = 'cannot read the repo\'s Actions runs, so the run could not be confirmed: GITHUB_OPS_TOKEN needs Actions: read'
export const NEVER_STARTED_REASON = 'workflow never started'
export const CALLBACK_NEVER_ARRIVED_REASON = 'callback never arrived; check the workflow run'
/** Errors a late callback may overwrite: both mean "we gave up waiting", not "it failed". */
export const LATE_CALLBACK_REASONS = [NEVER_STARTED_REASON, CALLBACK_NEVER_ARRIVED_REASON] as const
export const WATCH_MS = 10 * 60_000
export const POLL_MS = 15_000
export const STALE_MS = 20 * 60_000
const CLOCK_SKEW_MS = 30_000
const WORKFLOW_FILE = WORKFLOW_PATH.split('/').pop()!

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err))

/**
 * null when aa-build.yml is confirmed on the default branch and its runs can
 * be listed, else why not.
 */
export async function confirmWorkflowReady(repo: string): Promise<string | null> {
  try {
    const text = await getFileContent(repo, WORKFLOW_PATH)
    if (!text?.trim()) return NO_WORKFLOW_REASON
  } catch (err) {
    return `${NO_WORKFLOW_REASON} (could not read it: ${errText(err)})`
  }
  try {
    await listWorkflowFileRuns(repo, WORKFLOW_FILE, 'repository_dispatch', new Date())
    return null
  } catch (err) {
    return `${NO_ACTIONS_READ_REASON} (${errText(err)})`
  }
}

/** The run that belongs to a dispatch made at dispatchedAt, or null. Pure. */
export function pickWorkflowRun(runs: WorkflowRun[], dispatchedAt: Date, claimedIds: Set<string>): WorkflowRun | null {
  const floor = dispatchedAt.getTime() - CLOCK_SKEW_MS
  return (
    runs
      .filter((r) => r.event === 'repository_dispatch' && Date.parse(r.created_at) >= floor && !claimedIds.has(String(r.id)))
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id - b.id)[0] ?? null
  )
}

/** The numeric run id in an Actions run URL (…/actions/runs/123), or null. */
export function runIdFromUrl(url: string): string | null {
  return url.match(/\/actions\/runs\/(\d+)/)?.[1] ?? null
}

/** True when a failed run's error is one a late callback may overwrite. Pure. */
export function lateCallbackMayFinish(status: string, error: string | null): boolean {
  return status === 'failed' && !!error && LATE_CALLBACK_REASONS.some((r) => error.startsWith(r))
}

/** The stale-run error: the reason plus the workflow run URL when one is known. Pure. */
export function staleRunError(repo: string | null, externalId: string | null, runUrl: unknown): string {
  const url =
    typeof runUrl === 'string' && runUrl.startsWith('http')
      ? runUrl
      : externalId && repo
        ? `https://github.com/${repo}/actions/runs/${runIdFromUrl(externalId) ?? externalId}`
        : null
  return url ? `${CALLBACK_NEVER_ARRIVED_REASON}: ${url}` : CALLBACK_NEVER_ARRIVED_REASON
}

/** Run ids other AgentRuns on this repo already hold, so two dispatches never claim one run. */
async function claimedRunIds(repo: string, exceptRunId: string): Promise<Set<string>> {
  const rows = await db.agentRun.findMany({
    where: { id: { not: exceptRunId }, externalId: { not: null }, input: { path: ['repo'], equals: repo } },
    select: { externalId: true },
  })
  return new Set(rows.map((r) => (r.externalId && (runIdFromUrl(r.externalId) ?? r.externalId)) || '').filter(Boolean))
}

/**
 * Fail a run that never reached GitHub Actions, if nothing has finished it or
 * found its run id meanwhile. Returns whether this call failed it.
 */
export async function failNeverStarted(runId: string, detail: string): Promise<boolean> {
  return failDispatchedRun(runId, NEVER_STARTED_REASON, detail, true)
}

/**
 * Fail a run still 'dispatched' with error, writing the activity and the feed
 * event and waking its job. withoutRunIdOnly: only when no run id was found.
 */
async function failDispatchedRun(runId: string, error: string, detail: string, withoutRunIdOnly: boolean): Promise<boolean> {
  const done = await db.agentRun.updateMany({
    where: { id: runId, status: 'dispatched', finishedAt: null, ...(withoutRunIdOnly ? { externalId: null } : {}) },
    data: { status: 'failed', error, finishedAt: new Date() },
  })
  if (done.count === 0) return false
  const run = await db.agentRun.findUnique({ where: { id: runId }, select: { kind: true, engagementId: true, jobId: true, input: true } })
  const repo = (run?.input as { repo?: string } | null)?.repo ?? 'the repo'
  if (run?.engagementId) {
    await db.opsActivity.create({ data: { engagementId: run.engagementId, kind: 'system', body: `Agent ${run.kind} on ${repo} failed: ${error} (${detail})` } })
  }
  await emit(runId, 'error', `${error} (${detail})`)
  if (run?.jobId) {
    // The job report can be a long chief turn: held open in the background, as
    // the callback route does, so the ops sync is not kept waiting on it.
    const jobId = run.jobId
    waitUntil(
      import('@/lib/ops/hq/jobs')
        .then(({ onSpecialistRunEnded }) => onSpecialistRunEnded(jobId))
        .catch((err) => console.error('[ops/workflow-run] job report failed:', err instanceof Error ? err.message : err))
    )
  }
  return true
}

/**
 * Poll for the dispatched run's GitHub Actions run and record it. Never
 * throws. Stops early when the run finishes some other way (callback, cancel).
 */
export async function watchForWorkflowRun(runId: string, repo: string, dispatchedAt: Date, opts: { watchMs?: number; pollMs?: number } = {}): Promise<void> {
  const watchMs = opts.watchMs ?? WATCH_MS
  const pollMs = opts.pollMs ?? POLL_MS
  const deadline = dispatchedAt.getTime() + watchMs
  const since = new Date(dispatchedAt.getTime() - CLOCK_SKEW_MS)
  let lastError: string | null = null
  try {
    for (;;) {
      const row = await db.agentRun.findUnique({ where: { id: runId }, select: { status: true, externalId: true, output: true } })
      if (!row || row.externalId || row.status !== 'dispatched') return
      try {
        const found = pickWorkflowRun(await listWorkflowFileRuns(repo, WORKFLOW_FILE, 'repository_dispatch', since), dispatchedAt, await claimedRunIds(repo, runId))
        if (found) {
          const output = { ...((row.output ?? {}) as Record<string, unknown>), runUrl: found.html_url }
          const set = await db.agentRun.updateMany({
            where: { id: runId, externalId: null },
            data: { externalId: String(found.id), output: output as Prisma.InputJsonObject },
          })
          if (set.count) await emit(runId, 'status', `Workflow run ${found.id} started on GitHub Actions.`)
          return
        }
        lastError = null
      } catch (err) {
        lastError = errText(err)
      }
      if (Date.now() + pollMs > deadline) break
      await new Promise((r) => setTimeout(r, pollMs))
    }
    await failNeverStarted(runId, `no aa-build run on ${repo} within ${Math.round(watchMs / 60_000)} minutes of dispatch${lastError ? `; last poll error: ${lastError}` : ''}`)
  } catch (err) {
    console.error(`[ops/workflow-run] watch ${runId} failed:`, err instanceof Error ? err.message : err)
  }
}

/** Ops sync backstop: runs still 'dispatched' STALE_MS after dispatch, with or without a run id. */
export async function failStaleDispatchedRuns({ dryRun, now }: { dryRun: boolean; now: Date }): Promise<string[]> {
  const cutoff = new Date(now.getTime() - STALE_MS)
  const stale = await db.agentRun.findMany({
    where: { status: 'dispatched', finishedAt: null, OR: [{ startedAt: { lt: cutoff } }, { startedAt: null, createdAt: { lt: cutoff } }] },
    select: { id: true, kind: true, input: true, externalId: true, output: true },
  })
  const failed: string[] = []
  for (const r of stale) {
    const repo = (r.input as { repo?: string } | null)?.repo ?? null
    const label = `${r.kind} ${r.id} (${repo ?? 'no repo'})`
    const error = staleRunError(repo, r.externalId, (r.output as { runUrl?: unknown } | null)?.runUrl)
    if (dryRun || (await failDispatchedRun(r.id, error, `still dispatched ${STALE_MS / 60_000} minutes after dispatch`, false))) failed.push(label)
  }
  return failed
}
