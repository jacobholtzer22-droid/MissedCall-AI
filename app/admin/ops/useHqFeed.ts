'use client'

// The HQ feed, held by the Ops shell so every tab sees the same live state
// (the Home badge counts pending approvals; client cards show which agent is
// working on them). One poll: GET /api/admin/ops/hq/feed?since=<cursor>,
// every 2 s while Home is open and visible, every 15 s otherwise, and at once
// after anything Jacob does. Messages and events accumulate by id; runs,
// approvals, jobs and each agent's last run are replaced on every poll.
// When an agent run finishes, onRunSettled fires so the shell can reload the
// board (steps, status lines and activities may have changed).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isActive, type Feed, type FeedEvent, type FeedMessage } from './hqShared'

const FAST_MS = 2000
const SLOW_MS = 15000
const KEEP_EVENTS = 800

export type HqFeedState = ReturnType<typeof useHqFeed>

export function useHqFeed({ fast, toast, onRunSettled }: { fast: boolean; toast: (m: string, t: 'success' | 'error') => void; onRunSettled: () => void }) {
  const [feed, setFeed] = useState<Omit<Feed, 'messages' | 'events' | 'cursor'> | null>(null)
  const [messages, setMessages] = useState<FeedMessage[]>([])
  const [events, setEvents] = useState<FeedEvent[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const cursor = useRef<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inFlight = useRef(false)
  const fastRef = useRef(fast)
  fastRef.current = fast
  const settledRef = useRef(onRunSettled)
  settledRef.current = onRunSettled
  const activeIds = useRef<Set<string> | null>(null)

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
          const nowActive = new Set(data.runs.filter(isActive).map((r) => r.id))
          if (activeIds.current && Array.from(activeIds.current).some((id) => !nowActive.has(id))) settledRef.current()
          activeIds.current = nowActive
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
    timer.current = setTimeout(() => void poll(), fastRef.current && !document.hidden ? FAST_MS : SLOW_MS)
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

  // Opening Home polls at once instead of waiting out the slow interval.
  useEffect(() => {
    if (fast) void poll()
  }, [fast, poll])

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

  return { feed, messages, events, loadError, latestByRun, send, decide, stop }
}
