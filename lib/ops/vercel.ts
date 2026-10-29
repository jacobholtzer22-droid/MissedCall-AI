// ===========================================
// /admin/ops — Vercel client (writes and branch deployments)
// ===========================================
// VERCEL_API_TOKEN + VERCEL_TEAM_ID. GETs go through the shared helper in
// lib/ops/checks/discover.ts. Errors carry the endpoint label, status and
// Vercel's message only, never the token.
//
// Callers decide dry runs: every write here is real.

import { VERCEL, api } from '@/lib/ops/checks/discover'
import { errMessage, fetchWithTimeout } from '@/lib/ops/checks/limit'
import { repoFullName } from '@/lib/ops/github'

export class VercelError extends Error {
  constructor(public label: string, public status: number, message: string) {
    super(`${label}: HTTP ${status}${message ? ` ${message}` : ''}`)
  }
}

function creds(): { token: string; team: string } {
  const token = process.env.VERCEL_API_TOKEN?.trim()
  const team = process.env.VERCEL_TEAM_ID?.trim()
  if (!token || !team) throw new Error('VERCEL_API_TOKEN or VERCEL_TEAM_ID is not set')
  return { token, team }
}

async function write<T>(method: string, path: string, label: string, body: unknown): Promise<T> {
  const { token, team } = creds()
  const sep = path.includes('?') ? '&' : '?'
  let res: Response
  try {
    res = await fetchWithTimeout(
      `${VERCEL}${path}${sep}teamId=${encodeURIComponent(team)}`,
      { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
      30_000
    )
  } catch (err) {
    throw new VercelError(label, 0, errMessage(err))
  }
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) throw new VercelError(label, res.status, data?.error?.message ?? '')
  return data as T
}

/**
 * Project settings provisioning uses for every new client site, matching the
 * hand-made projects (ronny-prestige-blinds): framework nextjs, build command
 * and output directory left to the framework. With the framework unset, Vercel
 * served the static export's raw files, so /contact was 404 and only
 * /contact.html answered; the nextjs preset serves the export with clean URLs.
 * Node stays on the team default (24.x, the same as the hand-made projects).
 */
export const SITE_PROJECT_SETTINGS = { framework: 'nextjs', buildCommand: null, outputDirectory: null } as const

export type CreatedProject = { id: string; name: string; productionUrl: string }

/** Vercel project names are lowercase letters, digits, and - . _ only. */
export function vercelProjectName(repoName: string): string {
  return repoName.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100)
}

export async function createProjectLinkedToRepo(
  name: string,
  ownerRepo: string,
  settings: { framework: string | null; buildCommand: string | null; outputDirectory: string | null } = SITE_PROJECT_SETTINGS
): Promise<CreatedProject> {
  const data = await write<{ id: string; name: string }>('POST', '/v11/projects', `create project ${name}`, {
    name,
    framework: settings.framework,
    buildCommand: settings.buildCommand,
    outputDirectory: settings.outputDirectory,
    gitRepository: { type: 'github', repo: repoFullName(ownerRepo) },
  })
  await openDeploymentProtection(data.id)
  return { id: data.id, name: data.name, productionUrl: `https://${data.name}.vercel.app` }
}

/**
 * Turn Vercel Authentication off on a client site project, for previews and
 * production (custom domains are never protected by it either way). New
 * projects get the team default, which blocks every *.vercel.app URL behind a
 * Vercel login, so a client could not open the preview Jacob sends; the
 * hand-made projects (ronny-prestige-blinds) have it off. Client sites are
 * noindex until go-live, so an open preview is not indexed.
 */
export async function openDeploymentProtection(projectId: string): Promise<void> {
  await write('PATCH', `/v9/projects/${projectId}`, `open deployment protection ${projectId}`, { ssoProtection: null })
}

export async function linkExistingProjectToRepo(projectId: string, ownerRepo: string): Promise<void> {
  await write('POST', `/v9/projects/${projectId}/link`, `link project ${projectId}`, {
    type: 'github',
    repo: repoFullName(ownerRepo),
  })
}

export type BranchDeployment = { url: string; state: string; createdAt: string; branch: string }

/** Deployments of one git branch, newest first (from the 100 most recent preview deployments). */
export async function listDeploymentsForBranch(projectId: string, branch: string): Promise<BranchDeployment[]> {
  const { token, team } = creds()
  const errors: string[] = []
  const { body } = await api<{ deployments: { url: string; state?: string; readyState?: string; created?: number; createdAt?: number; meta?: { githubCommitRef?: string } }[] }>(
    `${VERCEL}/v6/deployments?projectId=${projectId}&teamId=${encodeURIComponent(team)}&target=preview&limit=100`,
    token,
    `deployments ${projectId}`,
    errors
  )
  if (errors.length > 0) throw new Error(errors.join('; '))
  return (body?.deployments ?? [])
    .filter((d) => d.meta?.githubCommitRef === branch)
    .map((d) => ({
      url: `https://${d.url}`,
      state: d.state ?? d.readyState ?? 'UNKNOWN',
      createdAt: new Date(d.createdAt ?? d.created ?? 0).toISOString(),
      branch,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

// ── Domains ─────────────────────────────────────────────────────────────────

export type DnsRecord = { type: 'A' | 'CNAME' | 'TXT'; name: string; value: string; why: string }

/**
 * Add a domain to a project. With redirectTo, requests to it redirect there
 * (www to the apex). A domain the project already has is not an error.
 * Returns Vercel's ownership checks when it needs a TXT record first.
 */
export async function addProjectDomain(projectId: string, name: string, redirectTo?: string): Promise<{ name: string; verified: boolean; verification: DnsRecord[]; alreadyAdded: boolean }> {
  try {
    const data = await write<{ name: string; verified: boolean; verification?: { type: string; domain: string; value: string; reason: string }[] }>(
      'POST',
      `/v10/projects/${projectId}/domains`,
      `add domain ${name}`,
      { name, ...(redirectTo ? { redirect: redirectTo, redirectStatusCode: 308 } : {}) }
    )
    return {
      name: data.name,
      verified: data.verified,
      verification: (data.verification ?? []).map((v) => ({ type: 'TXT' as const, name: v.domain, value: v.value, why: `Vercel ownership check (${v.reason})` })),
      alreadyAdded: false,
    }
  } catch (err) {
    if (err instanceof VercelError && err.status === 409) return { name, verified: true, verification: [], alreadyAdded: true }
    throw err
  }
}

/**
 * The DNS records a domain needs to point at Vercel. Asks Vercel's domain
 * config; falls back to Vercel's documented defaults (apex A 76.76.21.21,
 * www CNAME cname.vercel-dns.com) when it gives no recommendation.
 */
export async function domainRecords(apex: string): Promise<{ records: DnsRecord[]; misconfigured: boolean | null }> {
  const { token, team } = creds()
  const errors: string[] = []
  const { body } = await api<{ misconfigured?: boolean; recommendedIPv4?: { rank: number; value: string[] }[]; recommendedCNAME?: { rank: number; value: string }[] }>(
    `${VERCEL}/v6/domains/${encodeURIComponent(apex)}/config?teamId=${encodeURIComponent(team)}`,
    token,
    `domain config ${apex}`,
    errors
  )
  const ip = body?.recommendedIPv4?.sort((a, b) => a.rank - b.rank)[0]?.value?.[0] ?? '76.76.21.21'
  const cname = body?.recommendedCNAME?.sort((a, b) => a.rank - b.rank)[0]?.value ?? 'cname.vercel-dns.com'
  return {
    records: [
      { type: 'A', name: '@', value: ip, why: `${apex} to Vercel` },
      { type: 'CNAME', name: 'www', value: cname.replace(/\.$/, ''), why: `www.${apex} to Vercel (redirects to ${apex})` },
    ],
    misconfigured: errors.length ? null : body?.misconfigured ?? null,
  }
}
