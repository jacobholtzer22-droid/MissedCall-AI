// ===========================================
// /admin/ops: a client's state in words
// ===========================================
// Pure and client-safe. Shared by the client card and the chief so both phrase
// a client the same way.
//   derivedStatusLine: the fallback status line when no 'status' activity
//     exists: the deliverable with the oldest open step, as "Website: Review
//     the agent's PR and preview".
//   waitingLine: what is waiting and on whom, one line.
//   adsState: Running, Built paused, Account needed, or the ads step's label.

import { DELIVERABLE_NAMES } from './needs-you'

type Deliverable = {
  type: string
  step: string | null
  stepLabel: string | null
  stepTerminal: boolean
  waitingOn: string | null
  waitingNote: string | null
  stepUpdatedAt: string | null
  evidence?: Record<string, unknown>
}

type Client = {
  stage: string
  services: string[]
  deliverables: Deliverable[]
  business?: { googleAdsCustomerId: string | null } | null
}

const WHO: Record<string, string> = { jacob: 'you', client: 'client', vendor: 'vendor' }

/** Open steps (set, not terminal), oldest first. */
function openSteps(e: Client): Deliverable[] {
  return e.deliverables
    .filter((d) => d.step && !d.stepTerminal)
    .sort((a, b) => (a.stepUpdatedAt ?? '').localeCompare(b.stepUpdatedAt ?? ''))
}

export function derivedStatusLine(e: Client): string {
  const open = openSteps(e)[0]
  if (open) return `${DELIVERABLE_NAMES[open.type] ?? open.type}: ${open.stepLabel ?? open.step}`
  const done = e.deliverables.filter((d) => d.stepTerminal)
  if (done.length > 0) return `${done.map((d) => `${DELIVERABLE_NAMES[d.type] ?? d.type}: ${d.stepLabel ?? d.step}`).join('; ')}; nothing open`
  if (e.stage === 'prospect') return 'Prospect, nothing bought yet'
  return 'No steps set yet'
}

/**
 * The oldest step waiting on the client or a vendor, else the oldest waiting on
 * Jacob. null when there is none, or when it would only repeat the derived
 * status line (same step, no note).
 */
export function waitingLine(e: Client & { statusLine?: string | null }): string | null {
  const open = openSteps(e)
  const waiting = open.filter((d) => d.waitingOn && WHO[d.waitingOn])
  const d = waiting.find((x) => x.waitingOn !== 'jacob') ?? waiting[0]
  if (!d) return null
  if (!e.statusLine && d === open[0] && !d.waitingNote) return null
  return `Waiting on ${WHO[d.waitingOn!]}: ${d.waitingNote || d.stepLabel || d.step}`
}

export function adsState(e: Client): string | null {
  if (!e.services.includes('ads')) return null
  const d = e.deliverables.find((x) => x.type === 'ads')
  const budget = Number(d?.evidence?.dailyBudget)
  if (d?.step === 'running') return Number.isFinite(budget) && budget > 0 ? `Running $${budget}/day` : 'Running'
  if (d?.step === 'paused_by_client') return 'Paused by the client'
  if (d?.step === 'enable' || d?.step === 'site_live') return 'Built paused'
  const account = e.business?.googleAdsCustomerId || (typeof d?.evidence?.adsCustomerId === 'string' && d.evidence.adsCustomerId)
  if (!account || d?.step === 'account') return 'Account needed'
  return d?.stepLabel ?? 'Not started'
}
