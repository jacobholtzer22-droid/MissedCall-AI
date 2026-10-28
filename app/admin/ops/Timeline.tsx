'use client'

// Timeline: everything that happened, newest first, 50 at a time (GET
// /api/admin/ops/timeline). Approvals with who pushed and when it applied,
// jobs with Jacob's message and the chief's report (collapsed), agent runs
// with duration and Open for the drawer, and every activity (notes, contacts,
// status lines, decisions, system). Grouped by day in Detroit time. Filters:
// client, agent, kind, date range. The client panel shows it with the client
// fixed. Read only.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { BoardEngagement } from '@/lib/ops/board'
import { personaFor } from '@/lib/ops/hq/personas'
import type { TimelineItem, TimelineKind } from '@/lib/ops/timeline'
import { ReportCard } from './HqChat'
import { RunDrawer } from './HqOffice'
import { Avatar, Markdown, costLine, elapsed } from './hqShared'
import { OPS_TZ, control, smallButton } from './opsUi'

const KIND_FILTERS: { key: TimelineKind; label: string }[] = [
  { key: 'approvals', label: 'Approvals' },
  { key: 'jobs', label: 'Jobs' },
  { key: 'runs', label: 'Runs' },
  { key: 'notes', label: 'Notes' },
  { key: 'decisions', label: 'Decisions' },
]

const ACTIVITY_LABEL: Record<string, string> = {
  note: 'Note',
  call: 'Call',
  voicemail: 'Voicemail',
  text: 'Text',
  email: 'Email',
  meeting: 'Meeting',
  status_change: 'Status change',
  system: 'System',
  status: 'Status',
  decision: 'Decision',
}

const APPROVAL_STATUS: Record<string, { label: string; tone: string }> = {
  pending: { label: 'Waiting for Push', tone: 'text-amber-300' },
  approved: { label: 'Pushed, applying', tone: 'text-emerald-300' },
  applied: { label: 'Applied', tone: 'text-emerald-400' },
  rejected: { label: 'Rejected', tone: 'text-gray-400' },
  failed: { label: 'Failed', tone: 'text-red-400' },
}

const RUN_TONE: Record<string, string> = {
  succeeded: 'text-emerald-400',
  failed: 'text-red-400',
  cancelled: 'text-gray-500',
  running: 'text-blue-300',
  queued: 'text-blue-300',
  dispatched: 'text-blue-300',
}

const JOB_STATUS: Record<string, string> = {
  planning: 'Planning',
  running: 'Running',
  reporting: 'Writing the report',
  awaiting_approval: 'Waiting for Push',
  done: 'Done',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

const time = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: OPS_TZ })
const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: OPS_TZ })
const when = (iso: string) => `${new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: OPS_TZ })}, ${time(iso)}`
const who = (by: string | null, via: string | null) =>
  by ? ` by ${by === 'jacob' ? 'Jacob' : by}${via ? ` via ${via === 'hq' ? 'HQ' : via}` : ''}` : ''

/** yyyy-mm-dd (a date input) → the start of that day in Detroit, as ISO. */
function detroitDayStart(ymd: string, plusDays = 0): string {
  const [y, m, d] = ymd.split('-').map(Number)
  // Noon UTC on that date, then step back to Detroit midnight using its offset that day.
  const noon = new Date(Date.UTC(y, m - 1, d + plusDays, 12))
  const offset = noon.toLocaleString('en-US', { timeZone: OPS_TZ, timeZoneName: 'shortOffset' }).match(/GMT([+-]\d+)/)
  const hours = offset ? Number(offset[1]) : -5
  return new Date(Date.UTC(y, m - 1, d + plusDays, -hours)).toISOString()
}

export function Timeline({
  engagements,
  engagementId,
  refreshKey,
  title = 'Timeline',
}: {
  /** For the client filter; omit with engagementId. */
  engagements?: BoardEngagement[]
  /** Fixes the timeline to one client (the client panel). */
  engagementId?: string
  /** Changes when the HQ feed saw something move; reloads the first page. */
  refreshKey?: string
  title?: string
}) {
  const [client, setClient] = useState(engagementId ?? '')
  const [agent, setAgent] = useState('')
  const [kinds, setKinds] = useState<TimelineKind[]>([])
  const [fromDay, setFromDay] = useState('')
  const [toDay, setToDay] = useState('')
  const [items, setItems] = useState<TimelineItem[] | null>(null)
  const [nextBefore, setNextBefore] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [drawerRun, setDrawerRun] = useState<string | null>(null)
  const olderLoaded = useRef(false)

  const load = useCallback(
    async (before: string | null) => {
      const q = new URLSearchParams()
      if (client) q.set('client', client)
      if (agent) q.set('agent', agent)
      if (kinds.length) q.set('kinds', kinds.join(','))
      if (fromDay) q.set('from', detroitDayStart(fromDay))
      const end = toDay ? detroitDayStart(toDay, 1) : null
      const cursor = before && end ? (before < end ? before : end) : before ?? end
      if (cursor) q.set('before', cursor)
      const res = await fetch(`/api/admin/ops/timeline?${q}`, { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(data.error ?? 'Could not load the timeline'))
      return data as { items: TimelineItem[]; nextBefore: string | null }
    },
    [client, agent, kinds, fromDay, toDay]
  )

  // A filter change starts over; a refresh reloads the first page and keeps older pages.
  useEffect(() => {
    olderLoaded.current = false
  }, [load])
  useEffect(() => {
    let cancelled = false
    load(null)
      .then((data) => {
        if (cancelled) return
        setError(null)
        const oldest = data.items[data.items.length - 1]?.at
        setItems((prev) => (prev && olderLoaded.current && oldest ? [...data.items, ...prev.filter((i) => i.at < oldest)] : data.items))
        if (!olderLoaded.current) setNextBefore(data.nextBefore)
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : 'Could not load the timeline'))
    return () => {
      cancelled = true
    }
  }, [load, refreshKey])

  const more = async () => {
    if (!nextBefore || loadingMore) return
    setLoadingMore(true)
    try {
      const data = await load(nextBefore)
      olderLoaded.current = true
      setItems((prev) => {
        const seen = new Set((prev ?? []).map((i) => `${i.type}:${i.id}`))
        return [...(prev ?? []), ...data.items.filter((i) => !seen.has(`${i.type}:${i.id}`))]
      })
      setNextBefore(data.nextBefore)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the timeline')
    } finally {
      setLoadingMore(false)
    }
  }

  const toggleKind = (k: TimelineKind) => setKinds((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]))
  const filtered = Boolean((!engagementId && client) || agent || kinds.length || fromDay || toDay)

  // Day headers, Detroit time.
  const groups: { day: string; items: TimelineItem[] }[] = []
  for (const i of items ?? []) {
    const d = day(i.at)
    if (groups[groups.length - 1]?.day !== d) groups.push({ day: d, items: [] })
    groups[groups.length - 1].items.push(i)
  }

  return (
    <section aria-label={title} className="bg-gray-900 border border-gray-800 rounded-lg">
      <div className="px-4 py-3 border-b border-gray-800 space-y-3">
        <h2 className="text-sm font-semibold text-gray-100">{title}</h2>
        <div className="flex flex-wrap items-center gap-2">
          {!engagementId && engagements && (
            <select aria-label="Client" value={client} onChange={(e) => setClient(e.target.value)} className={`${control} max-w-[14rem]`}>
              <option value="">All clients</option>
              {[...engagements]
                .sort((a, b) => a.displayName.localeCompare(b.displayName))
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.displayName}
                  </option>
                ))}
            </select>
          )}
          <select aria-label="Agent" value={agent} onChange={(e) => setAgent(e.target.value)} className={control}>
            <option value="">Any agent</option>
            <option value="chief">Chief</option>
            <option value="ads">Ads</option>
            <option value="web">Web</option>
          </select>
          <label className="inline-flex items-center gap-2 text-xs text-gray-500">
            From
            <input type="date" value={fromDay} onChange={(e) => setFromDay(e.target.value)} className={`${control} [color-scheme:dark]`} />
          </label>
          <label className="inline-flex items-center gap-2 text-xs text-gray-500">
            To
            <input type="date" value={toDay} onChange={(e) => setToDay(e.target.value)} className={`${control} [color-scheme:dark]`} />
          </label>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Kinds">
          {KIND_FILTERS.map((k) => {
            const on = kinds.includes(k.key)
            return (
              <button
                key={k.key}
                type="button"
                aria-pressed={on}
                onClick={() => toggleKind(k.key)}
                className={`px-3 min-h-[44px] sm:min-h-[36px] rounded-full border text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  on ? 'border-blue-500 bg-blue-500/10 text-blue-200' : 'border-gray-700 text-gray-400 hover:text-gray-200'
                }`}
              >
                {k.label}
              </button>
            )
          })}
          {filtered && (
            <button
              type="button"
              onClick={() => {
                if (!engagementId) setClient('')
                setAgent('')
                setKinds([])
                setFromDay('')
                setToDay('')
              }}
              className="px-3 min-h-[44px] sm:min-h-[36px] text-xs text-gray-400 hover:text-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {error && <p className="px-4 pt-3 text-sm text-red-400">{error}</p>}
      {!items && !error && <p className="px-4 py-6 text-sm text-gray-500">Loading…</p>}
      {items && items.length === 0 && <p className="px-4 py-6 text-sm text-gray-500">{filtered ? 'Nothing matches these filters.' : 'Nothing yet.'}</p>}

      {groups.map((g) => (
        <div key={g.day}>
          <h3 className="sticky top-0 z-10 bg-gray-900 px-4 py-2 text-xs font-medium text-gray-500 border-b border-gray-800">{g.day}</h3>
          <ol className="divide-y divide-gray-800">
            {g.items.map((i) => (
              <li key={`${i.type}:${i.id}`} className="px-4 py-3 flex gap-3 text-sm">
                <time dateTime={i.at} className="w-16 shrink-0 pt-0.5 text-xs text-gray-500 tabular-nums">
                  {time(i.at)}
                </time>
                <div className="min-w-0 flex-1">
                  <Row item={i} showClient={!engagementId} onOpenRun={setDrawerRun} />
                </div>
              </li>
            ))}
          </ol>
        </div>
      ))}

      {nextBefore && (
        <div className="p-3 border-t border-gray-800">
          <button
            type="button"
            onClick={more}
            disabled={loadingMore}
            className="w-full min-h-[44px] rounded-lg border border-gray-700 bg-gray-800 hover:bg-gray-700 text-sm text-gray-100 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            {loadingMore ? 'Loading…' : 'Load older'}
          </button>
        </div>
      )}
      {drawerRun && <RunDrawer runId={drawerRun} liveEvents={[]} runs={[]} onClose={() => setDrawerRun(null)} onStop={async (id) => void (await fetch(`/api/admin/ops/hq/runs/${id}/cancel`, { method: 'POST' }).catch(() => null))} />}
    </section>
  )
}

function OpenButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className={`${smallButton} min-h-[44px] sm:min-h-[36px]`}>
      Open
    </button>
  )
}

function Row({ item: i, showClient, onOpenRun }: { item: TimelineItem; showClient: boolean; onOpenRun: (id: string) => void }) {
  const clientTag = showClient && i.client ? <span className="text-gray-500"> {i.client}</span> : null

  if (i.type === 'approval') {
    const s = APPROVAL_STATUS[i.status] ?? { label: i.status, tone: 'text-gray-400' }
    const p = personaFor(i.agent)
    return (
      <div className="space-y-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="text-xs text-amber-300">Approval</span>
            {clientTag && <span className="text-xs">{clientTag}</span>}
            <p className="text-gray-100 break-words">{i.title}</p>
          </div>
          {i.applyRunId && <OpenButton label="Open the apply run feed" onClick={() => onOpenRun(i.applyRunId!)} />}
        </div>
        <p className="text-xs tabular-nums flex flex-wrap gap-x-3 gap-y-0.5">
          <span className={s.tone}>{s.label}</span>
          <span className="text-gray-500">proposed by {p?.name ?? i.agent} {when(i.createdAt)}</span>
          {i.decidedAt && (
            <span className="text-gray-500">
              {i.status === 'rejected' ? 'rejected' : 'pushed'}
              {who(i.decidedBy, i.decidedVia)} {when(i.decidedAt)}
            </span>
          )}
          {i.appliedAt && <span className="text-gray-500">applied {when(i.appliedAt)}</span>}
          {i.monthlyCostChange ? <span className="text-gray-400">{costLine(i.monthlyCostChange)}</span> : null}
        </p>
        {i.error && <p className="text-xs text-red-400 break-words">{i.error}</p>}
      </div>
    )
  }

  if (i.type === 'job') {
    return (
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs text-blue-300">Job, {i.runIds.length} run{i.runIds.length === 1 ? '' : 's'}</span>
          <span className={`text-xs ${i.status === 'failed' ? 'text-red-400' : i.status === 'done' ? 'text-gray-500' : 'text-amber-300'}`}>
            {JOB_STATUS[i.status] ?? i.status}
          </span>
        </div>
        <p className="text-gray-100 whitespace-pre-wrap break-words">{i.prompt}</p>
        {i.report ? (
          <details className="group rounded-lg border border-gray-800 bg-gray-950">
            <summary className="cursor-pointer list-none px-3 min-h-[44px] flex items-center justify-between gap-2 text-gray-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-lg">
              <span>Chief&apos;s summary</span>
              <span className="text-xs text-gray-500 group-open:hidden">Show</span>
              <span className="text-xs text-gray-500 hidden group-open:inline">Hide</span>
            </summary>
            <div className="px-3 pb-3 space-y-3 text-gray-300">
              {i.report.text && <Markdown text={i.report.text} />}
              {i.report.sections.length > 0 && <ReportCard job={{ report: i.report as never }} className="" snapshot />}
            </div>
          </details>
        ) : (
          <p className="text-xs text-gray-500">No summary.</p>
        )}
      </div>
    )
  }

  if (i.type === 'run') {
    const p = personaFor(i.agent)
    const dur = i.startedAt ? elapsed(i.startedAt, i.finishedAt ? new Date(i.finishedAt).getTime() : Date.now()) : 'not started'
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex items-center gap-2 flex-wrap">
            {p && <Avatar persona={p} size={20} />}
            <span className="text-gray-100">
              {p?.name ?? i.agent}
              {i.mode === 'apply' ? ' (apply)' : ''}
            </span>
            {clientTag}
            <span className={`text-xs ${RUN_TONE[i.status] ?? 'text-gray-400'}`}>{i.status}</span>
            <span className="text-xs text-gray-500 tabular-nums">{dur}</span>
          </div>
          <OpenButton label={`Open the ${p?.name ?? 'agent'} run feed`} onClick={() => onOpenRun(i.id)} />
        </div>
        {i.error && <p className="text-xs text-red-400 break-words">{i.error}</p>}
      </div>
    )
  }

  const tone = i.kind === 'decision' ? 'text-violet-300' : i.kind === 'status' ? 'text-emerald-300' : 'text-gray-400'
  return (
    <div className="space-y-0.5">
      <span className={`text-xs ${tone}`}>{ACTIVITY_LABEL[i.kind] ?? i.kind}</span>
      {clientTag && <span className="text-xs">{clientTag}</span>}
      <p className="text-gray-200 whitespace-pre-wrap break-words">{i.body}</p>
      {i.followUpAt && <p className="text-xs text-gray-500">follow-up {when(i.followUpAt)}</p>}
    </div>
  )
}
