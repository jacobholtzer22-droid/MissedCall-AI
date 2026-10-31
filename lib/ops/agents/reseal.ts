// ===========================================
// /admin/ops agents: reseal one repo's Actions secrets
// ===========================================
// Sets ANTHROPIC_API_KEY and OPS_CALLBACK_SECRET (from ANTHROPIC_API_KEY_BUILDS
// and OPS_CALLBACK_SECRET), plus PEXELS_API_KEY / PIXABAY_API_KEY when the
// platform has them, on the website deliverable's repo. The fix when a repo's
// callbacks 401: its OPS_CALLBACK_SECRET was sealed from somewhere else.
//
// Refuses (nothing written) off the production deployment, when a required env
// var is missing, when GITHUB_OPS_TOKEN is missing, and when the deliverable is
// not a website with evidence.repoUrl. Writes one OpsActivity either way once
// it has tried.

import { db } from '@/lib/db'
import { repoFullName, setRepoSecret } from '@/lib/ops/github'
import { asObject, missingSecretEnv, productionOnlyBlock, repoSecretsToSet, secretValue } from './shared'

export type ResealResult = {
  ok: boolean
  repo: string | null
  /** Why nothing was written; non-empty means no secret was touched. */
  blocked: string[]
  /** Secret names set, in order. */
  set: string[]
  /** The secret that failed and why, when one did. */
  error?: string
}

type Env = Record<string, string | undefined>

/** What a reseal would do for this deliverable, or why it cannot. Pure. */
export function resealPlan(
  d: { type: string; evidence: unknown } | null,
  env: Env = process.env
): { repo: string | null; blocked: string[]; secrets: string[] } {
  if (!d) return { repo: null, blocked: ['deliverable not found'], secrets: [] }
  const blocked: string[] = []
  const notProd = productionOnlyBlock(env)
  if (notProd) blocked.push(notProd)
  if (d.type !== 'website') blocked.push('only a website deliverable has a repo')
  const repoUrl = asObject(d.evidence as never).repoUrl
  const repo = typeof repoUrl === 'string' && repoUrl ? repoFullName(repoUrl) : null
  if (d.type === 'website' && !repo) blocked.push('no evidence.repoUrl on the website deliverable')
  const missing = missingSecretEnv(env)
  if (missing.length > 0) blocked.push(`env not set: ${missing.join(', ')}`)
  if (!env.GITHUB_OPS_TOKEN?.trim()) blocked.push('env not set: GITHUB_OPS_TOKEN')
  return { repo, blocked, secrets: repoSecretsToSet(env).map((s) => s.name) }
}

export async function resealSecrets(deliverableId: string): Promise<ResealResult> {
  const d = await db.deliverable.findUnique({ where: { id: deliverableId }, select: { type: true, evidence: true, engagementId: true } })
  const plan = resealPlan(d)
  const out: ResealResult = { ok: false, repo: plan.repo, blocked: plan.blocked, set: [] }
  if (!d || plan.blocked.length > 0) return out

  for (const s of repoSecretsToSet()) {
    try {
      await setRepoSecret(plan.repo!, s.name, secretValue(s.env))
      out.set.push(s.name)
    } catch (err) {
      out.error = `${s.name}: ${err instanceof Error ? err.message : String(err)}`
      break
    }
  }
  out.ok = !out.error
  await db.opsActivity.create({
    data: {
      engagementId: d.engagementId,
      kind: 'system',
      body: out.ok
        ? `Resealed secrets on ${plan.repo}: ${out.set.join(', ')}`
        : `Reseal secrets on ${plan.repo} failed at ${out.error}${out.set.length ? ` (set before it: ${out.set.join(', ')})` : ''}`,
    },
  })
  return out
}
