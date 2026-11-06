// ===========================================
// /admin/ops web checks — repo and project link suggestions (pure)
// ===========================================
// The matcher in discover.ts never links by name on purpose: a wrong link
// would send a web specialist at the wrong repo. But a client whose repo got
// renamed mid-build, or whose site.config.ts still carries the placeholder
// slug, matches nothing and sits unlinked until someone types the repo URL by
// hand. This module ranks the unmatched repos and Vercel projects for each
// unlinked client by name similarity so Jacob (or the chief, in chat) can
// confirm one with a tap instead of hunting for the URL. Nothing here writes;
// the confirmed link goes through lib/ops/checks/link.ts.

import type { Discovery, GithubRepo, Matches, MatchableEngagement, VercelProject } from './discover'

export type RepoCandidate = { fullName: string; url: string; score: number; why: string; siteSlug: string | null; pushedAt: string | null }
export type ProjectCandidate = { id: string; name: string; score: number; why: string; gitRepo: string | null; domains: string[]; productionUrl: string | null }

export type LinkSuggestion = {
  engagementId: string
  client: string
  businessSlug: string | null
  /** What the website deliverable already has, if anything (one of the two can be missing). */
  linked: { repoUrl: string | null; vercelProjectId: string | null }
  repos: RepoCandidate[]
  projects: ProjectCandidate[]
}

const STOP = new Set(['llc', 'inc', 'co', 'the', 'and', 'of', 'services', 'service', 'company', 'website', 'site', 'web', 'aa'])

/** Lowercase word tokens with the business-suffix noise removed. */
export function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !STOP.has(t))
}

/**
 * 0..1 similarity between a client name and a candidate name: the share of the
 * client's tokens that appear in the candidate, with a small penalty when the
 * candidate carries many extra tokens (so "cowboy-spray-foam" outranks
 * "christian-cowboy-spray-foam-old-backup" for "Cowboy Spray Foam").
 */
export function similarity(client: string, candidate: string): number {
  const a = tokens(client)
  const b = tokens(candidate)
  if (a.length === 0 || b.length === 0) return 0
  const bset = new Set(b)
  const hit = a.filter((t) => bset.has(t) || b.some((x) => x.length >= 4 && (x.startsWith(t) || t.startsWith(x)))).length
  const recall = hit / a.length
  const extra = Math.max(0, b.length - hit)
  return Math.max(0, recall - extra * 0.05)
}

const MIN_SCORE = 0.34

export function suggestLinks(engs: MatchableEngagement[], d: Discovery, m: Matches, opts: { websiteOnly?: Set<string> } = {}): LinkSuggestion[] {
  const usedRepos = new Set(Array.from(m.repoFor.values()).map((h) => h.repo.fullName))
  const usedProjects = new Set(Array.from(m.projectFor.values()).map((h) => h.project.id))
  const freeRepos = d.repos.filter((r) => !usedRepos.has(r.fullName) && !r.archived)
  const freeProjects = d.projects.filter((p) => !usedProjects.has(p.id))

  const out: LinkSuggestion[] = []
  for (const e of engs) {
    if (opts.websiteOnly && !opts.websiteOnly.has(e.id)) continue
    const hasRepo = m.repoFor.has(e.id)
    const hasProject = m.projectFor.has(e.id)
    if (hasRepo && hasProject) continue

    const names = [e.displayName, e.businessSlug ?? ''].filter(Boolean)
    const best = (cand: string) => Math.max(...names.map((n) => similarity(n, cand)))

    const repos: RepoCandidate[] = hasRepo
      ? []
      : freeRepos
          .map((r) => scoreRepo(r, best, e.businessSlug))
          .filter((c) => c.score >= MIN_SCORE)
          .sort((a, b) => b.score - a.score || (b.pushedAt ?? '').localeCompare(a.pushedAt ?? ''))
          .slice(0, 3)

    const projects: ProjectCandidate[] = hasProject
      ? []
      : freeProjects
          .map((p) => scoreProject(p, best, repos))
          .filter((c) => c.score >= MIN_SCORE)
          .sort((a, b) => b.score - a.score)
          .slice(0, 3)

    const ev = e.website?.evidence ?? {}
    out.push({
      engagementId: e.id,
      client: e.displayName,
      businessSlug: e.businessSlug,
      linked: {
        repoUrl: hasRepo ? m.repoFor.get(e.id)!.repo.url : typeof ev.repoUrl === 'string' ? ev.repoUrl : null,
        vercelProjectId: hasProject ? m.projectFor.get(e.id)!.project.id : typeof ev.vercelProjectId === 'string' ? ev.vercelProjectId : null,
      },
      repos,
      projects,
    })
  }
  return out.sort((a, b) => (b.repos[0]?.score ?? 0) + (b.projects[0]?.score ?? 0) - ((a.repos[0]?.score ?? 0) + (a.projects[0]?.score ?? 0)))
}

function scoreRepo(r: GithubRepo, best: (s: string) => number, slug: string | null): RepoCandidate {
  let score = best(r.name)
  const why: string[] = []
  if (score > 0) why.push(`name "${r.name}"`)
  if (slug && r.siteSlug && r.siteSlug === slug) {
    score = Math.max(score, 1)
    why.push(`site.config slug ${slug}`)
  } else if (r.siteSlug && !r.siteSlug.startsWith('replace')) {
    const s = best(r.siteSlug)
    if (s > score) {
      score = s
      why.push(`site.config slug ${r.siteSlug}`)
    }
  }
  if (!r.hasSiteConfig) score *= 0.5
  return { fullName: r.fullName, url: r.url, score: round(score), why: why.join(', ') || 'weak name match', siteSlug: r.siteSlug, pushedAt: r.pushedAt }
}

function scoreProject(p: VercelProject, best: (s: string) => number, repos: RepoCandidate[]): ProjectCandidate {
  let score = best(p.name)
  const why: string[] = []
  if (score > 0) why.push(`name "${p.name}"`)
  const custom = p.domains.filter((d) => !d.name.endsWith('.vercel.app')).map((d) => d.name)
  for (const host of custom) {
    const s = best(host.replace(/^www\./, '').replace(/\.[a-z]+$/, ''))
    if (s > score) {
      score = s
      why.push(`domain ${host}`)
    }
  }
  if (p.gitRepo && repos.some((r) => r.fullName.toLowerCase() === p.gitRepo!.toLowerCase())) {
    score = Math.max(score, 1)
    why.push(`git-linked to ${p.gitRepo}`)
  }
  return {
    id: p.id,
    name: p.name,
    score: round(score),
    why: why.join(', ') || 'weak name match',
    gitRepo: p.gitRepo,
    domains: custom,
    productionUrl: custom.find((h) => h.startsWith('www.')) ? `https://${custom.find((h) => h.startsWith('www.'))}` : p.production?.url ?? null,
  }
}

const round = (n: number) => Math.round(n * 100) / 100
