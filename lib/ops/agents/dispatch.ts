// ===========================================
// /admin/ops agents — dispatch a run
// ===========================================
// Creates the AgentRun (queued), sends repository_dispatch aa-build to the
// client repo, and on 204 marks it dispatched. The workflow (aa-build.yml)
// builds, opens a PR and calls back to /api/ops/build-callback.
//
// client_payload, exactly what aa-build.yml reads:
//   { kind, run_id, brief (base64), instructions (base64), business_slug, callback_url,
//     assets (base64 JSON list), old_site (base64 JSON), with_stock }
// assets and old_site come from the client's intake (lib/ops/intake.ts). GitHub
// caps repository_dispatch (10 top-level keys, about 64 KB): when brief plus
// assets would not fit, assets is sent empty and the run's input says the list
// is in the brief only (its ## Assets section).
// business_slug is required by the workflow (it fails without one), so a run
// needs a linked Business.
//
// Every run is an Ops HQ web run (agent 'web', mode work), under jobId when the
// chief started it, with feed events, so the Web desk shows it working and the
// job report waits for its callback.
//
// dry returns the payload it would send, with brief/instructions shown as
// byte counts, and writes nothing.

import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { repoFullName, repositoryDispatch } from '@/lib/ops/github'
import { emit } from '@/lib/ops/hq/events'
import { CALLBACK_URL, DISPATCH_EVENT, RUN_KINDS, loadWebsiteEngagement, type RunKind } from './shared'

export type DispatchResult = {
  /** The brief plus assets were too large: assets went in the brief only. */
  assetsInBriefOnly?: boolean
  ok: boolean
  dry: boolean
  blocked: string[]
  repo: string | null
  runId: string | null
  status: string | null
  payload: Record<string, unknown> | null
  error?: string
}

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64')

export async function dispatchRun(
  engagementId: string,
  input: {
    kind: RunKind
    brief?: string
    instructions?: string
    dry: boolean
    jobId?: string | null
    assets?: { url: string; kind: string; filename: string; caption: string | null; heroCandidate: boolean; service: string | null; beforeAfter: string | null }[]
    oldSite?: { url: string; use: string; notes: string | null } | null
    withStock?: boolean
    /** A tracking install (site_update): the block it writes, kept on the run so the callback can set trackingInstalled. */
    tracking?: Record<string, unknown>
  }
): Promise<DispatchResult> {
  const out: DispatchResult = { ok: false, dry: input.dry, blocked: [], repo: null, runId: null, status: null, payload: null }
  const eng = await loadWebsiteEngagement(engagementId)
  if (!eng) return { ...out, blocked: ['engagement not found'] }

  const brief = input.brief?.trim() ?? ''
  const instructions = input.instructions?.trim() ?? ''
  if (!RUN_KINDS.includes(input.kind)) out.blocked.push(`kind must be ${RUN_KINDS.join(', ')}`)
  if (input.kind === 'site_build' && !brief) out.blocked.push('site_build needs a brief')
  if (input.kind === 'site_update' && !instructions) out.blocked.push('site_update needs instructions')
  const repoUrl = typeof eng.website?.evidence.repoUrl === 'string' ? eng.website.evidence.repoUrl : null
  if (!repoUrl) out.blocked.push('no evidence.repoUrl on the website deliverable')
  if (!eng.businessSlug) out.blocked.push('no platform account linked: the workflow requires business_slug')
  if (!process.env.GITHUB_OPS_TOKEN?.trim()) out.blocked.push('GITHUB_OPS_TOKEN is not set')
  out.repo = repoUrl ? repoFullName(repoUrl) : null
  if (out.blocked.length > 0) return out

  const withFiles = input.kind === 'site_build' || input.kind === 'site_update'
  const assets = withFiles ? input.assets ?? [] : []
  const oldSite = withFiles ? input.oldSite ?? null : null
  const payloadFor = (runId: string, includeAssets = true) => ({
    kind: input.kind,
    run_id: runId,
    brief: input.kind === 'site_build' ? b64(brief) : '',
    instructions: input.kind === 'site_update' ? b64(instructions) : '',
    business_slug: eng.businessSlug!,
    callback_url: CALLBACK_URL,
    assets: includeAssets && assets.length ? b64(JSON.stringify(assets)) : '',
    old_site: oldSite ? b64(JSON.stringify(oldSite)) : '',
    with_stock: input.withStock ? 'true' : '',
  })
  const PAYLOAD_LIMIT = 60_000
  const fits = JSON.stringify(payloadFor('x'.repeat(25))).length <= PAYLOAD_LIMIT
  out.assetsInBriefOnly = !fits && assets.length > 0
  if (!fits && JSON.stringify(payloadFor('x'.repeat(25), false)).length > PAYLOAD_LIMIT) out.blocked.push('the brief is too large for a dispatch')
  if (out.blocked.length > 0) return out

  if (input.dry) {
    const p = payloadFor('(new run id)', fits)
    out.payload = {
      ...p,
      brief: p.brief ? `(base64, ${brief.length} chars of brief)` : '',
      instructions: p.instructions ? `(base64, ${instructions.length} chars of instructions)` : '',
      assets: p.assets ? `(base64 JSON, ${assets.length} files)` : '',
      old_site: p.old_site ? `(base64 JSON: ${oldSite?.url} ${oldSite?.use})` : '',
    }
    out.ok = true
    return out
  }

  const run = await db.agentRun.create({
    data: {
      agent: 'web',
      mode: 'work',
      jobId: input.jobId ?? null,
      engagementId: eng.id,
      deliverableId: eng.website!.id,
      kind: input.kind,
      status: 'queued',
      input: {
        kind: input.kind,
        repo: out.repo,
        ...(brief && input.kind === 'site_build' ? { brief } : {}),
        ...(instructions && input.kind === 'site_update' ? { instructions } : {}),
        ...(withFiles ? { assetCount: assets.length, photoCount: assets.filter((a) => a.kind === 'photo').length, assets, oldSite, withStock: Boolean(input.withStock) } : {}),
        ...(out.assetsInBriefOnly ? { assetsInBriefOnly: true } : {}),
        ...(input.tracking ? { tracking: input.tracking } : {}),
      } as Prisma.InputJsonObject,
    },
  })
  out.runId = run.id
  out.payload = {
    ...payloadFor(run.id, fits),
    brief: input.kind === 'site_build' ? '(base64 brief)' : '',
    instructions: input.kind === 'site_update' ? '(base64 instructions)' : '',
    assets: fits && assets.length ? `(base64 JSON, ${assets.length} files)` : '',
    old_site: oldSite ? '(base64 JSON)' : '',
  }

  try {
    const status = await repositoryDispatch(out.repo!, DISPATCH_EVENT, payloadFor(run.id, fits))
    if (status !== 204) throw new Error(`GitHub answered HTTP ${status}, expected 204`)
    await db.$transaction([
      db.agentRun.update({ where: { id: run.id }, data: { status: 'dispatched', startedAt: new Date() } }),
      db.opsActivity.create({
        data: { engagementId: eng.id, kind: 'system', body: `Agent ${input.kind} dispatched to ${out.repo} (run ${run.id})` },
      }),
    ])
    await emit(run.id, 'status', `Dispatched ${input.kind} to ${out.repo}. The workflow builds, opens a PR and reports back; this takes a few minutes.`)
    out.status = 'dispatched'
    out.ok = true
  } catch (err) {
    out.error = err instanceof Error ? err.message : String(err)
    await db.$transaction([
      db.agentRun.update({ where: { id: run.id }, data: { status: 'failed', error: out.error, finishedAt: new Date() } }),
      db.opsActivity.create({
        data: { engagementId: eng.id, kind: 'system', body: `Agent ${input.kind} dispatch to ${out.repo} failed: ${out.error}` },
      }),
    ])
    await emit(run.id, 'error', `Dispatch failed: ${out.error}`)
    out.status = 'failed'
  }
  return out
}
