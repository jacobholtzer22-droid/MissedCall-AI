'use client'

// Home: clients and what to do. Top to bottom: one line linking to HQ when
// approvals wait for Push, the fleet line, Needs you (approvals waiting for
// Push and the Sales strip: prospects and demo calls, not clients), then ONE
// client list in four buckets (Today, Get done, Waiting on client, All set and
// live; lib/ops/triage.ts). The office and the chief chat live on HQ
// (HqTab.tsx). Each top-level block carries data-ops-panel so the split-screen
// check can assert none of them overlap.

import type { BoardEngagement, OpsBoard } from '@/lib/ops/board'
import { headlineMrr } from '@/lib/ops/money'
import type { Triage } from '@/lib/ops/triage'
import { personaFor } from '@/lib/ops/hq/personas'
import { ApprovalsStrip, ClientBuckets, SalesStrip } from './HomeTriage'
import { HQ_CSS, isActive } from './hqShared'
import { money, type OpsActions } from './opsUi'
import type { HqFeedState } from './useHqFeed'

const HEALTH_ORDER: Record<string, number> = { red: 0, yellow: 1, green: 2, gray: 3 }

/** Health first, then the most recent activity. */
export function byHealthThenActivity(a: BoardEngagement, b: BoardEngagement): number {
  return (
    (HEALTH_ORDER[a.health] ?? 9) - (HEALTH_ORDER[b.health] ?? 9) ||
    (b.lastActivityAt ?? '').localeCompare(a.lastActivityAt ?? '') ||
    a.displayName.localeCompare(b.displayName)
  )
}

/** engagementId → name of the HQ agent running for it now. */
export function workingByClient(hq: HqFeedState): Map<string, string> {
  const map = new Map<string, string>()
  for (const r of hq.feed?.runs ?? []) {
    if (r.engagementId && isActive(r)) map.set(r.engagementId, personaFor(r.agent ?? 'web')?.name ?? 'An agent')
  }
  return map
}

export function HomeTab({
  board,
  actions,
  hq,
  triage,
  showRevenue,
  onOpenHq,
}: {
  board: OpsBoard
  actions: OpsActions
  hq: HqFeedState
  triage: Triage
  showRevenue: boolean
  onOpenHq: () => void
}) {
  const working = (hq.feed?.runs ?? []).filter(isActive)

  const approvals = hq.feed?.approvals ?? []
  const workingMap = workingByClient(hq)
  const mrr = headlineMrr(board.money)
  const red = board.engagements.filter((e) => e.alerts.some((a) => a.severity === 'red')).length
  const pending = approvals.filter((a) => a.status === 'pending').length

  const fleet: { label: string; value: string; tone?: string }[] = [
    { label: 'active clients', value: String(board.money.countsByStage.active ?? 0) },
    ...(showRevenue
      ? [
          { label: 'verified MRR', value: money(mrr.verified, '$0') },
          { label: 'projected MRR', value: money(mrr.projected, '$0') },
        ]
      : []),
    { label: working.length === 1 ? 'agent working' : 'agents working', value: String(working.length), tone: working.length ? 'text-emerald-300' : undefined },
    { label: 'waiting for Push', value: String(pending), tone: pending ? 'text-amber-300' : undefined },
    { label: red === 1 ? 'client with red alerts' : 'clients with red alerts', value: String(red), tone: red ? 'text-red-400' : undefined },
  ]

  return (
    <div className="space-y-4">
      <style>{HQ_CSS}</style>
      {pending > 0 && (
        <a
          href="/admin/ops?tab=hq"
          onClick={(e) => {
            e.preventDefault()
            onOpenHq()
          }}
          data-ops-panel="hq-link"
          className="flex items-center min-h-[44px] text-sm font-medium text-amber-300 hover:text-amber-200 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          {pending} waiting for Push →
        </a>
      )}
      <dl data-ops-panel="fleet" className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {fleet.map((f) => (
          <div key={f.label} className="flex items-baseline gap-1.5">
            <dt className="sr-only">{f.label}</dt>
            <dd className={`text-lg font-semibold tabular-nums ${f.tone ?? 'text-gray-100'}`}>{f.value}</dd>
            <span aria-hidden className="text-gray-500">
              {f.label}
            </span>
          </div>
        ))}
      </dl>
      {hq.loadError && <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{hq.loadError}</p>}

      <div data-ops-panel="needs" className="min-w-0 space-y-4">
        <ApprovalsStrip approvals={approvals} onDecide={hq.decide} />
        <SalesStrip sales={triage.sales} board={board} actions={actions} />
      </div>

      <div data-ops-panel="clients" className="min-w-0">
        <ClientBuckets triage={triage} board={board} actions={actions} working={workingMap} showRevenue={showRevenue} />
      </div>
    </div>
  )
}
