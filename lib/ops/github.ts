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

/**
 * Whether a repo by exactly this name exists. GitHub redirects a renamed
 * repo's old name to the new one (AA-YualexPainting answers as
 * AA-YualexPainting-old), and creating a repo under the old name is allowed:
 * it replaces the redirect. So a 200 for a different name means free.
 */
export async function repoExists(fullName: string): Promise<boolean> {
  const { status, body } = await read<{ full_name?: string }>(`/repos/${repoFullName(fullName)}`, `repo ${fullName}`)
  return status === 200 && isSameRepo(fullName, body?.full_name)
}

/** GitHub names are case-insensitive: "owner/AA-X" is "Owner/aa-x". */
export function isSameRepo(asked: string, returned: string | null | undefined): boolean {
  return typeof returned === 'string' && repoFullName(asked).toLowerCase() === repoFullName(returned).toLowerCase()
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

/**
 * Create or replace one file on a branch; returns the new commit SHA, or null
 * when the branch already holds exactly this content (nothing is written, so a
 * re-run does not stack empty commits).
 */
export async function putFile(repo: string, path: string, content: string, message: string, branch: string): Promise<string | null> {
  const full = repoFullName(repo)
  const { body: existing } = await read<{ sha: string; content?: string; encoding?: string }>(
    `/repos/${full}/contents/${path}?ref=${encodeURIComponent(branch)}`,
    `stat ${path}`
  )
  if (existing?.content && existing.encoding === 'base64' && Buffer.from(existing.content, 'base64').toString('utf8') === content) return null
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

/** Open a PR, or return the open PR already proposing `head` into `base` (a re-run must not fail on GitHub's 422). */
export async function openPullRequest(repo: string, head: string, base: string, title: string, body: string): Promise<{ number: number; url: string; reused: boolean }> {
  const full = repoFullName(repo)
  const { body: open } = await read<{ number: number; html_url: string }[]>(
    `/repos/${full}/pulls?state=open&head=${encodeURIComponent(`${full.split('/')[0]}:${head}`)}&base=${encodeURIComponent(base)}`,
    `open PRs for ${head}`
  )
  if (open && open.length > 0) return { number: open[0].number, url: open[0].html_url, reused: true }
  const { data } = await write<{ number: number; html_url: string }>('POST', `/repos/${repoFullName(repo)}/pulls`, `open PR ${head}`, {
    title,
    head,
    base,
    body,
  })
  return { number: data!.number, url: data!.html_url, reused: false }
}

export async function getPullRequest(repo: string, number: number) {
  const { body } = await read<{ number: number; html_url: string; state: string; merged: boolean; head: { ref: string } }>(
    `/repos/${repoFullName(repo)}/pulls/${number}`,
    `PR ${number}`
  )
  return body
}

/** Squash-merge an open PR. Throws GithubError (405 not mergeable, 409 head moved). */
export async function mergePullRequest(repo: string, number: number, title: string): Promise<{ sha: string; merged: boolean }> {
  const { data } = await write<{ sha: string; merged: boolean }>('PUT', `/repos/${repoFullName(repo)}/pulls/${number}/merge`, `merge PR ${number}`, {
    merge_method: 'squash',
    commit_title: title,
  })
  return { sha: data?.sha ?? '', merged: Boolean(data?.merged) }
}

/** Delete a branch after its PR merged. A branch already gone (422/404) is fine. */
export async function deleteBranch(repo: string, branch: string): Promise<boolean> {
  try {
    await write('DELETE', `/repos/${repoFullName(repo)}/git/refs/heads/${branch.split('/').map(encodeURIComponent).join('/')}`, `delete branch ${branch}`)
    return true
  } catch (err) {
    if (err instanceof GithubError && (err.status === 404 || err.status === 422)) return false
    throw err
  }
}

/**
 * Why Vercel did not deploy a PR's branch, from the Vercel bot's comments on
 * the PR. The bot writes an explanation ("@aa-build must be a member of the
 * ... team on Vercel to deploy.") and a status table behind a hidden "[vc]:"
 * line. Prefer the explanation's first line; else the table's status word
 * ("Vercel marked the deployment Blocked"). Plain text, at most 300 characters;
 * null when the bot said nothing.
 */
export async function vercelBotNote(repo: string, number: number): Promise<string | null> {
  const { body } = await read<{ user?: { login?: string }; body?: string }[]>(`/repos/${repoFullName(repo)}/issues/${number}/comments?per_page=50`, `comments on #${number}`)
  const bot = (body ?? []).filter((c) => /^vercel(\[bot\])?$/i.test(c.user?.login ?? '') && c.body)
  const plain = (t: string) =>
    t
      .replace(/<[^>]+>/g, ' ')
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[*_`#>]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  const explained = bot.filter((c) => !/^\[vc\]:/m.test(c.body!)).pop()
  if (explained) {
    const first = explained.body!.split('\n').map(plain).find(Boolean)
    if (first) return first.slice(0, 300)
  }
  const table = bot.filter((c) => /^\[vc\]:/m.test(c.body!)).pop()
  const status = table && /!\[(Blocked|Error|Canceled|Building|Queued|Ready)\]/i.exec(table.body!)?.[1]
  return status ? `Vercel marked the deployment ${status}` : null
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

export type WorkflowRun = { id: number; html_url: string; status: string; created_at: string; event: string }

/** Runs of one workflow file for one event, created at or after since, newest first. */
export async function listWorkflowFileRuns(repo: string, workflowFile: string, event: string, since: Date): Promise<WorkflowRun[]> {
  const q = `event=${encodeURIComponent(event)}&per_page=50&created=${encodeURIComponent(`>=${since.toISOString()}`)}`
  const { body } = await read<{ workflow_runs: WorkflowRun[] }>(
    `/repos/${repoFullName(repo)}/actions/workflows/${encodeURIComponent(workflowFile)}/runs?${q}`,
    `${workflowFile} runs`
  )
  return body?.workflow_runs ?? []
}
