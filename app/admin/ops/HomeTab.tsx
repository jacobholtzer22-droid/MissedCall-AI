'use client'

// Home (default tab): what to do right now. Top to bottom: the fleet line,
// approvals waiting for Push, the Sales strip (prospects and demo calls, not
// clients), then on lg two columns: ONE client list in four buckets (Today,
// Get done, Waiting on client, All set and live; lib/ops/triage.ts) on the
// left, the office and the chat on the right. Mobile: approvals, sales,
// office, chat, clients.

import { useEffect, useMemo, useState } from 'react'
import type { BoardEngagement, OpsBoard } from '@/lib/ops/board'
import { headlineMrr } from '@/lib/ops/money'
import type { Triage } from '@/lib/ops/triage'
import { personaFor } from '@/lib/ops/hq/personas'
import { Chat } from './HqChat'
import { Office, RunDrawer, desks } from './HqOffice'
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
}: {
  board: OpsBoard
  actions: OpsActions
  hq: HqFeedState
  triage: Triage
  showRevenue: boolean
}) {
  const [openRun, setOpenRun] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const runs = useMemo(() => hq.feed?.runs ?? [], [hq.feed])
  const working = runs.filter(isActive)

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), working.length ? 1000 : 30000)
    return () => clearInterval(id)
  }, [working.length])

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
      <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
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

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] items-start">
        <div className="min-w-0 space-y-4 lg:col-start-1 lg:row-start-1">
          <ApprovalsStrip approvals={approvals} onDecide={hq.decide} />
          <SalesStrip sales={triage.sales} board={board} actions={actions} />
        </div>

        <div className="min-w-0 space-y-4 lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:sticky lg:top-4">
          {hq.feed ? (
            <Office desks={desks(runs, hq.feed.lastRuns, approvals)} latestByRun={hq.latestByRun} now={now} onOpen={setOpenRun} onStop={hq.stop} />
          ) : (
            <p className="rounded-lg border border-gray-800 bg-gray-900 px-4 py-6 text-sm text-gray-500">Loading the office…</p>
          )}
          <div className="h-[70vh] min-h-[420px] lg:h-[calc(100vh-330px)]">
            <Chat
              messages={hq.messages}
              jobs={hq.feed?.jobs ?? []}
              thinking={runs.some((r) => r.agent === 'chief' && isActive(r))}
              onSend={hq.send}
            />
          </div>
        </div>

        <div className="min-w-0 lg:col-start-1 lg:row-start-2">
          <ClientBuckets triage={triage} board={board} actions={actions} working={workingMap} showRevenue={showRevenue} />
        </div>
      </div>

      {openRun && <RunDrawer runId={openRun} liveEvents={hq.events} runs={runs} onClose={() => setOpenRun(null)} onStop={hq.stop} />}
    </div>
  )
}
