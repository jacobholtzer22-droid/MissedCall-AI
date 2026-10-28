// ===========================================
// /admin/ops agents — shared pieces
// ===========================================
// The web designer agent is the aa-build.yml workflow in each client repo
// (from AA-Template). The platform provisions repos, dispatches runs to the
// workflow, and records the signed callback. Everything here reads env by
// name only; no secret value is ever logged or returned.

import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'

/** Where every workflow posts its result. Production only: GitHub cannot reach a dev server. */
export const CALLBACK_URL = 'https://www.alignandacquire.com/api/ops/build-callback'
export const DISPATCH_EVENT = 'aa-build'
export const WORKFLOW_PATH = '.github/workflows/aa-build.yml'
export const CI_SECTION_HEADING = 'Non-interactive (CI) mode'
/** The ref the workflow and the AGENT.md CI section are copied from. */
export const TEMPLATE_REF = 'main'

export { RUN_KINDS, defaultRepoName, type RunKind } from './names'

/** The two repo secrets every client repo needs, mapped to the platform env vars that hold them. */
export const REPO_SECRETS = [
  { name: 'ANTHROPIC_API_KEY', env: 'ANTHROPIC_API_KEY_BUILDS' },
  { name: 'OPS_CALLBACK_SECRET', env: 'OPS_CALLBACK_SECRET' },
] as const

/**
 * Secrets set on a client repo only when the platform has them: the stock
 * photo keys a "with stock" build uses (Pexels first, Pixabay when Pexels is
 * absent; AA-Template's stock step picks). Whichever exist are copied; with
 * neither the build runs without images, so their absence never blocks.
 */
export const OPTIONAL_REPO_SECRETS = [
  { name: 'PEXELS_API_KEY', env: 'PEXELS_API_KEY' },
  { name: 'PIXABAY_API_KEY', env: 'PIXABAY_API_KEY' },
] as const

/** The required secrets plus every optional one whose env var is set. */
export function repoSecretsToSet(): { name: string; env: string }[] {
  return [...REPO_SECRETS, ...OPTIONAL_REPO_SECRETS.filter((s) => process.env[s.env]?.trim())]
}

/** Names of the env vars a secret-setting action needs that are missing or empty. */
export function missingSecretEnv(): string[] {
  return REPO_SECRETS.filter((s) => !process.env[s.env]?.trim()).map((s) => s.env)
}

export function secretValue(env: string): string {
  const v = process.env[env]?.trim()
  if (!v) throw new Error(`${env} is not set`)
  return v
}

export const asObject = (v: Prisma.JsonValue | null | undefined): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? { ...(v as Record<string, unknown>) } : {}

/** The engagement with its website deliverable and Business slug, or null. */
export async function loadWebsiteEngagement(engagementId: string) {
  const e = await db.engagement.findUnique({
    where: { id: engagementId },
    select: {
      id: true,
      displayName: true,
      services: true,
      businessId: true,
      business: { select: { slug: true } },
      deliverables: { where: { type: 'website' }, select: { id: true, step: true, evidence: true } },
    },
  })
  if (!e) return null
  const website = e.deliverables[0] ?? null
  return {
    id: e.id,
    displayName: e.displayName.trim(),
    hasWebsiteService: Array.isArray(e.services) && (e.services as string[]).includes('website'),
    businessId: e.businessId,
    businessSlug: e.business?.slug ?? null,
    website: website ? { id: website.id, step: website.step, evidence: asObject(website.evidence) } : null,
  }
}

/** Merge keys into a deliverable's evidence; never removes a key. */
export async function mergeEvidence(deliverableId: string, patch: Record<string, unknown>) {
  const row = await db.deliverable.findUniqueOrThrow({ where: { id: deliverableId }, select: { evidence: true } })
  const merged = { ...asObject(row.evidence), ...patch }
  await db.deliverable.update({ where: { id: deliverableId }, data: { evidence: merged as Prisma.InputJsonObject } })
  return merged
}

/** A plan step: what a write would do, and (after a live run) what happened. */
export type PlanStep = { action: string; detail: string; result?: string; error?: string }
