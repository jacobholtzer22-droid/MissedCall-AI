'use client'

// Home (default tab): what to do right now. A fleet line, then three columns
// on xl: Needs you (one ranked list), the office and the chat with the chief,
// and the clients as cards. lg: Needs you beside the office and chat, clients
// below. Mobile: Needs you, office, chat, clients.

import { useEffect, useMemo, useState } from 'react'
import type { BoardEngagement, OpsBoard } from '@/lib/ops/board'
import { headlineMrr } from '@/lib/ops/money'
import type { rankNeedsYou } from '@/lib/ops/needs-you'
import { personaFor } from '@/lib/ops/hq/personas'
import { ClientCard } from './ClientCard'
import { Chat } from './HqChat'
import { Office, RunDrawer, desks } from './HqOffice'
import { NeedsYou } from './NeedsYou'
import { HQ_CSS, isActive } from './hqShared'
import { money, type OpsActions } from './opsUi'
import type { HqFeedState } from './useHqFeed'

const HEALTH_ORDER: Record<string, number> = { red: 0, yellow: 1, green: 2, gray: 3 }
const FIRST_CLIENTS = 12

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
  needs,
  showRevenue,
}: {
  board: OpsBoard
  actions: OpsActions
  hq: HqFeedState
  needs: ReturnType<typeof rankNeedsYou>
  showRevenue: boolean
}) {
  const [openRun, setOpenRun] = useState<string | null>(null)
  const [allClients, setAllClients] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const runs = useMemo(() => hq.feed?.runs ?? [], [hq.feed])
  const working = runs.filter(isActive)

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), working.length ? 1000 : 30000)
    return () => clearInterval(id)
  }, [working.length])

  const approvals = hq.feed?.approvals ?? []
  const clients = useMemo(() => [...board.engagements].sort(byHealthThenActivity), [board.engagements])
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

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-[minmax(0,4fr)_minmax(0,5fr)_minmax(0,3fr)] items-start">
        <div className="min-w-0">
          <NeedsYou
            items={needs.items}
            count={needs.count}
            waitingOnOthers={needs.waitingOnOthers}
            approvals={approvals}
            board={board}
            actions={actions}
            onDecide={hq.decide}
          />
        </div>

        <div className="min-w-0 space-y-4 lg:sticky lg:top-4">
          {hq.feed ? (
            <Office desks={desks(runs, hq.feed.lastRuns, approvals)} latestByRun={hq.latestByRun} now={now} onOpen={setOpenRun} onStop={hq.stop} />
          ) : (
            <p className="rounded-lg border border-gray-800 bg-gray-900 px-4 py-6 text-sm text-gray-500">Loading the office…</p>
          )}
          <div className="h-[70vh] min-h-[420px] xl:h-[calc(100vh-330px)]">
            <Chat
              messages={hq.messages}
              jobs={hq.feed?.jobs ?? []}
              thinking={runs.some((r) => r.agent === 'chief' && isActive(r))}
              onSend={hq.send}
            />
          </div>
        </div>

        <section aria-label="Clients" className="min-w-0 lg:col-span-2 xl:col-span-1 space-y-2">
          <h2 className="text-sm font-semibold text-gray-100 px-1">
            Clients
            <span className="ml-2 text-gray-500 font-normal tabular-nums">{clients.length}</span>
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-1">
            {(allClients ? clients : clients.slice(0, FIRST_CLIENTS)).map((e) => (
              <li key={e.id}>
                <ClientCard e={e} working={workingMap.get(e.id) ?? null} showRevenue={showRevenue} onOpen={actions.openEngagement} />
              </li>
            ))}
          </ul>
          {clients.length > FIRST_CLIENTS && (
            <button
              type="button"
              onClick={() => setAllClients((v) => !v)}
              className="w-full min-h-[44px] rounded-lg border border-gray-700 bg-gray-800 hover:bg-gray-700 text-sm text-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              {allClients ? 'Show fewer' : `Show all ${clients.length}`}
            </button>
          )}
        </section>
      </div>

      {openRun && <RunDrawer runId={openRun} liveEvents={hq.events} runs={runs} onClose={() => setOpenRun(null)} onStop={hq.stop} />}
    </div>
  )
}
