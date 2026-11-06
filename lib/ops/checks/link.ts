// ===========================================
// /admin/ops web checks — link a client to its repo and Vercel project
// ===========================================
// Two halves:
//
//   loadLinkSuggestions()  read only. Runs discovery (every Vercel project and
//                          GitHub repo), the strict matcher, then the name
//                          ranker in link-suggest.ts, and returns every client
//                          with a website service that is missing a repo or a
//                          project, with its best candidates and the full
//                          unmatched lists for a manual pick. Cached in module
//                          memory for 10 minutes (discovery is ~250 API calls);
//                          refresh skips the cache.
//
//   linkSite()             the confirmed link. Verifies the repo and project
//                          exist, writes repoUrl / vercelProjectId /
//                          vercelProjectName onto the website deliverable
//                          (creating the deliverable when the client has the
//                          website service but no row yet), logs it on the
//                          client, drops the cache, and reruns the web checks
//                          for that one client so the board updates at once.
//
// Nothing here guesses: a link is written only with an explicit repo or
// project id, and the matcher keeps refusing name similarity on its own.

import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { getRepo } from '@/lib/ops/github'
import { BadRequest } from '@/lib/ops/validate'
import { VERCEL, api, discover, matchDiscovery, type Discovery, type MatchableEngagement } from './discover'
import { suggestLinks, type LinkSuggestion } from './link-suggest'
import { runWebChecks, type WebChecksSummary } from './run-web'

export type UnmatchedRepo = { fullName: string; url: string; siteSlug: string | null; pushedAt: string | null; hasSiteConfig: boolean }
export type UnmatchedProject = { id: string; name: string; gitRepo: string | null; domains: string[] }

export type LinkSuggestions = {
  at: string
  cached: boolean
  suggestions: LinkSuggestion[]
  unmatchedRepos: UnmatchedRepo[]
  unmatchedProjects: UnmatchedProject[]
  apiErrors: string[]
}

const TTL_MS = 10 * 60 * 1000
let cache: { at: number; value: LinkSuggestions } | null = null

export function dropLinkCache() {
  cache = null
}

const asObject = (v: Prisma.JsonValue): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? { ...(v as Record<string, unknown>) } : {}

async function matchableEngagements(): Promise<{ engs: MatchableEngagement[]; websiteService: Set<string> }> {
  const rows = await db.engagement.findMany({
    where: { stage: { not: 'ignored' } },
    select: {
      id: true,
      displayName: true,
      services: true,
      business: { select: { slug: true } },
      deliverables: { where: { type: { in: ['website', 'domain'] } }, select: { id: true, type: true, evidence: true } },
    },
  })
  const websiteService = new Set<string>()
  const engs = rows.map((e) => {
    if (Array.isArray(e.services) && (e.services as string[]).includes('website')) websiteService.add(e.id)
    const site = e.deliverables.find((d) => d.type === 'website')
    const domain = e.deliverables.find((d) => d.type === 'domain')
    return {
      id: e.id,
      displayName: e.displayName.trim(),
      businessSlug: e.business?.slug ?? null,
      website: site ? { id: site.id, evidence: asObject(site.evidence) } : null,
      domain: domain ? { id: domain.id, evidence: asObject(domain.evidence) } : null,
    }
  })
  return { engs, websiteService }
}

export async function loadLinkSuggestions(opts: { refresh?: boolean } = {}): Promise<LinkSuggestions> {
  if (!opts.refresh && cache && Date.now() - cache.at < TTL_MS) return { ...cache.value, cached: true }

  const { engs, websiteService } = await matchableEngagements()
  const d: Discovery = await discover()
  const m = matchDiscovery(engs, d)
  const suggestions = suggestLinks(engs, d, m, { websiteOnly: websiteService })
  const usedRepos = new Set(Array.from(m.repoFor.values()).map((h) => h.repo.fullName))
  const usedProjects = new Set(Array.from(m.projectFor.values()).map((h) => h.project.id))

  const value: LinkSuggestions = {
    at: new Date().toISOString(),
    cached: false,
    suggestions,
    unmatchedRepos: d.repos
      .filter((r) => !usedRepos.has(r.fullName) && !r.archived)
      .map((r) => ({ fullName: r.fullName, url: r.url, siteSlug: r.siteSlug, pushedAt: r.pushedAt, hasSiteConfig: r.hasSiteConfig }))
      .sort((a, b) => (b.pushedAt ?? '').localeCompare(a.pushedAt ?? '')),
    unmatchedProjects: d.projects
      .filter((p) => !usedProjects.has(p.id))
      .map((p) => ({ id: p.id, name: p.name, gitRepo: p.gitRepo, domains: p.domains.filter((x) => !x.name.endsWith('.vercel.app')).map((x) => x.name) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    apiErrors: d.errors,
  }
  cache = { at: Date.now(), value }
  return value
}

export type LinkSiteInput = {
  engagementId: string
  /** owner/name or the GitHub URL. */
  repo?: string | null
  /** Vercel project id (prj_…) or exact project name. */
  project?: string | null
  /** Who confirmed it, for the client log. */
  by: 'jacob' | 'chief'
  words?: string | null
}

export type LinkSiteResult = {
  client: string
  deliverableId: string
  created: boolean
  repoUrl: string | null
  vercelProjectId: string | null
  vercelProjectName: string | null
  checks: Pick<WebChecksSummary, 'matched' | 'failingByKey' | 'couldNotRunByKey' | 'statusChanges' | 'autoAdvances' | 'apiErrors' | 'checksWritten'> | null
}

type VercelProjectRow = { id: string; name: string; link?: { type?: string; org?: string; repo?: string } | null }

async function findVercelProject(idOrName: string): Promise<VercelProjectRow | null> {
  const token = process.env.VERCEL_API_TOKEN?.trim()
  const team = process.env.VERCEL_TEAM_ID?.trim()
  if (!token || !team) throw new BadRequest('VERCEL_API_TOKEN or VERCEL_TEAM_ID is not set')
  const errors: string[] = []
  const { body } = await api<VercelProjectRow>(`${VERCEL}/v9/projects/${encodeURIComponent(idOrName.trim())}?teamId=${encodeURIComponent(team)}`, token, `vercel project ${idOrName}`, errors)
  if (errors.length) throw new Error(errors.join('; '))
  return body
}

export async function linkSite(input: LinkSiteInput): Promise<LinkSiteResult> {
  const repoAsk = input.repo?.trim() || null
  const projectAsk = input.project?.trim() || null
  if (!repoAsk && !projectAsk) throw new BadRequest('Give a repo, a Vercel project, or both')

  const e = await db.engagement.findUnique({
    where: { id: input.engagementId },
    select: {
      id: true,
      displayName: true,
      services: true,
      deliverables: { where: { type: 'website' }, select: { id: true, evidence: true } },
    },
  })
  if (!e) throw new BadRequest(`No client with id ${input.engagementId}`)
  const name = e.displayName.trim()

  // Verify before writing: a typo'd repo would send the web specialist nowhere.
  const repo = repoAsk ? await getRepo(repoAsk) : null
  if (repoAsk && !repo) throw new BadRequest(`GitHub repo ${repoAsk} was not found (or the token cannot see it)`)
  const project = projectAsk ? await findVercelProject(projectAsk) : null
  if (projectAsk && !project) throw new BadRequest(`Vercel project ${projectAsk} was not found on the team`)

  // Refuse a repo or project another client already holds.
  const holders = await db.deliverable.findMany({
    where: { type: 'website', engagementId: { not: e.id } },
    select: { evidence: true, engagement: { select: { displayName: true } } },
  })
  for (const h of holders) {
    const ev = asObject(h.evidence)
    if (repo && typeof ev.repoUrl === 'string' && ev.repoUrl.toLowerCase().replace(/\.git$/, '') === repo.url.toLowerCase()) {
      throw new BadRequest(`${repo.fullName} is already linked to ${h.engagement.displayName.trim()}`)
    }
    if (project && ev.vercelProjectId === project.id) {
      throw new BadRequest(`Vercel project ${project.name} is already linked to ${h.engagement.displayName.trim()}`)
    }
  }

  let deliverableId = e.deliverables[0]?.id ?? null
  let created = false
  const current = e.deliverables[0] ? asObject(e.deliverables[0].evidence) : {}
  const merged: Record<string, unknown> = { ...current }
  if (repo) merged.repoUrl = repo.url
  if (project) {
    merged.vercelProjectId = project.id
    merged.vercelProjectName = project.name
  }

  if (!deliverableId) {
    const hasService = Array.isArray(e.services) && (e.services as string[]).includes('website')
    if (!hasService) throw new BadRequest(`${name} has no website service on the board; add it with update_client first`)
    const row = await db.deliverable.create({
      data: { engagementId: e.id, type: 'website', evidence: merged as Prisma.InputJsonObject },
      select: { id: true },
    })
    deliverableId = row.id
    created = true
  } else {
    await db.deliverable.update({ where: { id: deliverableId }, data: { evidence: merged as Prisma.InputJsonObject } })
  }

  const parts = [repo ? `repo ${repo.fullName}` : null, project ? `Vercel project ${project.name}` : null].filter(Boolean).join(' and ')
  await db.opsActivity.create({
    data: {
      engagementId: e.id,
      kind: 'system',
      body: `Linked ${parts} to the website${input.by === 'chief' ? ' (confirmed by Jacob in HQ chat)' : ''}${input.words ? `: "${input.words}"` : ''}`,
    },
  })
  dropLinkCache()

  let checks: LinkSiteResult['checks'] = null
  try {
    const s = await runWebChecks({ dryRun: false, only: e.id })
    checks = {
      matched: s.matched,
      failingByKey: s.failingByKey,
      couldNotRunByKey: s.couldNotRunByKey,
      statusChanges: s.statusChanges,
      autoAdvances: s.autoAdvances,
      apiErrors: s.apiErrors,
      checksWritten: s.checksWritten,
    }
  } catch (err) {
    console.error('[ops/link] web checks after link failed:', err)
  }

  return {
    client: name,
    deliverableId,
    created,
    repoUrl: typeof merged.repoUrl === 'string' ? merged.repoUrl : null,
    vercelProjectId: typeof merged.vercelProjectId === 'string' ? merged.vercelProjectId : null,
    vercelProjectName: typeof merged.vercelProjectName === 'string' ? merged.vercelProjectName : null,
    checks,
  }
}
