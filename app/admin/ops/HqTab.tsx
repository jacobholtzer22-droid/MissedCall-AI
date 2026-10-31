'use client'

// HQ (first tab, the default): the agents and nothing else. It fills the
// viewport under the tab bar and the page never scrolls; each column scrolls
// inside itself. lg and up: a 380px left column with the office desks stacked
// (Chief, Ads, Web, Photo) and the approvals under them (pending first with
// Push and Reject, then the ones decided in the last 30 minutes), and the chief
// chat filling the rest, composer pinned at its bottom. Below lg: the chat
// first at full height; the desks and approvals open above it behind the
// Agents toggle, in their own scroll, so the composer stays in view. Same
// components as before (Office, Chat, ApprovalCard, RunDrawer); the feed is
// the shell's useHqFeed, polling fast while this tab is open.

import { useEffect, useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Chat } from './HqChat'
import { Office, RunDrawer, desks } from './HqOffice'
import { ApprovalCard } from './HqApprovals'
import { OUTCOME } from './HomeTriage'
import { HQ_CSS, isActive, type FeedApproval } from './hqShared'
import type { HqFeedState } from './useHqFeed'

export function HqTab({ hq }: { hq: HqFeedState }) {
  const [openRun, setOpenRun] = useState<string | null>(null)
  const [agentsOpen, setAgentsOpen] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const runs = useMemo(() => hq.feed?.runs ?? [], [hq.feed])
  const approvals = hq.feed?.approvals ?? []
  const working = runs.filter(isActive).length
  const pending = approvals.filter((a) => a.status === 'pending').length

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), working ? 1000 : 30000)
    return () => clearInterval(id)
  }, [working])

  const summary = [working ? `${working} working` : null, pending ? `${pending} waiting for Push` : null].filter(Boolean).join(', ')

  return (
    <div className="h-full min-h-0 flex flex-col gap-3 lg:grid lg:grid-cols-[380px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:gap-4">
      <style>{HQ_CSS}</style>

      <button
        type="button"
        onClick={() => setAgentsOpen((v) => !v)}
        aria-expanded={agentsOpen}
        aria-controls="hq-agents"
        className="lg:hidden shrink-0 flex items-center justify-between gap-3 w-full min-h-[44px] px-4 rounded-lg border border-gray-800 bg-gray-900 text-sm text-gray-100 hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <span className="flex items-baseline gap-2 min-w-0">
          <span className="font-semibold">Agents</span>
          {summary && <span className={`truncate ${pending ? 'text-amber-300' : 'text-emerald-300'}`}>{summary}</span>}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${agentsOpen ? 'rotate-180' : ''}`} />
      </button>

      <div
        id="hq-agents"
        data-ops-panel="agents"
        className={`${agentsOpen ? 'flex' : 'hidden'} lg:flex flex-col gap-3 min-h-0 overflow-y-auto overscroll-contain shrink-0 max-h-[45%] lg:max-h-none lg:h-full`}
      >
        {hq.loadError && <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{hq.loadError}</p>}
        {hq.feed ? (
          <Office desks={desks(runs, hq.feed.lastRuns, approvals)} latestByRun={hq.latestByRun} now={now} onOpen={setOpenRun} onStop={hq.stop} stacked />
        ) : (
          <p className="rounded-lg border border-gray-800 bg-gray-900 px-4 py-6 text-sm text-gray-500">Loading the office…</p>
        )}
        <ApprovalList approvals={approvals} onDecide={hq.decide} />
      </div>

      <div data-ops-panel="chat" className="flex-1 min-h-0 lg:h-full">
        <Chat messages={hq.messages} jobs={hq.feed?.jobs ?? []} thinking={runs.some((r) => r.agent === 'chief' && isActive(r))} onSend={hq.send} fill />
      </div>

      {openRun && <RunDrawer runId={openRun} liveEvents={hq.events} runs={runs} onClose={() => setOpenRun(null)} onStop={hq.stop} />}
    </div>
  )
}

/** Pending approvals first (oldest first) with Push and Reject, then one line each for those decided in the last 30 minutes. */
function ApprovalList({
  approvals,
  onDecide,
}: {
  approvals: FeedApproval[]
  onDecide: (id: string, decision: 'approve' | 'reject') => Promise<string | null>
}) {
  const pending = approvals.filter((a) => a.status === 'pending').sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const recent = approvals.filter((a) => a.status !== 'pending').sort((a, b) => (b.decidedAt ?? '').localeCompare(a.decidedAt ?? ''))
  return (
    <section aria-label="Waiting for Push" data-hq-approvals className="shrink-0 bg-gray-900 border border-gray-800 rounded-lg">
      <div className="px-4 py-3 border-b border-gray-800">
        <h2 className="text-sm font-semibold text-gray-100">
          Waiting for Push
          <span className="ml-2 text-gray-500 font-normal tabular-nums">{pending.length}</span>
        </h2>
      </div>
      {pending.length === 0 && recent.length === 0 && <p className="px-4 py-4 text-sm text-gray-500">Nothing waits for your Push.</p>}
      {pending.length > 0 && (
        <div className="p-3 space-y-3">
          {pending.map((a) => (
            <ApprovalCard key={a.id} approval={a} onDecide={onDecide} compact />
          ))}
        </div>
      )}
      {recent.length > 0 && (
        <ul className={`px-4 py-2 space-y-1 ${pending.length ? 'border-t border-gray-800' : ''}`} aria-label="Decided in the last 30 minutes">
          {recent.map((a) => (
            <li key={a.id} className="text-xs flex items-baseline gap-2 min-w-0">
              <span className={`shrink-0 ${OUTCOME[a.status]?.tone ?? 'text-gray-400'}`}>{OUTCOME[a.status]?.label ?? a.status}</span>
              <span className="min-w-0 truncate text-gray-400" title={a.error ? `${a.title}: ${a.error}` : a.title}>
                {a.client ? `${a.client}: ` : ''}
                {a.title}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
