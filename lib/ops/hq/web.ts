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
//   go_live         refused with the go-live gate's unmet list (lib/ops/
//                   launch-gate.ts) unless Jacob's own message says "skip
//                   <item>"; then a web_push approval; Push dispatches go_live,
//                   whose callback merges its PR. The step goes live when the
//                   web checks see the site indexable.
//   connect_domain  a domain the client owns. The registrar is read from RDAP
//                   and the card carries ONE instruction ("At Namecheap, set
//                   the nameservers to ns1/ns2.vercel-dns.com"), records as the
//                   alternative. Push adds the domain (and www, redirecting to
//                   it) to the Vercel project and records dnsRequired,
//                   nameservers and registrar on the domain deliverable, step
//                   dns_by_client (or dns_records when Jacob holds the DNS).
//   buy_domain      web_push approval with Vercel's price; Push buys it on the
//                   Vercel registrar (registrant from OPS_DOMAIN_CONTACT), adds
//                   it and www to the project, domain step propagating.
//   set_email_records  web_push approval; Push writes Google Workspace MX, SPF
//                   and DMARC through Vercel DNS (the domain must be on it).
//   install_tracking   web_push approval; Push dispatches a site_update that
//                   writes the tracking block (from the ads deliverable's
//                   googleAdsId and conversion labels) into site.config.ts and
//                   nothing else. Its callback sets trackingInstalled.

import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { dispatchRun } from '@/lib/ops/agents/dispatch'
import { provisionSite } from '@/lib/ops/agents/provision'
import { mergeEvidence } from '@/lib/ops/agents/shared'
import { GITHUB_OWNER, TEMPLATE_REPO, deleteBranch, getFileContent, getPullRequest, mergePullRequest, repoFullName, vercelBotNote } from '@/lib/ops/github'
import { defaultWaitingOn } from '@/lib/ops/steps'
import { addDnsRecord, addProjectDomain, buyDomain, domainOrder, domainQuote, domainRecords, listDeploymentsForBranch, registrantContact } from '@/lib/ops/vercel'
import { GOOGLE_WORKSPACE_RECORDS, VERCEL_NAMESERVERS, dnsInstruction, normalizeDomain, onVercelDns, readRdap } from '@/lib/ops/domains'
import { loadGateClient } from '@/lib/ops/gate-data'
import { goLiveGate, skipsIn } from '@/lib/ops/launch-gate'
import { trackingBlockFrom, trackingInstructions, type TrackingBlock } from '@/lib/ops/tracking'
import { errMessage, fetchWithTimeout } from '@/lib/ops/checks/limit'
import { emit } from './events'
import { payloadAssets, payloadOldSite, readIntake } from '@/lib/ops/intake'
import { createRun, failRun, finishRun } from './runs'

export const WEB_TASK_KINDS = ['provision', 'site_build', 'site_update', 'review', 'merge', 'go_live', 'connect_domain', 'buy_domain', 'set_email_records', 'install_tracking'] as const
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

/** The registrar and nameservers RDAP reports, or nulls when the lookup fails (it never blocks a task). */
async function rdapLookup(domain: string): Promise<{ registrar: string | null; registrarRaw: string | null; nameservers: string[]; error: string | null }> {
  try {
    const res = await fetchWithTimeout(`https://rdap.org/domain/${encodeURIComponent(domain)}`, { headers: { Accept: 'application/rdap+json, application/json', 'User-Agent': 'aa-ops-web-checks' }, redirect: 'follow' }, 10_000)
    if (!res.ok) return { registrar: null, registrarRaw: null, nameservers: [], error: `RDAP HTTP ${res.status}` }
    return { ...readRdap(await res.json()), error: null }
  } catch (err) {
    return { registrar: null, registrarRaw: null, nameservers: [], error: errMessage(err) }
  }
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
  /** Jacob's own message: go_live reads "skip <item>" and "on vercel.app" from it, never from the chief's text. */
  said?: string
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
      // The branch the workflow pushed (recorded from git on the callback), never a name from the agent's report.
      const deployments = w.projectId && pr.branch ? await listDeploymentsForBranch(w.projectId, pr.branch).catch(() => null) : null
      const ready = deployments?.find((d) => d.state === 'READY') ?? null
      const latest = deployments?.[0] ?? null
      const preview = ready?.url ?? pr.previewUrl ?? null
      let missing: string | null = null
      if (!preview) {
        const why = await vercelBotNote(pr.repo, pr.prNumber).catch(() => null)
        missing =
          latest && latest.state !== 'READY'
            ? `Vercel's preview for ${pr.branch} is ${latest.state}${why ? `: ${why}` : ''}`
            : `Vercel has no preview for this branch (${pr.branch ?? 'unknown branch'})${why ? `: ${why}` : ''}`
      }
      if (preview && w.site) {
        const ev = await db.deliverable.findUnique({ where: { id: w.site.id }, select: { evidence: true } })
        await db.deliverable.update({ where: { id: w.site.id }, data: { evidence: { ...((ev?.evidence ?? {}) as Record<string, unknown>), previewUrl: preview } as Prisma.InputJsonObject } })
      }
      const note = preview ? `Preview ${preview}; PR ${pr.prUrl}` : `${missing}. PR ${pr.prUrl}`
      await setStep(w.site.id, 'website', 'send_preview', note)
      await db.opsActivity.create({ data: { engagementId: w.id, kind: 'note', body: `Website review: ${note}` } })
      const gate = pr.verifyPassed === null ? 'gate not reported' : pr.verifyPassed ? 'gate passed' : `gate FAILED: ${pr.failingChecks.join(', ') || 'see the PR'}`
      return {
        done: preview
          ? `Website step is send_preview (${gate}). Preview: ${preview} (branch ${pr.branch}).`
          : `Website step is send_preview (${gate}), but there is no preview to send: ${missing}.`,
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
        // The givens first: a site does not go live with the tag, the domain or lead alerts undone.
        const said = opts.said ?? ''
        const unmet = goLiveGate(await loadGateClient(w.id), said)
        if (unmet.length) {
          throw new Error(`Not taking ${w.name} live: ${unmet.map((i) => i.text).join('; ')}. Jacob can say "skip <item>" (for example "go live, skip tag") to go anyway.`)
        }
        detail = { action: 'go_live', repo, productionUrl: w.productionUrl, skipped: Array.from(skipsIn(said)) }
        title = `Take ${w.name}'s site live (indexable)`
        expected = 'Dispatches go_live, which flips the site to indexable; its PR merges on the callback and production redeploys. The website step goes live when the web checks see it indexable.'
      }
      return createWebApproval(opts, w, title, detail, expected)
    }

    case 'connect_domain': {
      const domain = normalizeDomain(opts.domain ?? '')
      if (!w.projectId) throw new Error(`${w.name} has no Vercel project`)
      if (!w.domain) throw new Error(`${w.name} has no domain deliverable`)
      const dnsHeldBy = opts.dnsHeldBy === 'jacob' ? 'jacob' : 'client'
      const [who, recs] = await Promise.all([rdapLookup(domain), domainRecords(domain).catch(() => null)])
      const records = (recs?.records ?? [
        { type: 'A' as const, name: '@', value: '76.76.21.21', why: '' },
        { type: 'CNAME' as const, name: 'www', value: 'cname.vercel-dns.com', why: '' },
      ]).map((r) => ({ type: r.type, name: r.name, value: r.value }))
      const instruction = dnsInstruction({ domain, registrar: who.registrar, records, nameservers: who.nameservers })
      const r = await createWebApproval(
        opts,
        w,
        `Connect ${domain} to ${w.name}'s site`,
        { action: 'connect_domain', domain, projectId: w.projectId, domainDeliverableId: w.domain.id, dnsHeldBy, registrar: who.registrar ?? who.registrarRaw, records, instruction },
        `Adds ${domain} and www.${domain} (redirecting to ${domain}) to the Vercel project. Then ${dnsHeldBy === 'jacob' ? 'you' : 'the client'}: ${instruction}`
      )
      return { ...r, done: `${r.done} ${instruction}` }
    }

    case 'buy_domain': {
      const domain = normalizeDomain(opts.domain ?? '')
      if (!w.projectId) throw new Error(`${w.name} has no Vercel project`)
      if (!w.domain) throw new Error(`${w.name} has no domain deliverable`)
      if (!registrantContact()) throw new Error('OPS_DOMAIN_CONTACT is not set (the registrant name, email, phone and address, as JSON); a domain cannot be bought without it')
      const q = await domainQuote(domain)
      if (!q.available) throw new Error(`${domain} is not available to buy`)
      if (q.price === null) throw new Error(`Vercel gave no price for ${domain}`)
      const renews = q.renewal !== null ? `, renews at $${q.renewal}/year` : ''
      const r = await createWebApproval(
        opts,
        w,
        `Buy ${domain} for ${w.name}`,
        { action: 'buy_domain', domain, price: q.price, renewal: q.renewal, projectId: w.projectId, domainDeliverableId: w.domain.id },
        `Buys ${domain} on Vercel for $${q.price} (1 year, auto-renew${renews}) on the team's payment method, adds it and www to ${w.name}'s project, and sets the domain step to propagating.`
      )
      return { ...r, done: `${r.done} ${domain} is available at $${q.price} for the first year${renews}.` }
    }

    case 'set_email_records': {
      if (!w.domain) throw new Error(`${w.name} has no domain deliverable`)
      const ev = (w.domain.evidence ?? {}) as Record<string, unknown>
      const fromEv = typeof ev.domain === 'string' ? ev.domain : typeof ev.primaryDomain === 'string' ? ev.primaryDomain : ''
      const domain = normalizeDomain(opts.domain || fromEv)
      const who = await rdapLookup(domain)
      if (!onVercelDns(who.nameservers) && ev.registrar !== 'Vercel') {
        throw new Error(
          `${domain} is not on Vercel DNS (nameservers ${who.nameservers.join(', ') || 'unknown'}), so the records go in at ${who.registrar ?? 'the registrar'}: ${GOOGLE_WORKSPACE_RECORDS.map((x) => `${x.type} ${x.name || '@'} ${x.value}`).join('; ')}`
        )
      }
      return createWebApproval(
        opts,
        w,
        `Set Google Workspace email records on ${domain}`,
        { action: 'set_email_records', domain },
        `Writes through Vercel DNS: ${GOOGLE_WORKSPACE_RECORDS.map((x) => `${x.type} ${x.name || '@'} ${x.value}`).join('; ')}. The web checks then read MX, SPF and DMARC.`
      )
    }

    case 'install_tracking': {
      if (!w.repoUrl) throw new Error(`${w.name} has no repo`)
      const ads = await db.deliverable.findUnique({ where: { engagementId_type: { engagementId: w.id, type: 'ads' } }, select: { evidence: true } })
      if (!ads) throw new Error(`${w.name} has no ads deliverable, so there is no Google tag to install`)
      const { block, missing } = trackingBlockFrom(ads.evidence as Record<string, unknown>)
      if (!block) {
        throw new Error(`No tag to install for ${w.name}: missing ${missing.join(', ')}. Have the ads specialist read the conversion labels first (start_ads_task: "read the conversion labels").`)
      }
      const parts = [block.googleAdsId, block.conversions.form ? `form ${block.conversions.form}` : null, block.conversions.call ? `call ${block.conversions.call}` : null].filter(Boolean)
      return createWebApproval(
        opts,
        w,
        `Install Google tag on ${w.name}`,
        { action: 'install_tracking', tracking: block, missing },
        `Dispatches a site_update that writes the tracking block (${parts.join(', ')}) into site.config.ts and nothing else. The PR then needs a merge; the web checks confirm the tag on production.${missing.length ? ` Not included: ${missing.join(', ')}.` : ''}`
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
    const domainId = String(d.domainDeliverableId)
    const apex = await addProjectDomain(projectId, domain)
    await addProjectDomain(projectId, `www.${domain}`, domain)
    const { records } = await domainRecords(domain)
    const dnsRequired = [...apex.verification, ...records].map((r) => ({ type: r.type, name: r.name, value: r.value }))
    const registrar = typeof d.registrar === 'string' ? d.registrar : null
    const instruction = dnsInstruction({ domain, registrar, records: dnsRequired })
    const held = d.dnsHeldBy === 'jacob' ? 'dns_records' : 'dns_by_client'
    await setStep(domainId, 'domain', held, instruction)
    await mergeEvidence(domainId, { domain, dnsRecords: dnsRequired, dnsRequired, nameservers: [...VERCEL_NAMESERVERS], ...(registrar ? { registrar } : {}) })
    const line = `Added ${domain} and www.${domain} to ${client}'s Vercel project. ${instruction}`
    await db.opsActivity.create({ data: { engagementId, kind: 'system', body: line } })
    return { line, applied: true }
  }

  if (action === 'buy_domain') {
    const domain = String(d.domain)
    const projectId = String(d.projectId)
    const domainId = String(d.domainDeliverableId)
    const contact = registrantContact()
    if (!contact) throw new Error('OPS_DOMAIN_CONTACT is not set; nothing was bought')
    const { orderId } = await buyDomain(domain, Number(d.price), contact)
    // Orders complete asynchronously; give it a few seconds before adding the domain.
    let status = 'purchasing'
    for (let i = 0; i < 6 && status !== 'completed' && status !== 'failed'; i++) {
      await new Promise((r) => setTimeout(r, 3000))
      status = await domainOrder(orderId).then((o) => o.status).catch(() => status)
    }
    if (status === 'failed') throw new Error(`Vercel's order ${orderId} for ${domain} failed`)
    const ev = await db.deliverable.findUniqueOrThrow({ where: { id: domainId }, select: { evidence: true } })
    const wantWww = String(((ev.evidence ?? {}) as Record<string, unknown>).primaryDomain ?? '').startsWith('www.')
    const primary = wantWww ? `www.${domain}` : domain
    const other = wantWww ? domain : `www.${domain}`
    const added: string[] = []
    try {
      await addProjectDomain(projectId, primary)
      await addProjectDomain(projectId, other, primary)
      added.push(primary, other)
    } catch (err) {
      await db.opsActivity.create({ data: { engagementId, kind: 'system', body: `Bought ${domain} (order ${orderId}) but could not add it to the project yet: ${errMessage(err)}. connect_domain adds it.` } })
    }
    await mergeEvidence(domainId, {
      domain,
      domains: [primary, other],
      primaryDomain: primary,
      registrar: 'Vercel',
      purchasedAt: new Date().toISOString(),
      orderId,
      price: Number(d.price),
      nameservers: [...VERCEL_NAMESERVERS],
    })
    await setStep(domainId, 'domain', 'propagating', `Bought on Vercel (order ${orderId}, ${status}); ${added.length ? `${primary} on the project, ${other} redirects to it` : 'not on the project yet'}`)
    const line = `Bought ${domain} for ${client} on Vercel ($${d.price}, order ${orderId}, ${status}). ${added.length ? `${primary} is on the project and ${other} redirects to it; ` : ''}domain step propagating.`
    await db.opsActivity.create({ data: { engagementId, kind: 'system', body: line } })
    return { line, applied: true }
  }

  if (action === 'set_email_records') {
    const domain = String(d.domain)
    const done: string[] = []
    const failed: string[] = []
    for (const rec of GOOGLE_WORKSPACE_RECORDS) {
      const label = `${rec.type} ${rec.name || '@'} ${rec.value}`
      try {
        await addDnsRecord(domain, rec)
        done.push(label)
      } catch (err) {
        failed.push(`${label}: ${errMessage(err)}`)
      }
    }
    if (!done.length) throw new Error(`No email record was written on ${domain}: ${failed.join('; ')}`)
    const email = await db.deliverable.findUnique({ where: { engagementId_type: { engagementId, type: 'email' } }, select: { id: true, step: true } })
    if (email && (email.step === 'dns_records' || email.step === 'workspace')) await setStep(email.id, 'email', 'user_added', `MX, SPF and DMARC set on ${domain} through Vercel DNS`)
    const line = `Email records on ${domain} for ${client}: ${done.join('; ')}${failed.length ? `. Not written: ${failed.join('; ')}` : ''}.`
    await db.opsActivity.create({ data: { engagementId, kind: 'system', body: line } })
    return { line, applied: true }
  }

  if (action === 'install_tracking') {
    const tracking = d.tracking as TrackingBlock
    const r = await dispatchRun(engagementId, { kind: 'site_update', instructions: trackingInstructions(tracking), dry: false, jobId: approval.jobId, tracking })
    if (r.blocked.length) throw new Error(`blocked: ${r.blocked.join('; ')}`)
    if (!r.ok) throw new Error(r.error ?? 'install_tracking dispatch failed')
    await db.opsJob.updateMany({ where: { id: approval.jobId }, data: { status: 'running' } })
    const line = `Google tag install dispatched for ${client} (${tracking.googleAdsId}); trackingInstalled is set when the run calls back.`
    await db.opsActivity.create({ data: { engagementId, kind: 'system', body: line } })
    return { line, applied: true }
  }

  throw new Error(`unknown web_push action "${action}"`)
}
