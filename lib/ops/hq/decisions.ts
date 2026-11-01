// ===========================================
// Ops HQ — Jacob's standing decisions
// ===========================================
// A decision is an OpsActivity, kind system, body "DECISION: …", written by the
// chief's record_decision. Every decision for the clients in scope is handed
// to specialists, and the playbooks say never to act against one.

import { db } from '@/lib/db'
import { autoflowEnabled } from '@/lib/ops/autoflow'
import { activeDecisions, SUPERSEDED_PREFIX } from '@/lib/ops/outside-hq'

export const DECISION_PREFIX = 'DECISION:'

/** Decision text per engagement, oldest first. No ids: every engagement. */
export async function decisionsByEngagement(ids?: string[]): Promise<Map<string, string[]>> {
  if (autoflowEnabled()) return standingDecisions(ids)
  const rows = await db.opsActivity.findMany({
    where: { body: { startsWith: DECISION_PREFIX }, ...(ids ? { engagementId: { in: ids } } : {}) },
    orderBy: { createdAt: 'asc' },
    select: { engagementId: true, body: true },
  })
  const out = new Map<string, string[]>()
  for (const r of rows) out.set(r.engagementId, [...(out.get(r.engagementId) ?? []), r.body.slice(DECISION_PREFIX.length).trim()])
  return out
}

/** OPS_AUTOFLOW: the decision rows (with ids) still standing, oldest first. A superseded one stays in the history. */
export async function standingDecisionRows(ids?: string[]) {
  const where = ids ? { engagementId: { in: ids } } : {}
  const [rows, markers] = await Promise.all([
    db.opsActivity.findMany({ where: { body: { startsWith: DECISION_PREFIX }, ...where }, orderBy: { createdAt: 'asc' }, select: { id: true, engagementId: true, body: true } }),
    db.opsActivity.findMany({ where: { body: { startsWith: SUPERSEDED_PREFIX }, ...where }, select: { body: true } }),
  ])
  return activeDecisions(rows, markers.map((m) => m.body))
}

async function standingDecisions(ids?: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>()
  for (const r of await standingDecisionRows(ids)) out.set(r.engagementId, [...(out.get(r.engagementId) ?? []), r.body.slice(DECISION_PREFIX.length).trim()])
  return out
}
