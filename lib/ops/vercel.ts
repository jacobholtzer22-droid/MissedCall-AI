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

/** Project settings provisioning uses for every new client site (static export). */
export const SITE_PROJECT_SETTINGS = { framework: null, buildCommand: 'npm run build', outputDirectory: 'out' } as const

export type CreatedProject = { id: string; name: string; productionUrl: string }

/** Vercel project names are lowercase letters, digits, and - . _ only. */
export function vercelProjectName(repoName: string): string {
  return repoName.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100)
}

export async function createProjectLinkedToRepo(
  name: string,
  ownerRepo: string,
  settings: { framework: string | null; buildCommand: string; outputDirectory: string } = SITE_PROJECT_SETTINGS
): Promise<CreatedProject> {
  const data = await write<{ id: string; name: string }>('POST', '/v11/projects', `create project ${name}`, {
    name,
    framework: settings.framework,
    buildCommand: settings.buildCommand,
    outputDirectory: settings.outputDirectory,
    gitRepository: { type: 'github', repo: repoFullName(ownerRepo) },
  })
  return { id: data.id, name: data.name, productionUrl: `https://${data.name}.vercel.app` }
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
