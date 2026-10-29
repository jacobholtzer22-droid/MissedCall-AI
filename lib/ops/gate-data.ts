// ===========================================
// /admin/ops: what the launch gates read, from the board
// ===========================================
// One query for the GateClient shape lib/ops/launch-gate.ts judges: the
// website, domain and ads deliverables, the platform account's owner contact,
// and the client's decisions and activity bodies (billing_confirmed).

import { db } from '@/lib/db'
import type { GateClient } from '@/lib/ops/launch-gate'

const asObj = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})

export async function loadGateClients(engagementIds: string[]): Promise<Map<string, GateClient>> {
  const ids = Array.from(new Set(engagementIds.filter(Boolean)))
  if (!ids.length) return new Map()
  const [rows, notes] = await Promise.all([
    db.engagement.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        services: true,
        business: { select: { ownerEmail: true, ownerPhone: true } },
        deliverables: {
          where: { type: { in: ['website', 'domain', 'ads'] } },
          select: { type: true, step: true, manualStatus: true, computedStatus: true, evidence: true },
        },
      },
    }),
    db.opsActivity.findMany({
      where: { engagementId: { in: ids }, body: { contains: 'billing', mode: 'insensitive' } },
      select: { engagementId: true, body: true },
    }),
  ])
  const out = new Map<string, GateClient>()
  for (const r of rows) {
    const d = (type: string) => r.deliverables.find((x) => x.type === type) ?? null
    const w = d('website')
    const dom = d('domain')
    const ads = d('ads')
    out.set(r.id, {
      services: Array.isArray(r.services) ? (r.services as string[]) : [],
      website: w ? { step: w.step, evidence: asObj(w.evidence) } : null,
      domain: dom ? { step: dom.step, manualStatus: dom.manualStatus, computedStatus: dom.computedStatus, evidence: asObj(dom.evidence) } : null,
      ads: ads ? { step: ads.step, evidence: asObj(ads.evidence) } : null,
      owner: r.business ? { email: r.business.ownerEmail, phone: r.business.ownerPhone } : null,
      notes: notes.filter((n) => n.engagementId === r.id).map((n) => n.body),
    })
  }
  return out
}

export async function loadGateClient(engagementId: string): Promise<GateClient> {
  const c = (await loadGateClients([engagementId])).get(engagementId)
  if (!c) throw new Error(`no client with id ${engagementId}`)
  return c
}
