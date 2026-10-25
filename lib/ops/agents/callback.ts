// ===========================================
// /admin/ops agents — the workflow's signed result
// ===========================================
// aa-build.yml POSTs JSON with header X-AA-Signature: the hex HMAC-SHA256 of
// the exact body bytes, keyed with OPS_CALLBACK_SECRET. The signature is
// checked over the raw body before anything is parsed, with a constant-time
// compare.
//
// Body (what the workflow sends): { run_id, kind, status, branch, pr_url,
// verify_passed, failing_checks, report_excerpt, run_url? }. status is the
// GitHub job status: success | failure | cancelled.
//
// Idempotent per run_id: once a run has finished, a repeat callback changes
// nothing and answers 200 { duplicate: true }.

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { defaultWaitingOn } from '@/lib/ops/steps'
import { getRepo, openPullRequest } from '@/lib/ops/github'
import { mergeEvidence } from './shared'

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
}

export type CallbackOutcome =
  | { status: 200; body: { ok: true; runId: string; runStatus: string; duplicate?: boolean; stepSet?: string | null } }
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
  if (run.finishedAt && (run.status === 'succeeded' || run.status === 'failed')) {
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
  }

  // Claim the run: only one callback may finish it.
  const claimed = await db.agentRun.updateMany({
    where: { id: run.id, finishedAt: null },
    data: {
      status,
      finishedAt: new Date(),
      output: output as Prisma.InputJsonObject,
      ...(body.run_url ? { externalId: body.run_url } : {}),
      error: succeeded ? null : `workflow ${body.status}${output.failingChecks.length ? `; failing: ${output.failingChecks.join(', ')}` : ''}`,
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
    (await db.deliverable.findFirst({ where: { engagementId: run.engagementId, type: 'website' }, select: { id: true, type: true } }))

  if (website && body.branch) await mergeEvidence(website.id, { previewBranch: body.branch })

  // The workflow could not open the PR (see openPrForRun): open it here.
  const input = (run.input ?? {}) as { repo?: unknown }
  if (succeeded && !output.prUrl && body.branch && typeof input.repo === 'string' && input.repo) {
    const pr = await openPrForRun(input.repo, body.branch, body.kind, output.reportExcerpt)
    const next = { ...output, prUrl: pr.url, prOpenedBy: pr.url ? 'platform' : null, prError: pr.error }
    await db.agentRun.update({ where: { id: run.id }, data: { output: next as Prisma.InputJsonObject } })
    output.prUrl = pr.url
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
  await db.opsActivity.create({
    data: {
      engagementId: run.engagementId,
      kind: 'system',
      body: `Agent ${body.kind} ${status}${verify}. ${output.prUrl ? `PR ${output.prUrl}` : 'No PR opened.'}${stepSet ? ' Website step → review.' : ''}`,
    },
  })

  return { status: 200, body: { ok: true, runId: run.id, runStatus: status, stepSet } }
}
