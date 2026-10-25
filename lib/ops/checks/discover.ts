// ===========================================
// /admin/ops web checks — discovery (read only)
// ===========================================
// Reads every Vercel project of the team and every GitHub repo owned by
// GITHUB_OWNER, then matches them to engagements:
//
//   (a) a website deliverable whose evidence already has the repoUrl or
//       vercelProjectId
//   (b) the repo's site.config.ts businessSlug equals the slug of a Business
//       that has an Engagement
//   (c) the Vercel project's git link points at a repo matched above
//   (d) a Vercel project domain equals a domain deliverable's evidence.domain
//
// First hit wins, in that order. Nothing is ever matched by name similarity:
// whatever does not match lands in the unmatched lists for Jacob. Two repos (or
// two projects) landing on one engagement is reported as an ambiguity and
// neither is used.
//
// Tokens come from VERCEL_API_TOKEN, VERCEL_TEAM_ID, GITHUB_OPS_TOKEN and are
// never logged; API errors carry only the endpoint label and HTTP status.

import { EXTERNAL_CONCURRENCY, errMessage, fetchWithTimeout, mapLimited } from './limit'

export const GITHUB_OWNER = 'jacobholtzer22-droid'
const VERCEL = 'https://api.vercel.com'
const GITHUB = 'https://api.github.com'

// ── Shapes ──────────────────────────────────────────────────────────────────

export type VercelDomain = { name: string; verified: boolean; redirect: string | null }

export type VercelDeployment = { url: string; state: string; createdAt: string; branch: string | null }

export type VercelProject = {
  id: string
  name: string
  framework: string | null
  /** owner/name when git-linked to GitHub. */
  gitRepo: string | null
  gitType: string | null
  domains: VercelDomain[]
  production: VercelDeployment | null
  preview: VercelDeployment | null
}

export type GithubRepo = {
  fullName: string // owner/name
  name: string
  url: string
  defaultBranch: string
  pushedAt: string | null
  visibility: string
  archived: boolean
  hasWorkflow: boolean
  hasSiteConfig: boolean
  /** site.config.ts businessSlug string literal, when found. */
  siteSlug: string | null
  /** site.config.ts launch.indexable; null when absent. */
  indexable: boolean | null
}

export type Discovery = {
  projects: VercelProject[]
  repos: GithubRepo[]
  errors: string[]
}

// ── HTTP ────────────────────────────────────────────────────────────────────

async function api<T>(url: string, token: string, label: string, errors: string[], accept?: string): Promise<{ status: number; body: T | null }> {
  try {
    const res = await fetchWithTimeout(url, {
      headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'aa-ops-web-checks', ...(accept ? { Accept: accept } : {}) },
    })
    if (res.status === 404) return { status: 404, body: null }
    if (!res.ok) {
      errors.push(`${label}: HTTP ${res.status}`)
      return { status: res.status, body: null }
    }
    const body = accept === 'application/vnd.github.raw' ? ((await res.text()) as unknown as T) : ((await res.json()) as T)
    return { status: res.status, body }
  } catch (err) {
    errors.push(`${label}: ${errMessage(err)}`)
    return { status: 0, body: null }
  }
}

// ── Vercel ──────────────────────────────────────────────────────────────────

type RawProject = { id: string; name: string; framework?: string | null; link?: { type?: string; org?: string; repo?: string } | null }
type RawDeployment = { url: string; state?: string; readyState?: string; createdAt?: number; created?: number; meta?: { githubCommitRef?: string } }

const toDeployment = (d: RawDeployment | undefined): VercelDeployment | null =>
  d
    ? {
        url: `https://${d.url}`,
        state: d.state ?? d.readyState ?? 'UNKNOWN',
        createdAt: new Date(d.createdAt ?? d.created ?? 0).toISOString(),
        branch: d.meta?.githubCommitRef ?? null,
      }
    : null

async function discoverVercel(token: string, teamId: string, errors: string[]): Promise<VercelProject[]> {
  const raw: RawProject[] = []
  let until: number | null = null
  for (let page = 0; page < 50; page++) {
    const q: string = `teamId=${encodeURIComponent(teamId)}&limit=100${until ? `&until=${until}` : ''}`
    const { body }: { body: { projects: RawProject[]; pagination?: { next?: number | null } } | null } = await api(
      `${VERCEL}/v9/projects?${q}`,
      token,
      'vercel projects',
      errors
    )
    if (!body) break
    raw.push(...body.projects)
    until = body.pagination?.next ?? null
    if (!until) break
  }

  const team = `teamId=${encodeURIComponent(teamId)}`
  return mapLimited(raw, EXTERNAL_CONCURRENCY, async (p) => {
    const [domains, prod, preview] = await Promise.all([
      api<{ domains: { name: string; verified: boolean; redirect?: string | null }[] }>(
        `${VERCEL}/v9/projects/${p.id}/domains?${team}&limit=100`,
        token,
        `vercel domains ${p.name}`,
        errors
      ),
      api<{ deployments: RawDeployment[] }>(
        `${VERCEL}/v6/deployments?projectId=${p.id}&${team}&target=production&limit=1`,
        token,
        `vercel production deployment ${p.name}`,
        errors
      ),
      api<{ deployments: RawDeployment[] }>(
        `${VERCEL}/v6/deployments?projectId=${p.id}&${team}&target=preview&limit=1`,
        token,
        `vercel preview deployment ${p.name}`,
        errors
      ),
    ])
    const gitRepo = p.link?.type === 'github' && p.link.org && p.link.repo ? `${p.link.org}/${p.link.repo}` : null
    return {
      id: p.id,
      name: p.name,
      framework: p.framework ?? null,
      gitRepo,
      gitType: p.link?.type ?? null,
      domains: (domains.body?.domains ?? []).map((d) => ({ name: d.name, verified: Boolean(d.verified), redirect: d.redirect ?? null })),
      production: toDeployment(prod.body?.deployments?.[0]),
      preview: toDeployment(preview.body?.deployments?.[0]),
    }
  })
}

// ── GitHub ──────────────────────────────────────────────────────────────────

type RawRepo = {
  name: string
  full_name: string
  html_url: string
  default_branch: string
  pushed_at: string | null
  visibility?: string
  private?: boolean
  archived?: boolean
  owner: { login: string }
}

/** businessSlug: '…' (any quote style) in site.config.ts. */
export function parseSiteSlug(src: string): string | null {
  return src.match(/businessSlug\s*:\s*['"`]([^'"`\n]+)['"`]/)?.[1]?.trim() ?? null
}

/**
 * Whether the site is meant to be indexed: launch.indexable when the config has
 * it, else the template's `prelaunch: true|false` (prelaunch true = noindex,
 * so indexable false). null when neither is present.
 */
export function parseIndexable(src: string): boolean | null {
  const launch = src.match(/launch\s*:\s*\{([\s\S]*?)\}/)
  const m = launch?.[1]?.match(/indexable\s*:\s*(true|false)\b/)
  if (m) return m[1] === 'true'
  const pre = src.match(/^\s*prelaunch\s*:\s*(true|false)\b/m)
  return pre ? pre[1] === 'false' : null
}

async function discoverGithub(token: string, errors: string[]): Promise<GithubRepo[]> {
  const raw: RawRepo[] = []
  for (let page = 1; page <= 20; page++) {
    const { body } = await api<RawRepo[]>(
      `${GITHUB}/user/repos?per_page=100&affiliation=owner&page=${page}`,
      token,
      'github repos',
      errors,
      'application/vnd.github+json'
    )
    if (!body || body.length === 0) break
    raw.push(...body.filter((r) => r.owner.login === GITHUB_OWNER))
    if (body.length < 100) break
  }

  return mapLimited(raw, EXTERNAL_CONCURRENCY, async (r) => {
    const [workflow, config] = await Promise.all([
      api<unknown>(
        `${GITHUB}/repos/${r.full_name}/contents/.github/workflows/aa-build.yml`,
        token,
        `github workflow ${r.name}`,
        errors,
        'application/vnd.github+json'
      ),
      api<string>(`${GITHUB}/repos/${r.full_name}/contents/site.config.ts`, token, `github site.config ${r.name}`, errors, 'application/vnd.github.raw'),
    ])
    const src = typeof config.body === 'string' ? config.body : null
    return {
      fullName: r.full_name,
      name: r.name,
      url: r.html_url,
      defaultBranch: r.default_branch,
      pushedAt: r.pushed_at,
      visibility: r.visibility ?? (r.private ? 'private' : 'public'),
      archived: Boolean(r.archived),
      hasWorkflow: workflow.status === 200,
      hasSiteConfig: src !== null,
      siteSlug: src ? parseSiteSlug(src) : null,
      indexable: src ? parseIndexable(src) : null,
    }
  })
}

// ── Discovery ───────────────────────────────────────────────────────────────

export async function discover(): Promise<Discovery> {
  const errors: string[] = []
  const vercelToken = process.env.VERCEL_API_TOKEN?.trim()
  const teamId = process.env.VERCEL_TEAM_ID?.trim()
  const githubToken = process.env.GITHUB_OPS_TOKEN?.trim()
  if (!vercelToken || !teamId) errors.push('VERCEL_API_TOKEN or VERCEL_TEAM_ID is not set: Vercel skipped')
  if (!githubToken) errors.push('GITHUB_OPS_TOKEN is not set: GitHub skipped')

  const [projects, repos] = await Promise.all([
    vercelToken && teamId ? discoverVercel(vercelToken, teamId, errors) : Promise.resolve([]),
    githubToken ? discoverGithub(githubToken, errors) : Promise.resolve([]),
  ])
  return { projects, repos, errors }
}

// ── Matching ────────────────────────────────────────────────────────────────

export type MatchableEngagement = {
  id: string
  displayName: string
  businessSlug: string | null
  website: { id: string; evidence: Record<string, unknown> } | null
  domain: { id: string; evidence: Record<string, unknown> } | null
}

export type MatchVia = 'evidence' | 'slug' | 'git_link' | 'domain' | 'project_link'

export type Matches = {
  repoFor: Map<string, { repo: GithubRepo; via: MatchVia }>
  projectFor: Map<string, { project: VercelProject; via: MatchVia }>
  unmatchedRepos: string[]
  unmatchedProjects: string[]
  ambiguities: string[]
}

const normRepo = (s: string) =>
  s.trim().toLowerCase().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/+$/, '')
const apexOf = (host: string) => host.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '')

export function matchDiscovery(engs: MatchableEngagement[], d: Discovery): Matches {
  const ambiguities: string[] = []
  const repoHits = new Map<string, { repo: GithubRepo; via: MatchVia }[]>()
  const projectHits = new Map<string, { project: VercelProject; via: MatchVia }[]>()
  const addRepo = (engId: string, repo: GithubRepo, via: MatchVia) => {
    const list = repoHits.get(engId) ?? []
    if (!list.some((h) => h.repo.fullName === repo.fullName)) list.push({ repo, via })
    repoHits.set(engId, list)
  }
  const addProject = (engId: string, project: VercelProject, via: MatchVia) => {
    const list = projectHits.get(engId) ?? []
    if (!list.some((h) => h.project.id === project.id)) list.push({ project, via })
    projectHits.set(engId, list)
  }
  const repoTaken = new Set<string>()
  const projectTaken = new Set<string>()

  // (a) evidence already on the website deliverable
  for (const e of engs) {
    const ev = e.website?.evidence ?? {}
    const repoUrl = typeof ev.repoUrl === 'string' ? normRepo(ev.repoUrl) : null
    const projectId = typeof ev.vercelProjectId === 'string' ? ev.vercelProjectId : null
    const repo = repoUrl ? d.repos.find((r) => r.fullName.toLowerCase() === repoUrl) : undefined
    const project = projectId ? d.projects.find((p) => p.id === projectId) : undefined
    if (repo) addRepo(e.id, repo, 'evidence')
    if (project) addProject(e.id, project, 'evidence')
  }
  for (const list of Array.from(repoHits.values())) list.forEach((h) => repoTaken.add(h.repo.fullName))
  for (const list of Array.from(projectHits.values())) list.forEach((h) => projectTaken.add(h.project.id))

  // (b) site.config businessSlug = Business.slug
  for (const repo of d.repos) {
    if (repoTaken.has(repo.fullName) || !repo.siteSlug) continue
    const hits = engs.filter((e) => e.businessSlug && e.businessSlug === repo.siteSlug)
    if (hits.length === 1 && !repoHits.has(hits[0].id)) addRepo(hits[0].id, repo, 'slug')
    else if (hits.length === 1) addRepo(hits[0].id, repo, 'slug') // second repo for one client: ambiguity below
    else if (hits.length > 1) ambiguities.push(`repo ${repo.fullName}: slug ${repo.siteSlug} belongs to ${hits.length} engagements`)
  }

  // (c) project git link → a matched repo
  for (const [engId, list] of Array.from(repoHits.entries())) {
    for (const { repo } of list) {
      for (const p of d.projects) {
        if (projectTaken.has(p.id) || !p.gitRepo || p.gitRepo.toLowerCase() !== repo.fullName.toLowerCase()) continue
        addProject(engId, p, 'git_link')
      }
    }
  }

  // (d) project domain = a domain deliverable's evidence.domain
  for (const e of engs) {
    const dom = e.domain?.evidence?.domain
    if (typeof dom !== 'string' || !dom.trim()) continue
    const apex = apexOf(dom)
    for (const p of d.projects) {
      if (projectTaken.has(p.id)) continue
      if (p.domains.some((x) => apexOf(x.name) === apex)) addProject(e.id, p, 'domain')
    }
  }

  // A project matched by domain brings its git-linked repo along.
  for (const [engId, list] of Array.from(projectHits.entries())) {
    for (const { project, via } of list) {
      if (via !== 'domain' || !project.gitRepo) continue
      const repo = d.repos.find((r) => r.fullName.toLowerCase() === project.gitRepo!.toLowerCase())
      if (repo && !Array.from(repoHits.values()).some((l) => l.some((h) => h.repo.fullName === repo.fullName))) {
        addRepo(engId, repo, 'project_link')
      }
    }
  }

  // Resolve: exactly one of each per engagement, and each repo/project to one engagement.
  const repoFor = new Map<string, { repo: GithubRepo; via: MatchVia }>()
  const projectFor = new Map<string, { project: VercelProject; via: MatchVia }>()
  const name = (id: string) => engs.find((e) => e.id === id)?.displayName ?? id
  const repoOwners = new Map<string, string[]>()
  const projectOwners = new Map<string, string[]>()
  for (const [engId, list] of Array.from(repoHits.entries())) for (const h of list) repoOwners.set(h.repo.fullName, [...(repoOwners.get(h.repo.fullName) ?? []), engId])
  for (const [engId, list] of Array.from(projectHits.entries())) for (const h of list) projectOwners.set(h.project.id, [...(projectOwners.get(h.project.id) ?? []), engId])

  for (const [engId, list] of Array.from(repoHits.entries())) {
    const own = list.filter((h) => (repoOwners.get(h.repo.fullName) ?? []).length === 1)
    if (own.length === 1) repoFor.set(engId, own[0])
    else if (list.length > 1) ambiguities.push(`${name(engId)}: ${list.length} repos match (${list.map((h) => `${h.repo.fullName} via ${h.via}`).join(', ')})`)
  }
  for (const [repoName, owners] of Array.from(repoOwners.entries())) {
    if (owners.length > 1) ambiguities.push(`repo ${repoName} matches ${owners.map(name).join(', ')}`)
  }
  for (const [engId, list] of Array.from(projectHits.entries())) {
    const own = list.filter((h) => (projectOwners.get(h.project.id) ?? []).length === 1)
    if (own.length === 1) projectFor.set(engId, own[0])
    else if (list.length > 1) ambiguities.push(`${name(engId)}: ${list.length} Vercel projects match (${list.map((h) => `${h.project.name} via ${h.via}`).join(', ')})`)
  }
  for (const [projectId, owners] of Array.from(projectOwners.entries())) {
    if (owners.length > 1) {
      const p = d.projects.find((x) => x.id === projectId)
      ambiguities.push(`Vercel project ${p?.name ?? projectId} matches ${owners.map(name).join(', ')}`)
    }
  }

  const usedRepos = new Set(Array.from(repoFor.values()).map((h) => h.repo.fullName))
  const usedProjects = new Set(Array.from(projectFor.values()).map((h) => h.project.id))
  return {
    repoFor,
    projectFor,
    unmatchedRepos: d.repos.filter((r) => !usedRepos.has(r.fullName)).map((r) => r.fullName.split('/')[1]).sort(),
    unmatchedProjects: d.projects.filter((p) => !usedProjects.has(p.id)).map((p) => p.name).sort(),
    ambiguities,
  }
}
