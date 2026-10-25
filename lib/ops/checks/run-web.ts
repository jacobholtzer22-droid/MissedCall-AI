// ===========================================
// /admin/ops web checks — runner
// ===========================================
// runWebChecks({ dryRun }): discover (Vercel + GitHub), match to engagements,
// write evidence and checks onto the website and domain deliverables,
// recompute their computedStatus the way the sync does, and advance steps
// forward only. Read only against Vercel, GitHub, DNS and the live sites;
// writes only Deliverable, OpsCheck and OpsActivity. dryRun writes nothing and
// returns the same summary.

import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { deriveDeliverableStatus } from '@/lib/ops/sync'
import { effectiveStatusOf } from '@/lib/ops/steps'
import type { OpsCheckKey } from '@/lib/ops/types'
import { discover, matchDiscovery, type GithubRepo, type MatchableEngagement, type VercelProject } from './discover'
import { EXTERNAL_CONCURRENCY, mapLimited } from './limit'
import { listDeploymentsForBranch, type BranchDeployment } from '@/lib/ops/vercel'
import { domainChecks, websiteChecks, type CheckResult } from './web'

/** Evidence keys the web checks own and overwrite; every other key is left alone. */
export const WEBSITE_EVIDENCE_KEYS = [
  'repoUrl',
  'repoDefaultBranch',
  'repoHasWorkflow',
  'siteConfigSlug',
  'siteIndexableFlag',
  'vercelProjectId',
  'vercelProjectName',
  'vercelGitLinked',
  'productionUrl',
  'productionState',
  'previewUrl',
  'previewState',
] as const
export const DOMAIN_EVIDENCE_KEYS = ['domains', 'primaryDomain'] as const

export type ReconRow = {
  client: string
  repo: string | null
  workflow: boolean | null
  project: string | null
  gitLinked: boolean | null
  prodState: string | null
  slug: 'match' | 'MISMATCH' | 'none'
  slugDetail: string
  indexable: boolean | null
  primaryDomain: string | null
  dnsOk: boolean | null
  verified: boolean | null
  https200: boolean | null
  spf: boolean | null
}

export type WebChecksSummary = {
  dryRun: boolean
  startedAt: string
  durationMs: number
  projectsSeen: number
  reposSeen: number
  matched: { repos: number; projects: number; via: Record<string, number> }
  unmatchedRepos: string[]
  unmatchedProjects: string[]
  clientsWithoutProject: string[]
  ambiguities: string[]
  evidenceUpdated: number
  checksWritten: number
  failingByKey: Record<string, string[]>
  couldNotRunByKey: Record<string, string[]>
  statusChanges: { client: string; type: string; from: string; to: string }[]
  autoAdvances: { client: string; type: string; from: string; to: string; why: string }[]
  apiErrors: string[]
  reconciliation: ReconRow[]
}

type Del = { id: string; type: string; step: string | null; manualStatus: string | null; computedStatus: string; evidence: Record<string, unknown> }

const asObject = (v: Prisma.JsonValue): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? { ...(v as Record<string, unknown>) } : {}
const isVercelApp = (host: string) => host.endsWith('.vercel.app')
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/** www host when the project has one, else the apex; custom domains only. */
function primaryDomainOf(p: VercelProject | null): string | null {
  const custom = (p?.domains ?? []).filter((d) => !isVercelApp(d.name))
  if (custom.length === 0) return null
  return (custom.find((d) => d.name.startsWith('www.')) ?? custom.find((d) => !d.redirect) ?? custom[0]).name
}

/** The URL the live checks fetch: the primary custom domain, else the project's vercel.app alias. */
function productionUrlOf(p: VercelProject | null, primary: string | null): string | null {
  if (primary) return `https://${primary}`
  const alias = p?.domains.find((d) => isVercelApp(d.name) && !d.redirect)
  if (alias) return `https://${alias.name}`
  return p?.production?.url ?? null
}

export async function runWebChecks({ dryRun }: { dryRun: boolean }): Promise<WebChecksSummary> {
  const started = Date.now()
  const now = new Date(started)

  const rows = await db.engagement.findMany({
    where: { stage: { not: 'ignored' } },
    select: {
      id: true,
      displayName: true,
      services: true,
      business: { select: { slug: true } },
      deliverables: {
        where: { type: { in: ['website', 'domain'] } },
        select: { id: true, type: true, step: true, manualStatus: true, computedStatus: true, evidence: true },
      },
    },
  })
  const engs = rows.map((e) => {
    const dels: Del[] = e.deliverables.map((d) => ({ ...d, evidence: asObject(d.evidence) }))
    return {
      id: e.id,
      name: e.displayName.trim(),
      hasWebsiteService: Array.isArray(e.services) && (e.services as string[]).includes('website'),
      slug: e.business?.slug ?? null,
      website: dels.find((d) => d.type === 'website') ?? null,
      domain: dels.find((d) => d.type === 'domain') ?? null,
    }
  })

  const discovery = await discover()
  const matchable: MatchableEngagement[] = engs.map((e) => ({
    id: e.id,
    displayName: e.name,
    businessSlug: e.slug,
    website: e.website ? { id: e.website.id, evidence: e.website.evidence } : null,
    domain: e.domain ? { id: e.domain.id, evidence: e.domain.evidence } : null,
  }))
  const m = matchDiscovery(matchable, discovery)

  const summary: WebChecksSummary = {
    dryRun,
    startedAt: now.toISOString(),
    durationMs: 0,
    projectsSeen: discovery.projects.length,
    reposSeen: discovery.repos.length,
    matched: { repos: m.repoFor.size, projects: m.projectFor.size, via: {} },
    unmatchedRepos: m.unmatchedRepos,
    unmatchedProjects: m.unmatchedProjects,
    clientsWithoutProject: engs.filter((e) => e.hasWebsiteService && !m.projectFor.has(e.id)).map((e) => e.name).sort(),
    ambiguities: m.ambiguities,
    evidenceUpdated: 0,
    checksWritten: 0,
    failingByKey: {},
    couldNotRunByKey: {},
    statusChanges: [],
    autoAdvances: [],
    apiErrors: discovery.errors,
    reconciliation: [],
  }
  for (const h of [...Array.from(m.repoFor.values()), ...Array.from(m.projectFor.values())]) {
    summary.matched.via[h.via] = (summary.matched.via[h.via] ?? 0) + 1
  }

  // ── Per client: evidence + checks (external calls 5 at a time) ──────────
  type Plan = {
    eng: (typeof engs)[number]
    repo: GithubRepo | null
    project: VercelProject | null
    primary: string | null
    websiteResults: CheckResult[]
    domainResults: CheckResult[]
    /** Latest deployment of evidence.previewBranch (set by the agent callback), when there is one. */
    branchPreview: BranchDeployment | null
  }
  const targets = engs.filter((e) => e.website || e.domain)
  const plans: Plan[] = await mapLimited(targets, EXTERNAL_CONCURRENCY, async (eng) => {
    const repo = m.repoFor.get(eng.id)?.repo ?? null
    const project = m.projectFor.get(eng.id)?.project ?? null
    const primary = primaryDomainOf(project)
    const websiteResults = eng.website
      ? (await websiteChecks({ step: eng.website.step, businessSlug: eng.slug, repo, project, productionUrl: productionUrlOf(project, primary) })).results
      : []
    const domainResults = eng.domain && primary ? await domainChecks(primary, project) : []
    const previewBranch = typeof eng.website?.evidence.previewBranch === 'string' ? eng.website.evidence.previewBranch : null
    let branchPreview: BranchDeployment | null = null
    if (project && previewBranch) {
      try {
        branchPreview = (await listDeploymentsForBranch(project.id, previewBranch))[0] ?? null
      } catch (err) {
        discovery.errors.push(`preview for ${eng.name} branch ${previewBranch}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    return { eng, repo, project, primary, websiteResults, domainResults, branchPreview }
  })

  // ── Writes ────────────────────────────────────────────────────────────────
  const writes: (() => Promise<unknown>)[] = []
  const touched = new Map<string, { del: Del; client: string; results: CheckResult[] }>()

  for (const p of plans) {
    const { eng, repo, project, primary } = p
    if (eng.website) {
      const ev: Record<string, unknown> = {
        repoUrl: repo?.url ?? null,
        repoDefaultBranch: repo?.defaultBranch ?? null,
        repoHasWorkflow: repo ? repo.hasWorkflow : null,
        siteConfigSlug: repo?.siteSlug ?? null,
        siteIndexableFlag: repo?.indexable ?? null,
        vercelProjectId: project?.id ?? null,
        vercelProjectName: project?.name ?? null,
        vercelGitLinked: project ? Boolean(project.gitRepo) : null,
        productionUrl: productionUrlOf(project, primary),
        productionState: project?.production?.state ?? null,
        // The agent's branch when the callback recorded one (previewBranch is
        // owned by the callback, never written here), else the latest preview.
        previewUrl: p.branchPreview?.url ?? (typeof eng.website.evidence.previewBranch === 'string' ? null : project?.preview?.url ?? null),
        previewState: p.branchPreview?.state ?? (typeof eng.website.evidence.previewBranch === 'string' ? null : project?.preview?.state ?? null),
      }
      queueEvidence(eng.website, ev)
      touched.set(eng.website.id, { del: eng.website, client: eng.name, results: p.websiteResults })
    }
    if (eng.domain && project) {
      const ev: Record<string, unknown> = {
        domains: project.domains.filter((d) => !isVercelApp(d.name)).map((d) => ({ name: d.name, verified: d.verified })),
        primaryDomain: primary,
      }
      queueEvidence(eng.domain, ev)
    }
    if (eng.domain && p.domainResults.length > 0) touched.set(eng.domain.id, { del: eng.domain, client: eng.name, results: p.domainResults })
  }

  /**
   * Merge only the web-check keys; queue a write when anything changed. A key
   * discovery found nothing for is left as it is (never deleted): repoUrl and
   * productionUrl can also be entered by hand.
   */
  function queueEvidence(del: Del, ev: Record<string, unknown>) {
    const merged = { ...del.evidence }
    let changed = false
    for (const [k, v] of Object.entries(ev)) {
      if (v === null || v === undefined) continue
      if (!same(merged[k], v)) {
        merged[k] = v
        changed = true
      }
    }
    if (!changed) return
    summary.evidenceUpdated++
    del.evidence = merged
    if (!dryRun) writes.push(() => db.deliverable.update({ where: { id: del.id }, data: { evidence: merged as Prisma.InputJsonObject } }))
  }

  for (const { del, client, results } of Array.from(touched.values())) {
    for (const res of results) {
      summary.checksWritten++
      if (res.passed === false) (summary.failingByKey[res.key] ??= []).push(client)
      if (res.passed === null) (summary.couldNotRunByKey[res.key] ??= []).push(client)
      if (!dryRun) {
        writes.push(() =>
          db.opsCheck.upsert({
            where: { deliverableId_key: { deliverableId: del.id, key: res.key } },
            create: { deliverableId: del.id, key: res.key, passed: res.passed, detail: res.detail, lastRunAt: now },
            update: { passed: res.passed, detail: res.detail, lastRunAt: now },
          })
        )
      }
    }
  }
  await mapLimited(writes, EXTERNAL_CONCURRENCY, (w) => w())

  // ── Status derivation, the sync's rule over every check on the row ───────
  const touchedIds = Array.from(touched.keys())
  const existingChecks = touchedIds.length
    ? await db.opsCheck.findMany({ where: { deliverableId: { in: touchedIds } }, select: { deliverableId: true, key: true, passed: true } })
    : []
  const statusWrites: (() => Promise<unknown>)[] = []
  for (const { del, client, results } of Array.from(touched.values())) {
    const merged = new Map<string, boolean | null>(existingChecks.filter((c) => c.deliverableId === del.id).map((c) => [c.key, c.passed]))
    for (const res of results) merged.set(res.key, res.passed)
    const next = deriveDeliverableStatus(Array.from(merged.entries()).map(([key, passed]) => ({ key, passed })))
    if (next !== del.computedStatus) {
      summary.statusChanges.push({ client, type: del.type, from: del.computedStatus, to: next })
      if (!dryRun) statusWrites.push(() => db.deliverable.update({ where: { id: del.id }, data: { computedStatus: next } }))
      del.computedStatus = next
    }
  }
  await mapLimited(statusWrites, EXTERNAL_CONCURRENCY, (w) => w())

  // ── Forward-only auto-advance ─────────────────────────────────────────────
  const passes = (results: CheckResult[], key: OpsCheckKey) => results.some((x) => x.key === key && x.passed === true)
  const advance = async (client: string, del: Del, to: string, why: string) => {
    summary.autoAdvances.push({ client, type: del.type, from: del.step ?? '(none)', to, why })
    if (!dryRun) {
      await db.$transaction([
        db.deliverable.update({ where: { id: del.id }, data: { step: to, waitingOn: null, stepUpdatedAt: now } }),
        db.opsActivity.create({
          data: {
            engagementId: (await db.deliverable.findUniqueOrThrow({ where: { id: del.id }, select: { engagementId: true } })).engagementId,
            kind: 'system',
            body: `${del.type}: step ${del.step} -> ${to} (${why})`,
          },
        }),
      ])
    }
    del.step = to
  }
  for (const p of plans) {
    const { eng } = p
    const d = eng.domain
    if (d && !d.manualStatus && (d.step === 'propagating' || d.step === 'dns_records')) {
      if (passes(p.domainResults, 'dns.apex_points_to_vercel') && passes(p.domainResults, 'vercel.domain_verified') && passes(p.domainResults, 'http.https_200')) {
        await advance(eng.name, d, 'live', 'apex points to Vercel, domain verified, HTTPS 200')
      }
    }
    const w = eng.website
    const domainLive =
      d !== null && effectiveStatusOf({ type: 'domain', manualStatus: d.manualStatus, computedStatus: d.computedStatus, step: d.step }) === 'live'
    if (w && !w.manualStatus && w.step === 'approved' && domainLive) {
      if (passes(p.websiteResults, 'vercel.prod_ready') && passes(p.websiteResults, 'slug.matches_db')) {
        await advance(eng.name, w, 'live', 'production READY, slug matches, domain live')
      }
    }
  }

  // ── Reconciliation ─────────────────────────────────────────────────────────
  const val = (results: CheckResult[], key: OpsCheckKey) => results.find((x) => x.key === key)?.passed ?? null
  summary.reconciliation = plans
    .filter((p) => p.eng.hasWebsiteService)
    .map((p): ReconRow => {
      const repoSlug = p.repo?.siteSlug ?? null
      const slug: ReconRow['slug'] = !repoSlug || !p.eng.slug ? 'none' : repoSlug === p.eng.slug ? 'match' : 'MISMATCH'
      const apex = val(p.domainResults, 'dns.apex_points_to_vercel')
      const wwwOk = val(p.domainResults, 'dns.www_cname')
      return {
        client: p.eng.name,
        repo: p.repo?.name ?? null,
        workflow: p.repo ? p.repo.hasWorkflow : null,
        project: p.project?.name ?? null,
        gitLinked: p.project ? Boolean(p.project.gitRepo) : null,
        prodState: p.project?.production?.state ?? null,
        slug,
        slugDetail: slug === 'none' ? `repo ${repoSlug ?? '—'} / DB ${p.eng.slug ?? '—'}` : slug === 'MISMATCH' ? `repo ${repoSlug} / DB ${p.eng.slug}` : repoSlug!,
        indexable: p.repo?.indexable ?? null,
        primaryDomain: p.primary,
        dnsOk: apex === null && wwwOk === null ? null : apex === true && wwwOk === true,
        verified: val(p.domainResults, 'vercel.domain_verified'),
        https200: val(p.domainResults, 'http.https_200'),
        spf: val(p.domainResults, 'dns.txt_spf'),
      }
    })
    .sort((a, b) => a.client.localeCompare(b.client))

  summary.durationMs = Date.now() - started
  return summary
}
