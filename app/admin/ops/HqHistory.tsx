'use client'

// History: OpsJobs newest first (GET /api/admin/ops/hq/jobs), read only. Each
// row: the date, Jacob's original message, the chief's summary (collapsed),
// the runs under it (agent, client, status, duration, Open for the drawer) and
// every approval with its decision and when it was applied. The HQ tab shows
// all jobs; the client panel passes engagementId for that client's jobs only.
// Without onOpenRun the list opens its own RunDrawer (the client panel).

import { useCallback, useEffect, useRef, useState } from 'react'
import { personaFor } from '@/lib/ops/hq/personas'
import { ReportCard } from './HqChat'
import { RunDrawer } from './HqOffice'
import { Avatar, Markdown, elapsed, type FeedJob } from './hqShared'

type HistoryRun = {
  id: string
  agent: string | null
  mode: string | null
  status: string
  error: string | null
  client: string | null
  startedAt: string | null
  finishedAt: string | null
}

type HistoryApproval = {
  id: string
  agent: string
  title: string
  status: string
  error: string | null
  client: string | null
  decidedAt: string | null
  appliedAt: string | null
  createdAt: string
}

type HistoryJob = {
  id: string
  status: string
  prompt: string
  report: FeedJob['report']
  createdAt: string
  runs: HistoryRun[]
  approvals: HistoryApproval[]
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

const RUN_TONE: Record<string, string> = {
  succeeded: 'text-emerald-400',
  failed: 'text-red-400',
  cancelled: 'text-gray-500',
  running: 'text-blue-300',
  queued: 'text-blue-300',
  dispatched: 'text-blue-300',
}

const APPROVAL_STATUS: Record<string, { label: string; tone: string }> = {
  pending: { label: 'Waiting for Push', tone: 'text-amber-300' },
  approved: { label: 'Pushed, applying', tone: 'text-emerald-300' },
  applied: { label: 'Applied', tone: 'text-emerald-400' },
  rejected: { label: 'Rejected', tone: 'text-gray-500' },
  failed: { label: 'Failed', tone: 'text-red-400' },
}

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

function duration(r: HistoryRun): string {
  if (!r.startedAt) return 'not started'
  return elapsed(r.startedAt, r.finishedAt ? new Date(r.finishedAt).getTime() : Date.now())
}

export function History({
  engagementId,
  refreshKey,
  onOpenRun,
  title = 'History',
}: {
  engagementId?: string
  /** Changes when the feed saw a job or approval move; reloads the first page. */
  refreshKey?: string
  onOpenRun?: (runId: string) => void
  title?: string
}) {
  const [jobs, setJobs] = useState<HistoryJob[] | null>(null)
  const [nextBefore, setNextBefore] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [drawerRun, setDrawerRun] = useState<string | null>(null)

  const load = useCallback(
    async (before: string | null) => {
      const q = new URLSearchParams()
      if (engagementId) q.set('engagementId', engagementId)
      if (before) q.set('before', before)
      const res = await fetch(`/api/admin/ops/hq/jobs?${q}`, { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(data.error ?? 'Could not load the history'))
      return data as { jobs: HistoryJob[]; nextBefore: string | null }
    },
    [engagementId]
  )

  // A refresh reloads the first page; older pages already loaded stay, and so
  // does their cursor.
  const olderLoaded = useRef(false)
  useEffect(() => {
    let cancelled = false
    load(null)
      .then((data) => {
        if (cancelled) return
        setError(null)
        const oldest = data.jobs[data.jobs.length - 1]?.createdAt
        setJobs((prev) => {
          if (!prev || !olderLoaded.current || !oldest) return data.jobs
          return [...data.jobs, ...prev.filter((j) => j.createdAt < oldest)]
        })
        if (!olderLoaded.current) setNextBefore(data.nextBefore)
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : 'Could not load the history'))
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
      setJobs((prev) => [...(prev ?? []), ...data.jobs.filter((j) => !(prev ?? []).some((p) => p.id === j.id))])
      setNextBefore(data.nextBefore)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the history')
    } finally {
      setLoadingMore(false)
    }
  }

  const open = onOpenRun ?? setDrawerRun

  const stop = async (runId: string) => {
    await fetch(`/api/admin/ops/hq/runs/${runId}/cancel`, { method: 'POST' }).catch(() => null)
  }

  return (
    <section aria-label={title} className="bg-gray-900 border border-gray-800 rounded-lg">
      <div className="px-4 py-3 border-b border-gray-800">
        <h2 className="text-sm font-semibold text-gray-100">
          {title}
          {jobs && <span className="ml-2 text-gray-500 font-normal tabular-nums">{jobs.length}{nextBefore ? '+' : ''}</span>}
        </h2>
      </div>
      {error && <p className="px-4 pt-3 text-sm text-red-400">{error}</p>}
      {!jobs && !error && <p className="px-4 py-6 text-sm text-gray-500">Loading…</p>}
      {jobs && jobs.length === 0 && (
        <p className="px-4 py-6 text-sm text-gray-500">{engagementId ? 'No HQ jobs for this client yet.' : 'No jobs yet.'}</p>
      )}
      {jobs && jobs.length > 0 && (
        <ol className="divide-y divide-gray-800">
          {jobs.map((j) => (
            <JobRow key={j.id} job={j} onOpenRun={open} />
          ))}
        </ol>
      )}
      {nextBefore && (
        <div className="p-3 border-t border-gray-800">
          <button
            type="button"
            onClick={more}
            disabled={loadingMore}
            className="w-full min-h-[44px] rounded-lg border border-gray-700 bg-gray-800 hover:bg-gray-700 text-sm text-gray-100 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            {loadingMore ? 'Loading…' : 'Load older jobs'}
          </button>
        </div>
      )}
      {!onOpenRun && drawerRun && <RunDrawer runId={drawerRun} liveEvents={[]} runs={[]} onClose={() => setDrawerRun(null)} onStop={stop} />}
    </section>
  )
}

function JobRow({ job: j, onOpenRun }: { job: HistoryJob; onOpenRun: (runId: string) => void }) {
  const report = j.report
  const hasSections = Boolean(report?.sections.length)
  return (
    <li className="px-4 py-3 space-y-2.5 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <time dateTime={j.createdAt} className="text-xs text-gray-500 tabular-nums">
          {when(j.createdAt)}
        </time>
        <span className={`text-xs ${j.status === 'failed' ? 'text-red-400' : j.status === 'done' ? 'text-gray-400' : 'text-amber-300'}`}>
          {JOB_STATUS[j.status] ?? j.status}
        </span>
      </div>
      <p className="text-gray-100 whitespace-pre-wrap break-words">{j.prompt}</p>

      {report ? (
        <details className="group rounded-lg border border-gray-800 bg-gray-950">
          <summary className="cursor-pointer list-none px-3 min-h-[44px] flex items-center justify-between gap-2 text-gray-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-lg">
            <span>Chief&apos;s summary</span>
            <span className="text-xs text-gray-500 group-open:hidden">Show</span>
            <span className="text-xs text-gray-500 hidden group-open:inline">Hide</span>
          </summary>
          <div className="px-3 pb-3 space-y-3 text-gray-300">
            {report.text && <Markdown text={report.text} />}
            {hasSections && <ReportCard job={{ report }} className="" snapshot />}
          </div>
        </details>
      ) : (
        <p className="text-xs text-gray-500">No summary yet.</p>
      )}

      {j.runs.length > 0 && (
        <div>
          <div className="text-xs text-gray-500 mb-1">Runs</div>
          <ul className="space-y-1">
            {j.runs.map((r) => {
              const p = personaFor(r.agent ?? 'web')
              return (
                <li key={r.id} className="flex items-center gap-2 min-w-0">
                  {p && <Avatar persona={p} size={20} />}
                  <div className="min-w-0 flex-1 flex flex-wrap items-baseline gap-x-2">
                    <span className="text-gray-200">
                      {p?.name ?? r.agent ?? 'Agent'}
                      {r.mode === 'apply' ? ' (apply)' : ''}
                    </span>
                    {r.client && <span className="text-gray-500 truncate">{r.client}</span>}
                    <span className={`text-xs ${RUN_TONE[r.status] ?? 'text-gray-400'}`}>{r.status}</span>
                    <span className="text-xs text-gray-500 tabular-nums">{duration(r)}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenRun(r.id)}
                    aria-label={`Open the ${p?.name ?? 'agent'} run feed`}
                    className="shrink-0 px-3 min-h-[44px] rounded-lg text-blue-400 hover:text-blue-300 hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    Open
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {j.approvals.length > 0 && (
        <div>
          <div className="text-xs text-gray-500 mb-1">Approvals</div>
          <ul className="space-y-1.5">
            {j.approvals.map((a) => {
              const s = APPROVAL_STATUS[a.status] ?? { label: a.status, tone: 'text-gray-400' }
              return (
                <li key={a.id} className="rounded-lg border border-gray-800 bg-gray-950 px-3 py-2">
                  <div className="text-gray-200 break-words">{a.title}</div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs tabular-nums">
                    <span className={s.tone}>{s.label}</span>
                    {a.client && <span className="text-gray-500">{a.client}</span>}
                    {a.decidedAt && (
                      <span className="text-gray-500">
                        {a.status === 'rejected' ? 'rejected' : 'pushed'} {when(a.decidedAt)}
                      </span>
                    )}
                    {a.appliedAt && <span className="text-gray-500">applied {when(a.appliedAt)}</span>}
                  </div>
                  {a.error && <p className="mt-1 text-xs text-red-400 break-words">{a.error}</p>}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </li>
  )
}
