'use client'

// The office: one desk per persona (lib/ops/hq/personas.ts). A desk shows the
// agent's state (Idle, Working, Waiting for you, Failed); while it works, the
// client, the elapsed time and the latest feed line typed in, plus Stop. A
// click opens the drawer with the whole feed of the current or last run.

import { useEffect, useRef, useState } from 'react'
import { Square, X } from 'lucide-react'
import { PERSONAS, type Persona } from '@/lib/ops/hq/personas'
import { Avatar, ago, elapsed, isActive, type FeedApproval, type FeedEvent, type FeedRun } from './hqShared'

type DeskState = 'idle' | 'working' | 'waiting' | 'failed'

const PILL: Record<DeskState, { label: string; tone: string }> = {
  idle: { label: 'Idle', tone: 'bg-gray-500/10 text-gray-300 border-gray-500/30' },
  working: { label: 'Working', tone: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' },
  waiting: { label: 'Waiting for you', tone: 'bg-amber-500/10 text-amber-300 border-amber-500/30' },
  failed: { label: 'Failed', tone: 'bg-red-500/10 text-red-300 border-red-500/40' },
}

export type Desk = { persona: Persona; state: DeskState; active: FeedRun[]; run: FeedRun | null; waiting: number }

/** Each persona's desk from the feed: working beats waiting beats failed beats idle. */
export function desks(runs: FeedRun[], lastRuns: Record<string, FeedRun | null>, approvals: FeedApproval[]): Desk[] {
  return PERSONAS.map((persona) => {
    const active = runs.filter((r) => r.agent === persona.key && isActive(r))
    const last = lastRuns[persona.key] ?? null
    const waiting = approvals.filter((a) => a.agent === persona.key && a.status === 'pending').length
    const state: DeskState = active.length ? 'working' : waiting ? 'waiting' : last?.status === 'failed' ? 'failed' : 'idle'
    return { persona, state, active, run: active[0] ?? last, waiting }
  })
}

export function Office({
  desks: list,
  latestByRun,
  now,
  onOpen,
  onStop,
}: {
  desks: Desk[]
  latestByRun: Map<string, string>
  now: number
  onOpen: (runId: string) => void
  onStop: (runId: string) => Promise<void>
}) {
  return (
    <section aria-label="The office" className="bg-gray-900 border border-gray-800 rounded-lg">
      <div className="px-4 py-3 border-b border-gray-800">
        <h2 className="text-sm font-semibold text-gray-100">The office</h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3 gap-3 p-3">
        {list.map((d) => (
          <DeskCard key={d.persona.key} desk={d} latest={d.run ? latestByRun.get(d.run.id) ?? d.run.latest?.label ?? null : null} now={now} onOpen={onOpen} onStop={onStop} />
        ))}
      </div>
    </section>
  )
}

function DeskCard({
  desk,
  latest,
  now,
  onOpen,
  onStop,
}: {
  desk: Desk
  latest: string | null
  now: number
  onOpen: (runId: string) => void
  onStop: (runId: string) => Promise<void>
}) {
  const { persona, state, run, active } = desk
  const [stopping, setStopping] = useState(false)
  const pill = PILL[state]
  const open = () => run && onOpen(run.id)
  return (
    <div
      role="button"
      tabIndex={run ? 0 : -1}
      aria-label={`${persona.name}, ${pill.label}${run ? '. Open the feed' : ''}`}
      onClick={open}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && run) {
          e.preventDefault()
          open()
        }
      }}
      className={`min-w-0 rounded-lg border bg-gray-950 p-3 flex flex-col gap-3 ${run ? 'cursor-pointer hover:border-gray-700' : ''} border-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500`}
      style={state === 'working' ? { borderColor: `${persona.color}66` } : undefined}
    >
      <div className="flex items-center gap-3 min-w-0">
        <Avatar persona={persona} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-gray-100 truncate">{persona.name}</div>
          <div className="text-xs text-gray-500 truncate">{persona.role}</div>
        </div>
      </div>
      <div>
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs border whitespace-nowrap ${pill.tone}`}>
          {state === 'working' && <span className="hq-pulse h-1.5 w-1.5 rounded-full bg-emerald-400" />}
          {pill.label}
          {state === 'waiting' && <span className="tabular-nums">{desk.waiting}</span>}
        </span>
      </div>

      {state === 'working' && run ? (
        <div className="min-w-0 space-y-1">
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="text-gray-300 truncate">
              {run.client ?? (persona.key === 'chief' ? 'The board' : 'No client')}
              {run.mode === 'apply' ? ', applying' : ''}
              {active.length > 1 ? `, ${active.length - 1} more` : ''}
            </span>
            <span className="text-gray-500 tabular-nums shrink-0">{elapsed(run.startedAt, now)}</span>
          </div>
          {latest && (
            <span key={latest} className="hq-type block truncate text-xs text-gray-400" title={latest}>
              {latest}
            </span>
          )}
        </div>
      ) : (
        <div className="text-xs text-gray-500 min-w-0">
          <p className="truncate">{state === 'failed' && run?.error ? run.error : persona.idleLine}</p>
          <p className="tabular-nums">Last run {ago(run?.finishedAt ?? run?.startedAt ?? null, now)}</p>
        </div>
      )}

      {state === 'working' && run && (
        <button
          type="button"
          disabled={stopping}
          onClick={async (e) => {
            e.stopPropagation()
            setStopping(true)
            await onStop(run.id)
            setStopping(false)
          }}
          className="inline-flex items-center justify-center gap-1.5 min-h-[44px] rounded-lg border border-gray-700 bg-gray-800 hover:bg-gray-700 text-sm font-medium text-gray-100 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <Square className="h-3.5 w-3.5" />
          {stopping ? 'Stopping…' : 'Stop'}
        </button>
      )}
    </div>
  )
}

// ── The drawer ──────────────────────────────────────────────────────────────

const EVENT_TONE: Record<string, string> = {
  tool_call: 'font-mono text-[12px] text-gray-200',
  tool_result: 'text-gray-500',
  error: 'text-red-400',
  thinking: 'italic text-gray-500',
  text: 'text-gray-200',
  status: 'text-gray-400 font-medium',
}

function offset(startIso: string | null, atIso: string) {
  if (!startIso) return ''
  const s = (new Date(atIso).getTime() - new Date(startIso).getTime()) / 1000
  return `${s < 0 ? '-' : '+'}${Math.abs(s).toFixed(1)}s`
}

export function RunDrawer({
  runId,
  liveEvents,
  runs,
  onClose,
  onStop,
}: {
  runId: string
  liveEvents: FeedEvent[]
  runs: FeedRun[]
  onClose: () => void
  onStop: (runId: string) => Promise<void>
}) {
  const [loaded, setLoaded] = useState<{ run: FeedRun; events: FeedEvent[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`/api/admin/ops/hq/runs/${runId}/events`, { cache: 'no-store' })
        const data = await res.json().catch(() => ({}))
        if (cancelled) return
        if (res.ok) setLoaded({ run: { ...data.run, latest: null, kind: '', jobId: null, engagementId: null }, events: data.events })
        else setError(String(data.error ?? 'Could not load the run'))
      } catch {
        if (!cancelled) setError('Could not load the run')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [runId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Live events from the feed poll join the loaded list.
  const seen = new Set(loaded?.events.map((e) => e.id))
  const events = loaded ? [...loaded.events, ...liveEvents.filter((e) => e.runId === runId && !seen.has(e.id))] : []
  const live = runs.find((r) => r.id === runId)
  const run = live ?? loaded?.run ?? null
  const running = isActive(run)

  useEffect(() => {
    const el = listRef.current
    if (el && running && pinned.current) el.scrollTop = el.scrollHeight
  }, [events.length, running])

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Run feed">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/60 cursor-default" onClick={onClose} />
      <div className="relative w-full sm:w-[560px] h-full bg-gray-950 border-l border-gray-800 flex flex-col">
        <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-gray-800">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-gray-100 truncate">
              {run?.agent ? `${PERSONAS.find((p) => p.key === run.agent)?.name ?? run.agent}` : 'Run'}
              {run?.client ? `, ${run.client}` : ''}
            </h2>
            <p className="text-xs text-gray-500 tabular-nums">
              {run ? `${run.status}${run.mode === 'apply' ? ', apply' : ''}, ${events.length} event${events.length === 1 ? '' : 's'}` : 'Loading…'}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {running && (
              <button
                type="button"
                onClick={() => onStop(runId)}
                className="inline-flex items-center gap-1.5 px-3 min-h-[44px] rounded-lg border border-gray-700 bg-gray-800 hover:bg-gray-700 text-sm text-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <Square className="h-3.5 w-3.5" /> Stop
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close the feed"
              className="inline-flex items-center justify-center w-11 h-11 rounded-lg text-gray-400 hover:text-gray-100 hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div
          ref={listRef}
          onScroll={(e) => {
            const el = e.currentTarget
            pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
          }}
          className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5 text-sm"
        >
          {error && <p className="text-red-400">{error}</p>}
          {!error && !loaded && <p className="text-gray-500">Loading…</p>}
          {events.map((e) => (
            <div key={e.id} className="flex gap-3 min-w-0">
              <span className="w-14 shrink-0 text-right text-xs text-gray-600 tabular-nums pt-0.5">{offset(run?.startedAt ?? null, e.createdAt)}</span>
              <div className={`min-w-0 flex-1 break-words ${EVENT_TONE[e.kind] ?? 'text-gray-300'}`}>
                {e.detail && (e.kind === 'tool_result' || e.kind === 'error' || e.kind === 'text' || e.kind === 'thinking') ? (
                  <details>
                    <summary className="cursor-pointer list-none">{e.label}</summary>
                    <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-gray-900 border border-gray-800 p-2 font-mono text-[11px] text-gray-400">
                      {detailText(e.detail)}
                    </pre>
                  </details>
                ) : (
                  e.label
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function detailText(detail: unknown): string {
  const d = detail as Record<string, unknown>
  if (typeof d?.text === 'string') return d.text
  if (typeof d?.thinking === 'string') return d.thinking
  const s = JSON.stringify(detail, null, 2)
  return s.length > 6000 ? `${s.slice(0, 6000)}\n…` : s
}
