// The facts lib/ops/preflight.ts checks, read from the board. Only called by the
// chief's start_web_task / start_ads_task with OPS_AUTOFLOW on.

import { db } from '@/lib/db'
import { readIntake } from '@/lib/ops/intake'
import { isNeverTouch } from '@/lib/ops/hq/ads-tools'
import { adsPreflight, formatPreflight, webPreflight } from '@/lib/ops/preflight'

async function load(engagementId: string) {
  return db.engagement.findUnique({
    where: { id: engagementId },
    select: {
      displayName: true,
      brief: true,
      intake: true,
      business: { select: { slug: true, ownerPhone: true } },
      deliverables: { where: { type: 'website' }, select: { evidence: true } },
    },
  })
}

/** The grouped refusal for a site_build or site_update, or null to go ahead. */
export async function webPreflightFor(
  engagementId: string,
  kind: 'site_build' | 'site_update',
  opts: { withStock?: boolean; instructions?: string }
): Promise<string | null> {
  const e = await load(engagementId)
  if (!e) return null // the task itself reports an unknown client
  const intake = readIntake(e.intake)
  const ev = (e.deliverables[0]?.evidence ?? {}) as Record<string, unknown>
  const items = webPreflight({
    kind,
    engagementId,
    hasBrief: Boolean(e.brief?.trim()),
    photos: (intake.assets ?? []).filter((a) => a.kind === 'photo').length,
    oldSiteVerbatim: intake.oldSite?.use === 'verbatim',
    withStock: Boolean(opts.withStock),
    hasInstructions: Boolean(opts.instructions?.trim()),
    businessLinked: Boolean(e.business?.slug),
    hasRepo: typeof ev.repoUrl === 'string' && ev.repoUrl.length > 0,
    repoHasWorkflow: typeof ev.repoHasWorkflow === 'boolean' ? ev.repoHasWorkflow : null,
  })
  return formatPreflight(kind === 'site_build' ? 'site build' : 'site update', e.displayName.trim(), items)
}

/** The grouped refusal for an ads run, or null to go ahead. */
export async function adsPreflightFor(engagementId: string, instructions: string): Promise<string | null> {
  const e = await load(engagementId)
  if (!e) return null
  const intake = readIntake(e.intake)
  const items = adsPreflight({
    neverTouch: isNeverTouch(e.displayName.trim()),
    instructions,
    ownerPhone: e.business?.ownerPhone ?? null,
    intakePhone: intake.business?.phone ?? null,
  })
  return formatPreflight('ads run', e.displayName.trim(), items)
}
