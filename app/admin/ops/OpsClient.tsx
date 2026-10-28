'use client'

// /admin/ops shell: header, tabs (?tab=), the board state, the HQ feed (one
// poll for every tab, see useHqFeed), every write, the detail panel and toasts.
//
// Writes are optimistic, like /admin/pipeline: the board changes at once, the
// request goes out, a failure puts the previous board back and toasts. On
// success the board is refetched quietly so alerts, health and totals come
// from the server, which is the only place they are computed.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff, Globe, RefreshCw } from 'lucide-react'
import type { BoardDeliverable, BoardEngagement, OpsBoard } from '@/lib/ops/board'
import type { UnmatchedPayingCustomer } from '@/lib/ops/sync'
import { rankNeedsYou } from '@/lib/ops/needs-you'
import { Age } from '../ui'
import { HomeTab, workingByClient } from './HomeTab'
import { ClientsTab } from './ClientsTab'
import { MoneyTab } from './MoneyTab'
import { AgentsTab } from './AgentsTab'
import { Timeline } from './Timeline'
import { EngagementPanel } from './EngagementPanel'
import { useHqFeed } from './useHqFeed'
import { button, type OpsActions } from './opsUi'

export type OpsTab = 'home' | 'clients' | 'money' | 'timeline' | 'agents'
export const OPS_TABS: { key: OpsTab; label: string }[] = [
  { key: 'home', label: 'Home' },
  { key: 'clients', label: 'Clients' },
  { key: 'money', label: 'Money' },
  { key: 'timeline', label: 'Timeline' },
  { key: 'agents', label: 'Agents' },
]

/** Same cookie as /admin's revenue toggle, so both pages agree. */
const REVENUE_COOKIE = 'adminShowRevenue'

type Toast = { id: number; message: string; type: 'success' | 'error' }

async function send(url: string, method: string, body?: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  try {
    const res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    })
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    return { ok: res.ok, data }
  } catch {
    return { ok: false, data: { error: 'Network error' } }
  }
}

function mapEngagement(board: OpsBoard, id: string, fn: (e: BoardEngagement) => BoardEngagement): OpsBoard {
  const apply = (list: BoardEngagement[]) => list.map((e) => (e.id === id ? fn(e) : e))
  return { ...board, engagements: apply(board.engagements), ignored: apply(board.ignored) }
}

export function OpsClient({
  initialBoard,
  initialTab,
  initialShowRevenue = false,
}: {
  initialBoard: OpsBoard
  initialTab: OpsTab
  initialShowRevenue?: boolean
}) {
  const router = useRouter()
  const [board, setBoard] = useState(initialBoard)
  const boardRef = useRef(board)
  boardRef.current = board
  const [tab, setTab] = useState<OpsTab>(initialTab)
  const [selected, setSelected] = useState<{ id: string; focus?: 'activity'; key: number } | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [unmatched, setUnmatched] = useState<UnmatchedPayingCustomer[] | null>(null)
  const [unmatchedLoading, setUnmatchedLoading] = useState(false)
  const [showRevenue, setShowRevenue] = useState(initialShowRevenue)

  const toggleRevenue = () =>
    setShowRevenue((prev) => {
      const next = !prev
      document.cookie = next ? `${REVENUE_COOKIE}=1; path=/; max-age=31536000; samesite=lax` : `${REVENUE_COOKIE}=; path=/; max-age=0; samesite=lax`
      return next
    })

  const toast = useCallback((message: string, type: 'success' | 'error') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, message, type }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000)
  }, [])

  const refresh = useCallback(async () => {
    const { ok, data } = await send('/api/admin/ops/board', 'GET')
    if (ok) setBoard(data as unknown as OpsBoard)
    else toast(String(data.error ?? 'Could not reload the board'), 'error')
  }, [toast])

  const hq = useHqFeed({ fast: tab === 'home', toast, onRunSettled: () => void refresh() })
  const needs = useMemo(() => rankNeedsYou(board, hq.feed?.approvals ?? []), [board, hq.feed])
  // The timeline reloads its first page when a job, run or approval moves.
  const timelineKey = [
    ...(hq.feed?.jobs ?? []).map((j) => `${j.id}:${j.status}:${j.updatedAt}`),
    ...(hq.feed?.approvals ?? []).map((a) => `${a.id}:${a.status}`),
    ...(hq.feed?.runs ?? []).map((r) => `${r.id}:${r.status}`),
  ].join('|')

  const loadUnmatched = useCallback(
    async (fresh = false) => {
      setUnmatchedLoading(true)
      const { ok, data } = await send(`/api/admin/ops/stripe/unmatched${fresh ? '?refresh=1' : ''}`, 'GET')
      setUnmatchedLoading(false)
      if (ok) setUnmatched((data.customers as UnmatchedPayingCustomer[]) ?? [])
      else toast(String(data.error ?? 'Could not load Stripe customers'), 'error')
    },
    [toast]
  )

  useEffect(() => {
    if (tab === 'clients' && unmatched === null && !unmatchedLoading) void loadUnmatched()
  }, [tab, unmatched, unmatchedLoading, loadUnmatched])

  const switchTab = (t: OpsTab) => {
    setTab(t)
    router.replace(`/admin/ops?tab=${t}`, { scroll: false })
  }

  /** Optimistic write: apply, send, revert on failure, refetch on success. */
  const optimistic = useCallback(
    async (apply: (b: OpsBoard) => OpsBoard, request: () => ReturnType<typeof send>, failMessage: string) => {
      const before = boardRef.current
      setBoard(apply(before))
      const { ok, data } = await request()
      if (!ok) {
        setBoard(before)
        toast(String(data.error ?? failMessage), 'error')
        return { ok, data }
      }
      void refresh()
      return { ok, data }
    },
    [refresh, toast]
  )

  const actions: OpsActions = {
    patchEngagement: async (id, patch, change) => {
      const { ok, data } = await optimistic(
        (b) => (change ? mapEngagement(b, id, (e) => ({ ...e, ...change })) : b),
        () => send(`/api/admin/ops/engagements/${id}`, 'PATCH', patch),
        'Could not save'
      )
      const stripe = data.stripe as { ok: boolean; reason?: string; warnings?: string[] } | null | undefined
      if (ok && stripe && !stripe.ok) toast(`Linked, but Stripe sync said: ${stripe.reason}`, 'error')
      if (ok && stripe?.ok && stripe.warnings?.length) toast(`Linked. Stripe: ${stripe.warnings.join('; ')}`, 'error')
      return ok
    },
    patchDeliverable: async (engagementId, deliverableId, patch, change) => {
      const { ok } = await optimistic(
        (b) =>
          change
            ? mapEngagement(b, engagementId, (e) => ({
                ...e,
                deliverables: e.deliverables.map((d): BoardDeliverable => (d.id === deliverableId ? { ...d, ...change } : d)),
              }))
            : b,
        () => send(`/api/admin/ops/deliverables/${deliverableId}`, 'PATCH', patch),
        'Could not save the deliverable'
      )
      return ok
    },
    logActivity: async (id, input) => {
      const now = new Date().toISOString()
      const { ok } = await optimistic(
        (b) =>
          mapEngagement(b, id, (e) => ({
            ...e,
            activities: [
              { id: `pending:${now}`, kind: input.kind, body: input.body || 'Follow-up scheduled', followUpAt: input.followUpAt ?? null, createdAt: now },
              ...e.activities,
            ].slice(0, 5),
            lastActivityAt: now,
            ...(input.kind === 'status' ? { statusLine: input.body, statusAt: now } : {}),
            ...(input.followUpAt ? { nextFollowUpAt: input.followUpAt } : {}),
          })),
        () => send(`/api/admin/ops/engagements/${id}/activities`, 'POST', input),
        'Could not log that'
      )
      if (ok) toast('Logged', 'success')
      return ok
    },
    snooze: async (id, days) => {
      const until = new Date(Date.now() + days * 86_400_000).toISOString()
      const { ok } = await optimistic(
        (b) => ({
          ...mapEngagement(b, id, (e) => ({ ...e, nextFollowUpAt: until })),
          followUpsDue: b.followUpsDue.filter((f) => !(f.kind === 'client' && f.id === id)),
        }),
        () => send(`/api/admin/ops/engagements/${id}/snooze`, 'POST', { days }),
        'Could not snooze'
      )
      return ok
    },
    // Booking outcomes go through the pipeline's own route, never a direct write.
    setShowStatus: async (bookingId, showStatus) => {
      const { ok } = await optimistic(
        (b) => ({ ...b, bookedToday: b.bookedToday.map((x) => (x.id === bookingId ? { ...x, showStatus } : x)) }),
        () => send(`/api/admin/pipeline/booking/${bookingId}`, 'PATCH', { showStatus }),
        'Could not mark the booking'
      )
      return ok
    },
    createFromStripe: async (customerId) => {
      const { ok, data } = await send('/api/admin/ops/engagements', 'POST', { stripeCustomerId: customerId })
      if (!ok) {
        toast(String(data.error ?? 'Could not create the client'), 'error')
        return null
      }
      await refresh()
      toast('Client created', 'success')
      return String(data.engagementId)
    },
    openEngagement: (id, focus) => setSelected({ id, focus, key: Date.now() }),
    toast,
  }

  const runSync = async () => {
    setSyncing(true)
    const { ok, data } = await send('/api/admin/ops/sync', 'POST')
    setSyncing(false)
    if (!ok) {
      toast(String(data.error ?? 'Sync failed'), 'error')
      return
    }
    const created = Array.isArray(data.engagementsCreated) ? data.engagementsCreated.length : 0
    const stripe = data.stripe as { errors?: unknown[] } | undefined
    const errs = stripe?.errors?.length ?? 0
    toast(`Synced${created ? `, ${created} new client${created === 1 ? '' : 's'}` : ''}${errs ? `, ${errs} Stripe error${errs === 1 ? '' : 's'}` : ''}`, errs ? 'error' : 'success')
    await refresh()
    if (unmatched !== null) void loadUnmatched(true)
  }

  const [checking, setChecking] = useState(false)
  const runWebChecks = async () => {
    setChecking(true)
    const { ok, data } = await send('/api/admin/ops/checks/web', 'POST')
    setChecking(false)
    if (!ok) {
      toast(String(data.error ?? 'Web checks failed'), 'error')
      return
    }
    const advances = Array.isArray(data.autoAdvances) ? data.autoAdvances.length : 0
    const errs = Array.isArray(data.apiErrors) ? data.apiErrors.length : 0
    toast(
      `Web checks done${advances ? `, ${advances} step${advances === 1 ? '' : 's'} advanced` : ''}${errs ? `, ${errs} API error${errs === 1 ? '' : 's'}` : ''}`,
      errs ? 'error' : 'success'
    )
    await refresh()
  }

  const selectedEngagement = selected
    ? board.engagements.find((e) => e.id === selected.id) ?? board.ignored.find((e) => e.id === selected.id) ?? null
    : null

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800 px-3 sm:px-6">
        <div className="max-w-screen-2xl mx-auto flex items-center justify-between gap-3 min-h-[56px]">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/admin"
              className="inline-flex items-center text-sm text-gray-400 hover:text-gray-100 whitespace-nowrap min-h-[44px] px-1 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              ← Admin
            </Link>
            <h1 className="text-lg font-semibold">Ops</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-xs text-gray-500 whitespace-nowrap">
              last sync <Age iso={board.lastSyncAt} />
            </span>
            <button
              type="button"
              onClick={toggleRevenue}
              aria-pressed={showRevenue}
              aria-label={showRevenue ? 'Hide revenue' : 'Show revenue'}
              title={showRevenue ? 'Hide revenue' : 'Show revenue'}
              className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg text-gray-400 hover:text-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              {showRevenue ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
            <button type="button" onClick={runSync} disabled={syncing} className={button}>
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing…' : 'Sync'}
            </button>
            <button type="button" onClick={runWebChecks} disabled={checking} className={button}>
              <Globe className={`h-3.5 w-3.5 ${checking ? 'animate-pulse' : ''}`} />
              {checking ? 'Checking…' : 'Run web checks'}
            </button>
          </div>
        </div>
        <nav
          role="tablist"
          aria-label="Ops sections"
          className="max-w-screen-2xl mx-auto flex overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
        >
          {OPS_TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => switchTab(t.key)}
              className={`px-4 sm:px-5 min-h-[44px] text-sm font-medium whitespace-nowrap border-b-2 -mb-px focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${
                tab === t.key ? 'border-blue-500 text-gray-100' : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              {t.label}
              {t.key === 'home' && needs.count > 0 && <span className="ml-1.5 text-gray-500 font-normal tabular-nums">{needs.count}</span>}
            </button>
          ))}
        </nav>
      </header>

      <main className="max-w-screen-2xl mx-auto px-3 sm:px-6 py-4 sm:py-6">
        {tab === 'home' && <HomeTab board={board} actions={actions} hq={hq} needs={needs} showRevenue={showRevenue} />}
        {tab === 'clients' && (
          <ClientsTab
            board={board}
            actions={actions}
            unmatched={unmatched}
            unmatchedLoading={unmatchedLoading}
            onLoadUnmatched={loadUnmatched}
            showRevenue={showRevenue}
            onShowRevenue={toggleRevenue}
            working={workingByClient(hq)}
          />
        )}
        {tab === 'money' && <MoneyTab board={board} actions={actions} />}
        {tab === 'timeline' && <Timeline engagements={[...board.engagements, ...board.ignored]} refreshKey={timelineKey} />}
        {tab === 'agents' && <AgentsTab board={board} actions={actions} />}
      </main>

      {selectedEngagement && selected && (
        <EngagementPanel
          key={`${selected.id}:${selected.key}`}
          engagement={selectedEngagement}
          focus={selected.focus}
          actions={actions}
          unmatched={unmatched}
          unmatchedLoading={unmatchedLoading}
          onLoadUnmatched={loadUnmatched}
          onClose={() => setSelected(null)}
          onRefresh={refresh}
        />
      )}

      <div className="fixed bottom-4 right-4 space-y-2 z-[100] pointer-events-none" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`px-4 py-2.5 rounded-lg text-sm font-medium pointer-events-auto ${
              t.type === 'success' ? 'bg-green-700 text-white' : 'bg-red-700 text-white'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </div>
  )
}
