// ===========================================
// /admin/ops agents — provision a client site
// ===========================================
// One private repo from AA-Template, its Actions secrets (the two required
// ones, plus PEXELS_API_KEY when the platform has it), a Vercel project
// linked to it (static export: npm run build → out), the website evidence,
// step build, and an activity. Steps run in that order and stop at the first
// failure, reporting what was done so far. A repo that already exists under
// the name is never reused: the run stops and says so.
//
// dry returns the same plan with nothing written anywhere.

import { db } from '@/lib/db'
import { GITHUB_OWNER, TEMPLATE_REPO, createRepoFromTemplate, repoExists, setRepoSecret } from '@/lib/ops/github'
import { SITE_PROJECT_SETTINGS, createProjectLinkedToRepo, vercelProjectName } from '@/lib/ops/vercel'
import { defaultWaitingOn } from '@/lib/ops/steps'
import { defaultRepoName, repoSecretsToSet, loadWebsiteEngagement, mergeEvidence, missingSecretEnv, secretValue, type PlanStep } from './shared'

export type ProvisionResult = {
  ok: boolean
  dry: boolean
  engagement: string
  repoName: string
  /** Preconditions that block provisioning; non-empty means nothing ran. */
  blocked: string[]
  steps: PlanStep[]
}

const REPO_NAME = /^[A-Za-z0-9._-]{1,100}$/

export async function provisionSite(engagementId: string, opts: { repoName?: string; dry: boolean }): Promise<ProvisionResult> {
  const eng = await loadWebsiteEngagement(engagementId)
  if (!eng) return { ok: false, dry: opts.dry, engagement: engagementId, repoName: '', blocked: ['engagement not found'], steps: [] }

  const repoName = opts.repoName?.trim() || defaultRepoName(eng.displayName)
  const fullName = `${GITHUB_OWNER}/${repoName}`
  const projectName = vercelProjectName(repoName)
  const out: ProvisionResult = { ok: false, dry: opts.dry, engagement: eng.displayName, repoName, blocked: [], steps: [] }

  if (!eng.hasWebsiteService) out.blocked.push('no website service')
  if (!eng.website) out.blocked.push('no website deliverable')
  if (!eng.businessId) out.blocked.push('no platform account (businessId) linked, so there is no businessSlug')
  if (eng.website?.evidence.repoUrl) out.blocked.push(`already has a repo: ${eng.website.evidence.repoUrl}`)
  if (!REPO_NAME.test(repoName)) out.blocked.push(`"${repoName}" is not a valid repo name`)
  const missing = missingSecretEnv()
  if (missing.length > 0) out.blocked.push(`env not set: ${missing.join(', ')}`)
  if (out.blocked.length === 0 && (await repoExists(fullName))) out.blocked.push(`${fullName} already exists; not reusing it`)

  const secrets = repoSecretsToSet()
  out.steps = [
    { action: 'create repo', detail: `private ${fullName} from ${GITHUB_OWNER}/${TEMPLATE_REPO} (default branch only)` },
    ...secrets.map((s) => ({ action: 'set secret', detail: `${s.name} on ${fullName} (value from ${s.env})` })),
    {
      action: 'create Vercel project',
      detail: `${projectName} linked to ${fullName}; framework null, build "${SITE_PROJECT_SETTINGS.buildCommand}", output "${SITE_PROJECT_SETTINGS.outputDirectory}"`,
    },
    {
      action: 'write evidence',
      detail: `website: repoUrl https://github.com/${fullName}, repoDefaultBranch, vercelProjectId, vercelProjectName ${projectName}, vercelGitLinked true, productionUrl https://${projectName}.vercel.app`,
    },
    { action: 'set step', detail: 'website step → build (waiting on Jacob)' },
    { action: 'log activity', detail: 'system: what was created' },
  ]
  if (out.blocked.length > 0 || opts.dry) {
    out.ok = out.blocked.length === 0
    return out
  }

  // ── Live ──────────────────────────────────────────────────────────────────
  const created: string[] = []
  const run = async (i: number, fn: () => Promise<string>) => {
    try {
      out.steps[i].result = await fn()
      return true
    } catch (err) {
      out.steps[i].error = err instanceof Error ? err.message : String(err)
      return false
    }
  }
  let repoUrl = ''
  let defaultBranch = 'main'
  if (!(await run(0, async () => {
    const r = await createRepoFromTemplate(GITHUB_OWNER, TEMPLATE_REPO, repoName, true)
    repoUrl = r.url
    defaultBranch = r.defaultBranch
    created.push(`repo ${r.fullName}`)
    return r.url
  }))) return out
  for (let k = 0; k < secrets.length; k++) {
    const s = secrets[k]
    if (!(await run(1 + k, async () => {
      await setRepoSecret(fullName, s.name, secretValue(s.env))
      created.push(`secret ${s.name}`)
      return 'set'
    }))) return out
  }
  const vi = 1 + secrets.length
  let project: { id: string; name: string; productionUrl: string } | null = null
  if (!(await run(vi, async () => {
    project = await createProjectLinkedToRepo(projectName, fullName)
    created.push(`Vercel project ${project.name}`)
    return project.id
  }))) return out
  const p = project as unknown as { id: string; name: string; productionUrl: string }
  await run(vi + 1, async () => {
    await mergeEvidence(eng.website!.id, {
      repoUrl,
      repoDefaultBranch: defaultBranch,
      vercelProjectId: p.id,
      vercelProjectName: p.name,
      vercelGitLinked: true,
      productionUrl: p.productionUrl,
    })
    return 'merged'
  })
  await run(vi + 2, async () => {
    await db.deliverable.update({
      where: { id: eng.website!.id },
      data: { step: 'build', waitingOn: defaultWaitingOn('website', 'build'), stepUpdatedAt: new Date() },
    })
    return 'build'
  })
  await run(vi + 3, async () => {
    await db.opsActivity.create({
      data: { engagementId: eng.id, kind: 'system', body: `Provisioned site: ${created.join(', ')}. ${repoUrl}` },
    })
    return 'logged'
  })
  out.ok = out.steps.every((s) => !s.error)
  return out
}
