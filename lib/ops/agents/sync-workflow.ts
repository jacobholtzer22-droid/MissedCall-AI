// ===========================================
// /admin/ops agents — bring existing client repos in
// ===========================================
// For every website deliverable with evidence.repoUrl whose repoHasWorkflow is
// false: add .github/workflows/aa-build.yml from AA-Template, append AGENT.md's
// "Non-interactive (CI) mode" section when the repo's AGENT.md lacks it, and set
// the two Actions secrets.
//
//   mode "pr":     commit both on branch ci/aa-build and open a PR
//   mode "direct": commit straight to the default branch
//
// The secrets are set either way. dry lists each repo and what it would get,
// and writes nothing.

import { db } from '@/lib/db'
import {
  GITHUB_OWNER,
  TEMPLATE_REPO,
  createBranchFromDefault,
  getFileContent,
  getRepo,
  openPullRequest,
  putFile,
  repoFullName,
  setRepoSecret,
} from '@/lib/ops/github'
import { mapLimited } from '@/lib/ops/checks/limit'
import { CI_SECTION_HEADING, REPO_SECRETS, TEMPLATE_REF, WORKFLOW_PATH, asObject, mergeEvidence, missingSecretEnv, secretValue } from './shared'

export const CI_BRANCH = 'ci/aa-build'

export type SyncRepoResult = {
  engagement: string
  repo: string
  adds: string[]
  prUrl?: string
  commitSha?: string
  errors: string[]
}

export type SyncWorkflowResult = {
  dry: boolean
  mode: 'pr' | 'direct'
  /** Why nothing ran at all (template files missing, env missing). */
  blocked: string[]
  repos: SyncRepoResult[]
  skipped: { engagement: string; reason: string }[]
}

/** The "Non-interactive (CI) mode" section: its heading line through the next heading of the same or higher level. */
export function extractCiSection(agentMd: string): string | null {
  const lines = agentMd.split('\n')
  const start = lines.findIndex((l) => l.includes(CI_SECTION_HEADING) && (/^#+\s/.test(l) || l.trim() === CI_SECTION_HEADING))
  if (start === -1) return null
  const level = /^#+/.exec(lines[start])?.[0].length ?? 0
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    const h = /^(#+)\s/.exec(lines[i])
    if (h && level > 0 && h[1].length <= level) {
      end = i
      break
    }
  }
  return lines.slice(start, end).join('\n').trimEnd()
}

export async function syncWorkflow(opts: { mode: 'pr' | 'direct'; only?: string[]; dry: boolean }): Promise<SyncWorkflowResult> {
  const out: SyncWorkflowResult = { dry: opts.dry, mode: opts.mode, blocked: [], repos: [], skipped: [] }
  const template = `${GITHUB_OWNER}/${TEMPLATE_REPO}`

  const [workflow, templateAgent] = await Promise.all([
    getFileContent(template, WORKFLOW_PATH, TEMPLATE_REF),
    getFileContent(template, 'AGENT.md', TEMPLATE_REF),
  ])
  const ciSection = templateAgent ? extractCiSection(templateAgent) : null
  if (!workflow) out.blocked.push(`${template} has no ${WORKFLOW_PATH} on ${TEMPLATE_REF}`)
  if (!ciSection) out.blocked.push(`${template} AGENT.md on ${TEMPLATE_REF} has no "${CI_SECTION_HEADING}" section`)
  const missing = missingSecretEnv()
  if (missing.length > 0) out.blocked.push(`env not set: ${missing.join(', ')}`)

  const rows = await db.deliverable.findMany({
    where: { type: 'website', ...(opts.only?.length ? { engagementId: { in: opts.only } } : {}) },
    select: { id: true, evidence: true, engagement: { select: { displayName: true, stage: true } } },
  })
  const targets = rows.filter((d) => {
    const ev = asObject(d.evidence)
    const name = d.engagement.displayName.trim()
    if (d.engagement.stage === 'ignored') return false
    if (typeof ev.repoUrl !== 'string' || !ev.repoUrl) {
      out.skipped.push({ engagement: name, reason: 'no evidence.repoUrl' })
      return false
    }
    if (ev.repoHasWorkflow !== false) {
      out.skipped.push({ engagement: name, reason: ev.repoHasWorkflow === true ? 'already has the workflow' : 'repoHasWorkflow not recorded yet (run web checks)' })
      return false
    }
    return true
  })

  out.repos = await mapLimited(targets, 3, async (d) => {
    const ev = asObject(d.evidence)
    const repo = repoFullName(String(ev.repoUrl))
    const r: SyncRepoResult = { engagement: d.engagement.displayName.trim(), repo, adds: [], errors: [] }
    try {
      const info = await getRepo(repo)
      if (!info) throw new Error('repo not found or not accessible')
      const [hasWorkflow, agentMd] = await Promise.all([
        getFileContent(repo, WORKFLOW_PATH, info.defaultBranch),
        getFileContent(repo, 'AGENT.md', info.defaultBranch),
      ])
      const needsWorkflow = !hasWorkflow
      const needsSection = !agentMd || !agentMd.includes(CI_SECTION_HEADING)
      if (needsWorkflow) r.adds.push(WORKFLOW_PATH)
      if (needsSection) r.adds.push(agentMd ? `AGENT.md: append "${CI_SECTION_HEADING}"` : `AGENT.md: create with "${CI_SECTION_HEADING}"`)
      r.adds.push(...REPO_SECRETS.map((s) => `secret ${s.name}`))
      r.adds.push(opts.mode === 'pr' ? `branch ${CI_BRANCH} + PR into ${info.defaultBranch}` : `commit to ${info.defaultBranch}`)
      if (opts.dry || out.blocked.length > 0) return r

      // Secrets first: they are the step most likely to be refused (the token
      // needs Secrets: read and write), and failing here writes no files and
      // opens no PR.
      for (const s of REPO_SECRETS) await setRepoSecret(repo, s.name, secretValue(s.env))

      const branch = opts.mode === 'pr' ? CI_BRANCH : info.defaultBranch
      if (opts.mode === 'pr' && (needsWorkflow || needsSection)) await createBranchFromDefault(repo, CI_BRANCH)
      let sha: string | null = null
      if (needsWorkflow) sha = (await putFile(repo, WORKFLOW_PATH, workflow!, 'ci: add aa-build workflow', branch)) ?? sha
      if (needsSection) {
        // Append to the default branch's AGENT.md, so a re-run writes the same
        // bytes and putFile skips it.
        const next = agentMd ? `${agentMd.trimEnd()}\n\n${ciSection}\n` : `${ciSection}\n`
        sha = (await putFile(repo, 'AGENT.md', next, `ci: add "${CI_SECTION_HEADING}" to AGENT.md`, branch)) ?? sha
      }
      if (opts.mode === 'pr' && (needsWorkflow || needsSection)) {
        // Also when nothing changed: an earlier run may have pushed the branch
        // and stopped before the PR. openPullRequest reuses an open one.
        const pr = await openPullRequest(
          repo,
          CI_BRANCH,
          info.defaultBranch,
          'ci: aa-build workflow',
          `Adds \`${WORKFLOW_PATH}\` from ${TEMPLATE_REPO}${needsSection ? ` and the "${CI_SECTION_HEADING}" section of AGENT.md` : ''}, so the ops platform can dispatch site_update and go_live runs to this repo. Secrets ANTHROPIC_API_KEY and OPS_CALLBACK_SECRET are set on the repo.`
        )
        r.prUrl = pr.url
      } else if (sha) {
        r.commitSha = sha
      }
      if (opts.mode === 'direct') await mergeEvidence(d.id, { repoHasWorkflow: true })
    } catch (err) {
      r.errors.push(err instanceof Error ? err.message : String(err))
    }
    return r
  })
  return out
}
