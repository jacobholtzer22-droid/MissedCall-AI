// ===========================================
// Ops HQ — Jacob's standing decisions
// ===========================================
// A decision is an OpsActivity, kind system, body "DECISION: …", written by the
// chief's record_decision. Every decision for the clients in scope is handed
// to specialists, and the playbooks say never to act against one.

import { db } from '@/lib/db'

export const DECISION_PREFIX = 'DECISION:'

/** Decision text per engagement, oldest first. No ids: every engagement. */
export async function decisionsByEngagement(ids?: string[]): Promise<Map<string, string[]>> {
  const rows = await db.opsActivity.findMany({
    where: { body: { startsWith: DECISION_PREFIX }, ...(ids ? { engagementId: { in: ids } } : {}) },
    orderBy: { createdAt: 'asc' },
    select: { engagementId: true, body: true },
  })
  const out = new Map<string, string[]>()
  for (const r of rows) out.set(r.engagementId, [...(out.get(r.engagementId) ?? []), r.body.slice(DECISION_PREFIX.length).trim()])
  return out
}
