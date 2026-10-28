// ===========================================
// Ops HQ: the web specialist, driven by the chief
// ===========================================
// The site agent itself is aa-build.yml in each client repo (lib/ops/agents).
// This module is what the chief's start_web_task runs, and what decideApproval
// runs for a web_push. Push gates: provision, site_build and site_update run at
// once (nothing public, nothing spent); merge, go_live and connect_domain wait
// for Jacob's Push because they change what the public sees.
//
//   provision       repo from AA-Template + secrets + Vercel project (a web
//                   run 'provision' with one event per step). Needs a platform
//                   account.
//   site_build      Engagement.brief to the workflow; provisions first when the
//                   site has no repo yet. Needs a brief.
//   site_update     instructions to the workflow.
//   review          the latest build's PR and preview, posted back; website
//                   step → send_preview.
//   merge           web_push approval; Push squash-merges the PR, deletes the
//                   branch, website step → approved.
//   go_live         web_push approval; Push dispatches go_live, whose callback
//                   merges its PR. The step goes live when the web checks see
//                   the site indexable.
//   connect_domain  web_push approval; Push adds the domain (and www,
//                   redirecting to it) to the Vercel project and writes the DNS
//                   records into the domain deliverable's waiting note, step
//                   dns_by_client (or dns_records when Jacob holds the DNS).

import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { dispatchRun } from '@/lib/ops/agents/dispatch'
import { provisionSite } from '@/lib/ops/agents/provision'
import { GITHUB_OWNER, TEMPLATE_REPO, deleteBranch, getFileContent, getPullRequest, mergePullRequest, repoFullName } from '@/lib/ops/github'
import { defaultWaitingOn } from '@/lib/ops/steps'
import { addProjectDomain, domainRecords, listDeploymentsForBranch } from '@/lib/ops/vercel'
import { emit } from './events'
import { payloadAssets, payloadOldSite, readIntake } from '@/lib/ops/intake'
import { createRun, failRun, finishRun } from './runs'

export const WEB_TASK_KINDS = ['provision', 'site_build', 'site_update', 'review', 'merge', 'go_live', 'connect_domain'] as const
export type WebTaskKind = (typeof WEB_TASK_KINDS)[number]

// ── The brief template ──────────────────────────────────────────────────────

let templateCache: { text: string; at: number } | null = null

/** AA-Template's BRIEF.template.md, read from GitHub (cached 10 minutes) so it never drifts from the repo. */
export async function briefTemplate(): Promise<string> {
  if (templateCache && Date.now() - templateCache.at < 10 * 60_000) return templateCache.text
  const text = await getFileContent(`${GITHUB_OWNER}/${TEMPLATE_REPO}`, 'BRIEF.template.md')
  if (!text) throw new Error(`BRIEF.template.md not found in ${GITHUB_OWNER}/${TEMPLATE_REPO}`)
  templateCache = { text, at: Date.now() }
  return text
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function website(engagementId: string) {
  const e = await db.engagement.findUnique({
    where: { id: engagementId },
    select: {
      id: true,
      displayName: true,
      brief: true,
      businessId: true,
      deliverables: { where: { type: { in: ['website', 'domain'] } }, select: { id: true, type: true, step: true, evidence: true } },
    },
  })
  if (!e) throw new Error(`no client with id ${engagementId}`)
  const site = e.deliverables.find((d) => d.type === 'website') ?? null
  const domain = e.deliverables.find((d) => d.type === 'domain') ?? null
  const ev = (site?.evidence ?? {}) as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' && v ? v : null)
  return {
    id: e.id,
    name: e.displayName.trim(),
    brief: e.brief,
    businessId: e.businessId,
    site,
    domain,
    repoUrl: str(ev.repoUrl),
    projectId: str(ev.vercelProjectId),
    productionUrl: str(ev.productionUrl),
    previewUrl: str(ev.previewUrl),
  }
}

/** The newest finished site_build / site_update / go_live run with a PR, and its links. */
async function latestPr(engagementId: string, kinds: string[] = ['site_build', 'site_update']) {
  const runs = await db.agentRun.findMany({
    where: { engagementId, kind: { in: kinds }, status: 'succeeded' },
    orderBy: { finishedAt: 'desc' },
    take: 5,
    select: { id: true, kind: true, output: true, input: true, finishedAt: true },
  })
  for (const r of runs) {
    const out = (r.output ?? {}) as Record<string, unknown>
    const prUrl = typeof out.prUrl === 'string' ? out.prUrl : null
    const number = prUrl ? Number(/\/pull\/(\d+)/.exec(prUrl)?.[1]) : NaN
    if (!prUrl || !Number.isFinite(number)) continue
    const input = (r.input ?? {}) as Record<string, unknown>
    return {
      runId: r.id,
      kind: r.kind,
      prUrl,
      prNumber: number,
      repo: typeof input.repo === 'string' ? input.repo : repoFullName(prUrl.replace(/\/pull\/\d+.*$/, '')),
      branch: typeof out.branch === 'string' ? out.branch : null,
      previewUrl: typeof out.previewUrl === 'string' ? out.previewUrl : null,
      verifyPassed: out.verifyPassed ?? null,
      failingChecks: Array.isArray(out.failingChecks) ? (out.failingChecks as string[]) : [],
    }
  }
  return null
}

async function setStep(deliverableId: string, type: string, step: string, note: string | null) {
  await db.deliverable.update({
    where: { id: deliverableId },
    data: { step, stepUpdatedAt: new Date(), waitingOn: defaultWaitingOn(type, step), waitingNote: note },
  })
}

/** Provision as a web run of its own, one event per step. Returns the repo URL or throws with what failed. */
async function provisionRun(engagementId: string, jobId: string | null): Promise<string> {
  const run = await createRun({ agent: 'web', kind: 'provision', mode: 'work', engagementId, jobId, input: { kind: 'provision' } })
  try {
    const r = await provisionSite(engagementId, { dry: false })
    if (r.blocked.length) throw new Error(`blocked: ${r.blocked.join('; ')}`)
    for (const s of r.steps) await emit(run.id, s.error ? 'error' : 'tool_result', `${s.action}: ${s.error ?? s.result ?? s.detail}`, s)
    if (!r.ok) throw new Error(r.steps.find((s) => s.error)?.error ?? 'a step failed')
    const repoUrl = r.steps[0]?.result ?? ''
    await finishRun(run.id, { kind: 'provision', repoName: r.repoName, steps: r.steps, repoUrl })
    return repoUrl
  } catch (err) {
    await failRun(run.id, err)
    throw err
  }
}

// ── start_web_task ──────────────────────────────────────────────────────────

export type WebTaskResult = { done: string; started?: string[]; waitingForPush?: { approvalId: string; title: string }; links?: { label: string; url: string }[] }

export async function startWebTask(opts: {
  engagementId: string
  kind: WebTaskKind
  instructions?: string
  domain?: string
  dnsHeldBy?: 'client' | 'jacob'
  /** site_build: Jacob said to build with stock photos. */
  withStock?: boolean
  /** The chief run and its job, which own approvals and runs. */
  runId: string
  jobId: () => Promise<string>
}): Promise<WebTaskResult> {
  const w = await website(opts.engagementId)
  if (!w.site) throw new Error(`${w.name} has no website deliverable`)

  switch (opts.kind) {
    case 'provision': {
      if (w.repoUrl) return { done: `${w.name} already has a repo: ${w.repoUrl}`, links: [{ label: 'Repo', url: w.repoUrl }] }
      if (!w.businessId) throw new Error(`${w.name} has no platform account; create it first (create_client with createBusiness, or the panel)`)
      const repoUrl = await provisionRun(w.id, await opts.jobId())
      return { done: `Provisioned ${w.name}: repo, secrets and Vercel project. Website step is build.`, links: [{ label: 'Repo', url: repoUrl }] }
    }

    case 'site_build':
    case 'site_update': {
      const jobId = await opts.jobId()
      if (opts.kind === 'site_build' && !w.brief?.trim()) throw new Error(`${w.name} has no brief yet; write it with set_brief first`)
      // Real photos lead; stock-only builds are a second run Jacob asks for.
      const intake = readIntake((await db.engagement.findUnique({ where: { id: w.id }, select: { intake: true } }))?.intake)
      const photos = (intake.assets ?? []).filter((a) => a.kind === 'photo').length
      if (opts.kind === 'site_build' && !photos && intake.oldSite?.use !== 'verbatim' && !opts.withStock) {
        throw new Error(`No photos on file for ${w.name} and no old site to copy; add them at the intake page (/admin/ops/intake/${w.id}) or say build with stock`)
      }
      if (opts.kind === 'site_update' && !opts.instructions?.trim()) throw new Error('site_update needs instructions')
      const started: string[] = []
      if (!w.repoUrl) {
        if (opts.kind === 'site_update') throw new Error(`${w.name} has no repo yet; build the site first`)
        if (!w.businessId) throw new Error(`${w.name} has no platform account; create it first`)
        await provisionRun(w.id, jobId)
        started.push('provision (done)')
      }
      // Assets come only from this client's own intake, never from free text.
      const d = await dispatchRun(w.id, {
        kind: opts.kind,
        brief: w.brief ?? undefined,
        instructions: opts.instructions,
        dry: false,
        jobId,
        assets: payloadAssets(intake),
        oldSite: payloadOldSite(intake),
        withStock: Boolean(opts.withStock),
      })
      if (d.blocked.length) throw new Error(`blocked: ${d.blocked.join('; ')}`)
      if (!d.ok) throw new Error(d.error ?? 'dispatch failed')
      started.push(`${opts.kind} dispatched to ${d.repo} with ${photos} photo${photos === 1 ? '' : 's'}${d.assetsInBriefOnly ? ' (asset list in the brief only: payload too large)' : ''}`)
      return { done: `${opts.kind} is running for ${w.name}. The report comes when the workflow calls back.`, started }
    }

    case 'review': {
      const pr = await latestPr(w.id)
      if (!pr) throw new Error(`${w.name} has no finished build with a PR yet`)
      // A callback handled by older code records no preview: ask Vercel for the branch's newest deployment.
      const preview =
        pr.previewUrl ??
        w.previewUrl ??
        (w.projectId && pr.branch ? await listDeploymentsForBranch(w.projectId, pr.branch).then((d) => d[0]?.url ?? null).catch(() => null) : null)
      await setStep(w.site.id, 'website', 'send_preview', `Preview ${preview ?? '(not deployed yet)'}; PR ${pr.prUrl}`)
      await db.opsActivity.create({ data: { engagementId: w.id, kind: 'note', body: `Website ready to send: preview ${preview ?? 'not deployed yet'}, PR ${pr.prUrl}` } })
      const gate = pr.verifyPassed === null ? 'gate not reported' : pr.verifyPassed ? 'gate passed' : `gate FAILED: ${pr.failingChecks.join(', ') || 'see the PR'}`
      return {
        done: `Website step is send_preview (${gate}).`,
        links: [...(preview ? [{ label: 'Preview', url: preview }] : []), { label: `PR #${pr.prNumber}`, url: pr.prUrl }],
      }
    }

    case 'merge':
    case 'go_live': {
      if (!w.repoUrl) throw new Error(`${w.name} has no repo`)
      const repo = repoFullName(w.repoUrl)
      let detail: Record<string, unknown>
      let title: string
      let expected: string
      if (opts.kind === 'merge') {
        const pr = await latestPr(w.id)
        if (!pr) throw new Error(`${w.name} has no PR to merge`)
        const live = await getPullRequest(pr.repo, pr.prNumber)
        if (live?.merged) throw new Error(`PR #${pr.prNumber} is already merged`)
        if (live?.state !== 'open') throw new Error(`PR #${pr.prNumber} is ${live?.state ?? 'not found'}`)
        detail = { action: 'merge', repo, prNumber: pr.prNumber, prUrl: pr.prUrl, branch: pr.branch, previewUrl: pr.previewUrl ?? w.previewUrl }
        title = `Merge ${w.name}'s site PR #${pr.prNumber}`
        expected = `Squash-merges PR #${pr.prNumber} and deletes its branch; Vercel deploys it to production (still noindex until go-live). Website step → approved.`
      } else {
        detail = { action: 'go_live', repo, productionUrl: w.productionUrl }
        title = `Take ${w.name}'s site live (indexable)`
        expected = 'Dispatches go_live, which flips the site to indexable; its PR merges on the callback and production redeploys. The website step goes live when the web checks see it indexable.'
      }
      return createWebApproval(opts, w, title, detail, expected)
    }

    case 'connect_domain': {
      const domain = (opts.domain ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '')
      if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) throw new Error('domain must look like example.com')
      if (!w.projectId) throw new Error(`${w.name} has no Vercel project`)
      if (!w.domain) throw new Error(`${w.name} has no domain deliverable`)
      const dnsHeldBy = opts.dnsHeldBy === 'jacob' ? 'jacob' : 'client'
      return createWebApproval(
        opts,
        w,
        `Connect ${domain} to ${w.name}'s site`,
        { action: 'connect_domain', domain, projectId: w.projectId, domainDeliverableId: w.domain.id, dnsHeldBy },
        `Adds ${domain} and www.${domain} (redirecting to ${domain}) to the Vercel project. The site answers on the domain once DNS points at Vercel; the records go into the domain step (${dnsHeldBy === 'jacob' ? 'you add them' : 'the client adds them'}).`
      )
    }
  }
}

async function createWebApproval(
  opts: { runId: string; jobId: () => Promise<string> },
  w: Awaited<ReturnType<typeof website>>,
  title: string,
  detail: Record<string, unknown>,
  expected: string
): Promise<WebTaskResult> {
  const pending = await db.opsApproval.findFirst({
    where: { kind: 'web_push', status: 'pending', detail: { path: ['engagementId'], equals: w.id }, title },
    select: { id: true },
  })
  if (pending) return { done: 'Already waiting for Push.', waitingForPush: { approvalId: pending.id, title } }
  const jobId = await opts.jobId()
  const a = await db.opsApproval.create({
    data: {
      jobId,
      runId: opts.runId,
      agent: 'web',
      kind: 'web_push',
      title,
      detail: { ...detail, engagementId: w.id, client: w.name } as Prisma.InputJsonObject,
      expected,
    },
  })
  await db.opsJob.update({ where: { id: jobId }, data: { status: 'awaiting_approval' } })
  const links = [
    typeof detail.prUrl === 'string' ? { label: `PR #${detail.prNumber}`, url: detail.prUrl } : null,
    typeof detail.previewUrl === 'string' ? { label: 'Preview', url: detail.previewUrl } : null,
  ].filter((l): l is { label: string; url: string } => Boolean(l))
  return { done: 'Waiting for your Push.', waitingForPush: { approvalId: a.id, title }, links }
}

// ── Push ────────────────────────────────────────────────────────────────────

/** Carry out a pushed web_push. Returns a line for the log; throws when it could not. */
export async function applyWebPush(approval: { id: string; jobId: string; detail: Record<string, unknown> }): Promise<{ line: string; applied: boolean }> {
  const d = approval.detail
  const engagementId = String(d.engagementId ?? '')
  const client = String(d.client ?? 'the client')
  const action = String(d.action ?? '')

  if (action === 'merge') {
    const repo = String(d.repo)
    const n = Number(d.prNumber)
    const m = await mergePullRequest(repo, n, `site: merge PR #${n} (pushed from Ops HQ)`)
    if (typeof d.branch === 'string' && d.branch) await deleteBranch(repo, d.branch).catch(() => false)
    const site = await db.deliverable.findUnique({ where: { engagementId_type: { engagementId, type: 'website' } }, select: { id: true } })
    if (site) await setStep(site.id, 'website', 'approved', `PR #${n} merged ${new Date().toISOString().slice(0, 10)}; production redeploys (noindex until go-live)`)
    const line = `Merged ${client}'s PR #${n} (${m.sha.slice(0, 7)}); website step approved.`
    await db.opsActivity.create({ data: { engagementId, kind: 'system', body: line } })
    return { line, applied: true }
  }

  if (action === 'go_live') {
    const r = await dispatchRun(engagementId, { kind: 'go_live', dry: false, jobId: approval.jobId })
    if (r.blocked.length) throw new Error(`blocked: ${r.blocked.join('; ')}`)
    if (!r.ok) throw new Error(r.error ?? 'go_live dispatch failed')
    // The job reports again when go_live calls back.
    await db.opsJob.updateMany({ where: { id: approval.jobId }, data: { status: 'running' } })
    return { line: `go_live dispatched for ${client}; its PR merges on the callback.`, applied: true }
  }

  if (action === 'connect_domain') {
    const domain = String(d.domain)
    const projectId = String(d.projectId)
    const apex = await addProjectDomain(projectId, domain)
    await addProjectDomain(projectId, `www.${domain}`, domain)
    const { records } = await domainRecords(domain)
    const all = [...apex.verification, ...records]
    const note = `Point DNS at Vercel: ${all.map((r) => `${r.type} ${r.name} ${r.value}`).join('; ')}`
    const held = d.dnsHeldBy === 'jacob' ? 'dns_records' : 'dns_by_client'
    await setStep(String(d.domainDeliverableId), 'domain', held, note)
    const ev = await db.deliverable.findUniqueOrThrow({ where: { id: String(d.domainDeliverableId) }, select: { evidence: true } })
    await db.deliverable.update({
      where: { id: String(d.domainDeliverableId) },
      data: { evidence: { ...((ev.evidence ?? {}) as Record<string, unknown>), domain, dnsRecords: all } as Prisma.InputJsonObject },
    })
    const line = `Added ${domain} and www.${domain} to ${client}'s Vercel project. ${note}.`
    await db.opsActivity.create({ data: { engagementId, kind: 'system', body: line } })
    return { line, applied: true }
  }

  throw new Error(`unknown web_push action "${action}"`)
}
