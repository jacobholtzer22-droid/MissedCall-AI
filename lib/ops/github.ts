// ===========================================
// /admin/ops — GitHub client (writes and the reads the agents need)
// ===========================================
// GITHUB_OPS_TOKEN, owner jacobholtzer22-droid. GETs go through the shared
// helper in lib/ops/checks/discover.ts; this file adds the writes. Nothing
// here logs a token or a secret value: errors carry the endpoint label, the
// HTTP status and GitHub's message only.
//
// Callers decide dry runs: every write here is real. The ops routes build a
// plan first and call these only when not dry.

import sodium from 'libsodium-wrappers'
import { GITHUB, GITHUB_OWNER, api } from '@/lib/ops/checks/discover'
import { errMessage, fetchWithTimeout } from '@/lib/ops/checks/limit'

export { GITHUB_OWNER }
export const TEMPLATE_REPO = 'AA-Template'

export class GithubError extends Error {
  constructor(public label: string, public status: number, message: string) {
    super(`${label}: HTTP ${status}${message ? ` ${message}` : ''}`)
  }
}

function token(): string {
  const t = process.env.GITHUB_OPS_TOKEN?.trim()
  if (!t) throw new Error('GITHUB_OPS_TOKEN is not set')
  return t
}

/** "owner/name" from "https://github.com/owner/name" or "owner/name". */
export function repoFullName(repo: string): string {
  return repo.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/+$/, '')
}

async function write<T>(method: string, path: string, label: string, body?: unknown): Promise<{ status: number; data: T | null }> {
  let res: Response
  try {
    res = await fetchWithTimeout(
      `${GITHUB}${path}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${token()}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'aa-ops',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
      30_000
    )
  } catch (err) {
    throw new GithubError(label, 0, errMessage(err))
  }
  const text = await res.text()
  const data = text ? (JSON.parse(text) as T & { message?: string }) : null
  if (!res.ok) throw new GithubError(label, res.status, (data as { message?: string } | null)?.message ?? '')
  return { status: res.status, data }
}

async function read<T>(path: string, label: string, accept?: string): Promise<{ status: number; body: T | null }> {
  const errors: string[] = []
  const r = await api<T>(`${GITHUB}${path}`, token(), label, errors, accept ?? 'application/vnd.github+json')
  if (errors.length > 0) throw new Error(errors.join('; '))
  return r
}

// ── Repos ───────────────────────────────────────────────────────────────────

export type RepoInfo = { fullName: string; url: string; defaultBranch: string; private: boolean }

export async function repoExists(fullName: string): Promise<boolean> {
  const { status } = await read(`/repos/${repoFullName(fullName)}`, `repo ${fullName}`)
  return status === 200
}

export async function getRepo(fullName: string): Promise<RepoInfo | null> {
  const { body } = await read<{ full_name: string; html_url: string; default_branch: string; private: boolean }>(
    `/repos/${repoFullName(fullName)}`,
    `repo ${fullName}`
  )
  return body ? { fullName: body.full_name, url: body.html_url, defaultBranch: body.default_branch, private: body.private } : null
}

export async function createRepoFromTemplate(owner: string, templateRepo: string, newName: string, isPrivate: boolean): Promise<RepoInfo> {
  const { data } = await write<{ full_name: string; html_url: string; default_branch: string; private: boolean }>(
    'POST',
    `/repos/${owner}/${templateRepo}/generate`,
    `generate ${owner}/${newName} from ${templateRepo}`,
    { owner, name: newName, private: isPrivate, include_all_branches: false }
  )
  return { fullName: data!.full_name, url: data!.html_url, defaultBranch: data!.default_branch, private: data!.private }
}

// ── Files ───────────────────────────────────────────────────────────────────

/** Raw text of a file, or null when it does not exist on that ref. */
export async function getFileContent(repo: string, path: string, ref?: string): Promise<string | null> {
  const q = ref ? `?ref=${encodeURIComponent(ref)}` : ''
  const { body } = await read<string>(`/repos/${repoFullName(repo)}/contents/${path}${q}`, `read ${path}`, 'application/vnd.github.raw')
  return typeof body === 'string' ? body : null
}

/** Create or replace one file on a branch; returns the new commit SHA. */
export async function putFile(repo: string, path: string, content: string, message: string, branch: string): Promise<string> {
  const full = repoFullName(repo)
  const { body: existing } = await read<{ sha: string }>(`/repos/${full}/contents/${path}?ref=${encodeURIComponent(branch)}`, `stat ${path}`)
  const { data } = await write<{ commit: { sha: string } }>('PUT', `/repos/${full}/contents/${path}`, `write ${path}`, {
    message,
    content: Buffer.from(content, 'utf8').toString('base64'),
    branch,
    ...(existing?.sha ? { sha: existing.sha } : {}),
  })
  return data!.commit.sha
}

/** Create `branch` at the default branch's head. An existing branch is left as it is. */
export async function createBranchFromDefault(repo: string, branch: string): Promise<{ created: boolean; base: string }> {
  const full = repoFullName(repo)
  const info = await getRepo(full)
  if (!info) throw new GithubError(`repo ${full}`, 404, 'not found')
  const { body: existing } = await read<{ object: { sha: string } }>(`/repos/${full}/git/ref/heads/${branch}`, `ref ${branch}`)
  if (existing) return { created: false, base: info.defaultBranch }
  const { body: head } = await read<{ object: { sha: string } }>(`/repos/${full}/git/ref/heads/${info.defaultBranch}`, `ref ${info.defaultBranch}`)
  if (!head) throw new GithubError(`ref ${info.defaultBranch}`, 404, 'default branch has no commits')
  await write('POST', `/repos/${full}/git/refs`, `create branch ${branch}`, { ref: `refs/heads/${branch}`, sha: head.object.sha })
  return { created: true, base: info.defaultBranch }
}

export async function openPullRequest(repo: string, head: string, base: string, title: string, body: string): Promise<{ number: number; url: string }> {
  const { data } = await write<{ number: number; html_url: string }>('POST', `/repos/${repoFullName(repo)}/pulls`, `open PR ${head}`, {
    title,
    head,
    base,
    body,
  })
  return { number: data!.number, url: data!.html_url }
}

export async function getPullRequest(repo: string, number: number) {
  const { body } = await read<{ number: number; html_url: string; state: string; merged: boolean; head: { ref: string } }>(
    `/repos/${repoFullName(repo)}/pulls/${number}`,
    `PR ${number}`
  )
  return body
}

// ── Secrets ─────────────────────────────────────────────────────────────────

/** Set an Actions secret, sealed to the repo's public key (libsodium sealed box). */
export async function setRepoSecret(repo: string, name: string, value: string): Promise<void> {
  const full = repoFullName(repo)
  const { body: key } = await read<{ key_id: string; key: string }>(`/repos/${full}/actions/secrets/public-key`, 'secrets public key')
  if (!key) throw new GithubError('secrets public key', 404, `no Actions public key for ${full}`)
  await sodium.ready
  const sealed = sodium.crypto_box_seal(sodium.from_string(value), sodium.from_base64(key.key, sodium.base64_variants.ORIGINAL))
  await write('PUT', `/repos/${full}/actions/secrets/${name}`, `set secret ${name}`, {
    encrypted_value: sodium.to_base64(sealed, sodium.base64_variants.ORIGINAL),
    key_id: key.key_id,
  })
}

// ── Actions ─────────────────────────────────────────────────────────────────

/** repository_dispatch; GitHub answers 204 on success. */
export async function repositoryDispatch(repo: string, eventType: string, clientPayload: Record<string, unknown>): Promise<number> {
  const { status } = await write('POST', `/repos/${repoFullName(repo)}/dispatches`, `dispatch ${eventType}`, {
    event_type: eventType,
    client_payload: clientPayload,
  })
  return status
}

export async function listWorkflowRuns(repo: string, since: Date) {
  const { body } = await read<{ workflow_runs: { id: number; html_url: string; status: string; conclusion: string | null; created_at: string; event: string; head_branch: string }[] }>(
    `/repos/${repoFullName(repo)}/actions/runs?per_page=50&created=${encodeURIComponent(`>=${since.toISOString()}`)}`,
    'workflow runs'
  )
  return body?.workflow_runs ?? []
}
