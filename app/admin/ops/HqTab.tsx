'use client'

// HQ (?tab=hq): chat with the chief on the left; the office and Waiting for
// you on the right (mobile: office, then Waiting for you, then chat); History
// below, full width.
//
// One poll keeps it live: GET /api/admin/ops/hq/feed?since=<cursor>, every 2s
// while the tab is visible and every 15s while hidden, and at once after
// anything Jacob does. Messages and events accumulate by id; runs, approvals,
// jobs and each agent's last run are replaced on every poll.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Approvals } from './HqApprovals'
import { Chat } from './HqChat'
import { History } from './HqHistory'
import { Office, RunDrawer, desks } from './HqOffice'
import { HQ_CSS, isActive, type Feed, type FeedEvent, type FeedMessage } from './hqShared'
import type { OpsActions } from './opsUi'

const VISIBLE_MS = 2000
const HIDDEN_MS = 15000
const KEEP_EVENTS = 800

export function HqTab({ actions }: { actions: OpsActions }) {
  const [feed, setFeed] = useState<Omit<Feed, 'messages' | 'events' | 'cursor'> | null>(null)
  const [messages, setMessages] = useState<FeedMessage[]>([])
  const [events, setEvents] = useState<FeedEvent[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [openRun, setOpenRun] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const cursor = useRef<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inFlight = useRef(false)
  const toast = actions.toast

  const poll = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current)
    if (!inFlight.current) {
      inFlight.current = true
      try {
        const url = `/api/admin/ops/hq/feed${cursor.current ? `?since=${encodeURIComponent(cursor.current)}` : ''}`
        const res = await fetch(url, { cache: 'no-store' })
        const data = (await res.json().catch(() => ({}))) as Feed & { error?: string }
        if (!res.ok) {
          setLoadError(String(data.error ?? `The feed answered ${res.status}`))
        } else {
          setLoadError(null)
          cursor.current = data.cursor ?? cursor.current
          setFeed({ runs: data.runs, lastRuns: data.lastRuns, approvals: data.approvals, jobs: data.jobs })
          if (data.messages.length) {
            setMessages((prev) => {
              const real = new Set(data.messages.map((m) => m.id))
              const kept = prev.filter((m) => !real.has(m.id) && !(m.pending && data.messages.some((x) => x.role === 'jacob' && x.body === m.body)))
              return [...kept, ...data.messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
            })
          }
          if (data.events.length) {
            setEvents((prev) => {
              const seen = new Set(prev.map((e) => e.id))
              return [...prev, ...data.events.filter((e) => !seen.has(e.id))].slice(-KEEP_EVENTS)
            })
          }
        }
      } catch {
        setLoadError('Could not reach the feed')
      } finally {
        inFlight.current = false
      }
    }
    timer.current = setTimeout(() => void poll(), document.hidden ? HIDDEN_MS : VISIBLE_MS)
  }, [])

  useEffect(() => {
    void poll()
    const onVisible = () => void poll()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      if (timer.current) clearTimeout(timer.current)
    }
  }, [poll])

  const runs = useMemo(() => feed?.runs ?? [], [feed])
  const working = runs.some(isActive)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), working ? 1000 : 30000)
    return () => clearInterval(id)
  }, [working])

  const latestByRun = useMemo(() => {
    const map = new Map<string, string>()
    for (const e of events) map.set(e.runId, e.label)
    return map
  }, [events])

  const send = async (body: string) => {
    const temp: FeedMessage = { id: `pending:${Date.now()}`, jobId: null, role: 'jacob', body, createdAt: new Date().toISOString(), pending: true }
    setMessages((m) => [...m, temp])
    try {
      const res = await fetch('/api/admin/ops/hq/message', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(data.error ?? 'Could not send'))
      void poll()
      return true
    } catch (err) {
      setMessages((m) => m.filter((x) => x.id !== temp.id))
      toast(err instanceof Error ? err.message : 'Could not send', 'error')
      return false
    }
  }

  const decide = async (id: string, decision: 'approve' | 'reject') => {
    try {
      const res = await fetch(`/api/admin/ops/hq/approvals/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision }) })
      const data = await res.json().catch(() => ({}))
      void poll()
      return res.ok ? null : String(data.error ?? 'Could not decide')
    } catch {
      return 'Network error'
    }
  }

  const stop = async (runId: string) => {
    try {
      const res = await fetch(`/api/admin/ops/hq/runs/${runId}/cancel`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) toast(String(data.error ?? 'Could not stop'), 'error')
    } catch {
      toast('Could not stop', 'error')
    }
    void poll()
  }

  const deskList = feed ? desks(feed.runs, feed.lastRuns, feed.approvals) : []
  const approvals = [...(feed?.approvals ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const chiefThinking = runs.some((r) => r.agent === 'chief' && isActive(r))
  // History reloads its first page when a job or a recent approval moves.
  const historyKey = [
    ...(feed?.jobs ?? []).map((j) => `${j.id}:${j.status}:${j.updatedAt}`),
    ...(feed?.approvals ?? []).map((a) => `${a.id}:${a.status}`),
    ...runs.map((r) => `${r.id}:${r.status}`),
  ].join('|')

  return (
    <div className="space-y-3">
      <style>{HQ_CSS}</style>
      {loadError && <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{loadError}</p>}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="order-2 lg:order-1 lg:sticky lg:top-4 lg:h-[calc(100vh-150px)] min-w-0">
          <Chat messages={messages} jobs={feed?.jobs ?? []} thinking={chiefThinking} onSend={send} />
        </div>
        <div className="order-1 lg:order-2 space-y-4 min-w-0">
          {feed ? (
            <Office desks={deskList} latestByRun={latestByRun} now={now} onOpen={setOpenRun} onStop={stop} />
          ) : (
            <p className="rounded-lg border border-gray-800 bg-gray-900 px-4 py-6 text-sm text-gray-500">Loading the office…</p>
          )}
          <Approvals approvals={approvals} onDecide={decide} />
        </div>
      </div>
      <History refreshKey={historyKey} onOpenRun={setOpenRun} />
      {openRun && <RunDrawer runId={openRun} liveEvents={events} runs={runs} onClose={() => setOpenRun(null)} onStop={stop} />}
    </div>
  )
}
