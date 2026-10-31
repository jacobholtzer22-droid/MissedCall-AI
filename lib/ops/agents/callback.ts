// ===========================================
// /admin/ops agents — the workflow's signed result
// ===========================================
// aa-build.yml POSTs JSON with header X-AA-Signature: the hex HMAC-SHA256 of
// the exact body bytes, keyed with OPS_CALLBACK_SECRET. The signature is
// checked over the raw body before anything is parsed, with a constant-time
// compare.
//
// Body (what the workflow sends): { run_id, kind, status, branch, pr_url,
// verify_passed, failing_checks, report_excerpt, run_url?, failure_tail? }.
// status is the GitHub job status: success | failure | cancelled.
// failure_tail, on a failed run only, is the end of the agent's result text;
// it is stored as output.failureTail and its last line goes into the error.
// client_todo (CLIENT-TODO.md's "Questions for Jacob", 4k max) is stored as
// output.clientTodo and written as an "Open questions from build" note on the
// client. design_direction (the report's "Design direction" item, 2k max) is
// parsed into output.style { direction, pairing, headingAccent }, which the
// next dispatch reads as style history.
//
// Idempotent per run_id: once a run has finished, a repeat callback changes
// nothing and answers 200 { duplicate: true }.
//
// Also: the Vercel preview of the branch (output.previewUrl, website evidence),
// a feed event on the run, and for a successful go_live the PR is squash-merged
// and its branch deleted (Jacob already pushed the go-live). The outcome
// carries the run's jobId so the route can let the job report.

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { defaultWaitingOn } from '@/lib/ops/steps'
import { deleteBranch, getRepo, mergePullRequest, openPullRequest } from '@/lib/ops/github'
import { listDeploymentsForBranch } from '@/lib/ops/vercel'
import { emit } from '@/lib/ops/hq/events'
import { mergeEvidence } from './shared'
import { CALLBACK_NEVER_ARRIVED_REASON, NEVER_STARTED_REASON, lateCallbackMayFinish, runIdFromUrl } from './workflow-run'
import { failureReason, readFailureTail } from '@/lib/ops/build-failure'
import { parseDesignDirection, questionsFrom } from '@/lib/ops/build-style'

/**
 * Open the PR the workflow could not. Repos default to "GitHub Actions may not
 * create pull requests", so aa-build.yml pushes the branch and reports
 * pr_url null; GITHUB_OPS_TOKEN can open it. Never throws: a failure is
 * returned and lands in the run's output and the activity line.
 */
async function openPrForRun(
  repo: string,
  branch: string,
  kind: string,
  report: string | null
): Promise<{ url: string | null; error: string | null }> {
  try {
    const info = await getRepo(repo)
    if (!info) return { url: null, error: `repo ${repo} not found` }
    const body = [report?.trim() || '(no BUILD-REPORT.md excerpt)', '', '---', 'Opened by the ops platform from the agent branch.'].join('\n')
    const pr = await openPullRequest(repo, branch, info.defaultBranch, `${kind}: ${branch.replace(/^build\//, '')}`, body)
    return { url: pr.url, error: null }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // 422 "No commits between": the agent changed nothing. Not an error worth shouting about.
    return { url: null, error: /no commits between/i.test(msg) ? 'branch has no changes; no PR' : msg }
  }
}

export function signBody(rawBody: string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
}

/** Constant-time check of a hex HMAC-SHA256 signature (an optional "sha256=" prefix is accepted). */
export function verifySignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header) return false
  const given = header.trim().replace(/^sha256=/i, '').toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(given)) return false
  const expected = Buffer.from(signBody(rawBody, secret), 'hex')
  return timingSafeEqual(expected, Buffer.from(given, 'hex'))
}

/** run_id from a callback body that may be unsigned or malformed, or null. Pure. */
export function readRunId(raw: string): string | null {
  try {
    const v = JSON.parse(raw) as { run_id?: unknown } | null
    return v && typeof v.run_id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v.run_id) ? v.run_id : null
  } catch {
    return null
  }
}

/** The feed line for a rejected callback. Pure. */
export function rejectionLabel(repo: string | null, status: number, reason: string): string {
  return `Callback from ${repo ?? 'an unknown repo'} rejected (${status}): ${reason}`
}

/**
 * Record a rejected callback so it shows on the desk instead of vanishing: an
 * AgentEvent on the run when the body names a run that exists, and a log line
 * with the repo either way. The body may be unsigned, so only an existing run
 * id is trusted, and nothing in the body but run_id is read. Never throws.
 */
export async function logCallbackRejection(raw: string, status: number, reason: string): Promise<void> {
  try {
    const runId = readRunId(raw)
    const run = runId ? await db.agentRun.findUnique({ where: { id: runId }, select: { id: true, input: true } }) : null
    const repo = (run?.input as { repo?: string } | null)?.repo ?? null
    const label = rejectionLabel(repo, status, reason)
    console.warn(`[ops/build-callback] ${label}${runId ? ` (run_id ${runId}${run ? '' : ', no such run'})` : ''}`)
    if (run) await emit(run.id, 'error', label)
  } catch (err) {
    console.error('[ops/build-callback] could not record the rejection:', err instanceof Error ? err.message : err)
  }
}

export type CallbackBody = {
  run_id: string
  kind: string
  status: string
  branch?: string | null
  pr_url?: string | null
  verify_passed?: boolean
  failing_checks?: string[]
  report_excerpt?: string | null
  run_url?: string | null
  failure_tail?: string | null
  client_todo?: string | null
  design_direction?: string | null
}

export type CallbackOutcome =
  | { status: 200; body: { ok: true; runId: string; runStatus: string; duplicate?: boolean; stepSet?: string | null }; jobId?: string | null }
  | { status: 400 | 404; body: { error: string } }

const SUCCESS = new Set(['success', 'succeeded'])

export async function applyCallback(raw: string): Promise<CallbackOutcome> {
  let body: CallbackBody
  try {
    body = JSON.parse(raw)
  } catch {
    return { status: 400, body: { error: 'body is not JSON' } }
  }
  if (!body || typeof body.run_id !== 'string' || !body.run_id) return { status: 400, body: { error: 'run_id is required' } }
  if (typeof body.status !== 'string') return { status: 400, body: { error: 'status is required' } }

  const run = await db.agentRun.findUnique({ where: { id: body.run_id } })
  if (!run) return { status: 404, body: { error: `no agent run ${body.run_id}` } }
  // Only web runs reach this route, and they always carry a client (chief runs do not).
  const engagementId = run.engagementId
  if (!engagementId) return { status: 400, body: { error: `agent run ${run.id} has no client` } }
  const late = lateCallbackMayFinish(run.status, run.error)
  if (run.finishedAt && (run.status === 'succeeded' || run.status === 'failed') && !late) {
    return { status: 200, body: { ok: true, runId: run.id, runStatus: run.status, duplicate: true } }
  }

  const succeeded = SUCCESS.has(body.status.toLowerCase())
  const status = succeeded ? 'succeeded' : 'failed'
  const output = {
    kind: body.kind,
    status: body.status,
    branch: body.branch ?? null,
    prUrl: body.pr_url ?? null,
    verifyPassed: body.verify_passed ?? null,
    failingChecks: Array.isArray(body.failing_checks) ? body.failing_checks : [],
    reportExcerpt: body.report_excerpt ?? null,
    runUrl: body.run_url ?? null,
    failureTail: succeeded ? null : readFailureTail(body.failure_tail),
    clientTodo: typeof body.client_todo === 'string' && body.client_todo.trim() ? body.client_todo.trim().slice(0, 4000) : null,
    style: typeof body.design_direction === 'string' ? parseDesignDirection(body.design_direction.slice(0, 2000)) : null,
  }
  const reason = failureReason(output.failureTail)

  // Claim the run: only one callback may finish it. A run the platform gave up
  // waiting on ("workflow never started", "callback never arrived") plainly
  // did run, so its callback still finishes it.
  const claimed = await db.agentRun.updateMany({
    where: {
      id: run.id,
      OR: [
        { finishedAt: null },
        { status: 'failed', error: NEVER_STARTED_REASON },
        { status: 'failed', error: { startsWith: CALLBACK_NEVER_ARRIVED_REASON } },
      ],
    },
    data: {
      status,
      finishedAt: new Date(),
      output: output as Prisma.InputJsonObject,
      // The run id, as the dispatch watcher records it; kept when already known.
      ...(body.run_url && !run.externalId ? { externalId: runIdFromUrl(body.run_url) ?? body.run_url } : {}),
      error: succeeded
        ? null
        : `workflow ${body.status}${output.failingChecks.length ? `; failing: ${output.failingChecks.join(', ')}` : ''}${reason ? `; agent: ${reason}` : ''}`,
    },
  })
  if (claimed.count === 0) {
    const now = await db.agentRun.findUniqueOrThrow({ where: { id: run.id }, select: { status: true } })
    return { status: 200, body: { ok: true, runId: run.id, runStatus: now.status, duplicate: true } }
  }

  // The website deliverable: the run's own, else the engagement's.
  const website =
    (run.deliverableId
      ? await db.deliverable.findUnique({ where: { id: run.deliverableId }, select: { id: true, type: true } })
      : null) ??
    (await db.deliverable.findFirst({ where: { engagementId, type: 'website' }, select: { id: true, type: true } }))

  if (website && body.branch) await mergeEvidence(website.id, { previewBranch: body.branch })

  // What the build could not find out goes on the client's card as one note.
  const questions = questionsFrom(output.clientTodo)
  if (questions.length && run.engagementId) {
    await db.opsActivity.create({ data: { engagementId: run.engagementId, kind: 'note', body: `Open questions from build:\n${questions.map((q) => `- ${q}`).join('\n')}` } })
  }

  // A tracking install (install_tracking) that came back green: the tag is in the site's PR.
  const runInput = (run.input ?? {}) as { tracking?: unknown }
  if (succeeded && website && runInput.tracking && typeof runInput.tracking === 'object') {
    await mergeEvidence(website.id, { trackingInstalled: true, trackingInstalledAt: new Date().toISOString(), tracking: runInput.tracking, trackingPrUrl: output.prUrl })
  }

  // The workflow could not open the PR (see openPrForRun): open it here.
  const input = (run.input ?? {}) as { repo?: unknown }
  if (succeeded && !output.prUrl && body.branch && typeof input.repo === 'string' && input.repo) {
    const pr = await openPrForRun(input.repo, body.branch, body.kind, output.reportExcerpt)
    const next = { ...output, prUrl: pr.url, prOpenedBy: pr.url ? 'platform' : null, prError: pr.error }
    await db.agentRun.update({ where: { id: run.id }, data: { output: next as Prisma.InputJsonObject } })
    output.prUrl = pr.url
  }

  // The branch's Vercel preview, if the project has deployed it yet.
  let previewUrl: string | null = null
  if (website && body.branch) {
    const ev = await db.deliverable.findUnique({ where: { id: website.id }, select: { evidence: true } })
    const projectId = (ev?.evidence as Record<string, unknown> | null)?.vercelProjectId
    if (typeof projectId === 'string' && projectId) {
      previewUrl = await listDeploymentsForBranch(projectId, body.branch)
        .then((d) => d[0]?.url ?? null)
        .catch(() => null)
    }
    if (previewUrl) await mergeEvidence(website.id, { previewUrl })
  }

  // go_live: Jacob pushed it before it was dispatched, so its PR merges now.
  let merged: string | null = null
  let mergeError: string | null = null
  const prNumber = output.prUrl ? Number(/\/pull\/(\d+)/.exec(output.prUrl)?.[1]) : NaN
  if (succeeded && body.kind === 'go_live' && Number.isFinite(prNumber) && typeof input.repo === 'string') {
    try {
      const m = await mergePullRequest(input.repo, prNumber, `go_live: make the site indexable (#${prNumber})`)
      if (body.branch) await deleteBranch(input.repo, body.branch).catch(() => false)
      merged = m.sha
    } catch (err) {
      mergeError = err instanceof Error ? err.message : String(err)
    }
  }
  if (previewUrl || merged || mergeError) {
    const now = await db.agentRun.findUniqueOrThrow({ where: { id: run.id }, select: { output: true } })
    await db.agentRun.update({
      where: { id: run.id },
      data: { output: { ...((now.output ?? {}) as Record<string, unknown>), previewUrl, mergedSha: merged, mergeError } as Prisma.InputJsonObject },
    })
  }

  let stepSet: string | null = null
  if (succeeded && website && (body.kind === 'site_build' || body.kind === 'site_update')) {
    await db.deliverable.update({
      where: { id: website.id },
      data: { step: 'review', waitingOn: defaultWaitingOn('website', 'review'), stepUpdatedAt: new Date() },
    })
    stepSet = 'review'
  }

  const verify = output.verifyPassed === null ? '' : output.verifyPassed ? ', gate passed' : `, gate FAILED (${output.failingChecks.join(', ') || 'see report'})`
  const mergeLine = merged ? ' PR merged; the site goes indexable on the next production deploy.' : mergeError ? ` PR not merged: ${mergeError}.` : ''
  const line = `Agent ${body.kind} ${status}${verify}. ${output.prUrl ? `PR ${output.prUrl}` : 'No PR opened.'}${previewUrl ? ` Preview ${previewUrl}.` : ''}${mergeLine}${stepSet ? ' Website step → review.' : ''}`
  await db.opsActivity.create({ data: { engagementId, kind: 'system', body: line } })
  await emit(run.id, succeeded && !mergeError ? 'status' : 'error', line, { ...output, previewUrl, mergedSha: merged, mergeError })

  return { status: 200, body: { ok: true, runId: run.id, runStatus: status, stepSet }, jobId: run.jobId }
}
