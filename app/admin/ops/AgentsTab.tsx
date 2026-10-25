'use client'

// Agents: every AgentRun newest first, from /api/admin/ops/agents. A row
// expands to the run's input (brief or instructions) and the workflow's report
// excerpt. "Sync workflow to all repos" runs dry first, lists what each repo
// would get, then asks for the mode (PR or direct) and confirms.

import { Fragment, useCallback, useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react'
import type { OpsBoard } from '@/lib/ops/board'
import { Age } from '../ui'
import { Empty, Section, smallButton, type OpsActions } from './opsUi'

const STATUS_TONE: Record<string, string> = {
  queued: 'text-gray-400',
  dispatched: 'text-blue-300',
  running: 'text-amber-300',
  succeeded: 'text-emerald-400',
  failed: 'text-red-400',
  cancelled: 'text-gray-500',
}

type Run = {
  id: string
  engagementId: string
  engagementName: string
  kind: string
  status: string
  input: Record<string, unknown>
  output: Record<string, unknown>
  externalId: string | null
  error: string | null
  startedAt: string | null
  finishedAt: string | null
  createdAt: string
  previewUrl: string | null
  previewState: string | null
  previewBranch: string | null
}

type SyncRepo = { engagement: string; repo: string; adds: string[]; prUrl?: string; commitSha?: string; errors: string[] }
type SyncResult = { dry: boolean; mode: 'pr' | 'direct'; blocked: string[]; repos: SyncRepo[]; skipped: { engagement: string; reason: string }[] }

const isUrl = (v: unknown): v is string => typeof v === 'string' && /^https?:\/\//.test(v)

function RunLink({ href, label }: { href: unknown; label: string }) {
  return isUrl(href) ? (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 text-xs">
      {label} <ExternalLink className="h-3 w-3" />
    </a>
  ) : null
}

export function AgentsTab({ board, actions }: { board: OpsBoard; actions: OpsActions }) {
  const [runs, setRuns] = useState<Run[] | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/ops/agents', { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (res.ok) setRuns(data.runs ?? [])
      else actions.toast(String(data.error ?? 'Could not load agent runs'), 'error')
    } catch {
      actions.toast('Could not load agent runs', 'error')
    }
  }, [actions])

  // Refetch whenever the board reloads (a dispatch or callback changes it).
  useEffect(() => {
    void load()
  }, [load, board])

  return (
    <div className="space-y-6">
      <SyncAll toast={actions.toast} onDone={load} />
      <Section title="Agent runs" count={runs?.length ?? board.agentRuns.length}>
        {runs === null ? (
          <Empty>Loading…</Empty>
        ) : runs.length === 0 ? (
          <Empty>No runs yet. Dispatch one from a client&apos;s website card.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-800">
                  <th className="px-3 py-2 font-medium" />
                  <th className="px-3 py-2 font-medium">Kind</th>
                  <th className="px-3 py-2 font-medium">Client</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Started</th>
                  <th className="px-3 py-2 font-medium">Finished</th>
                  <th className="px-3 py-2 font-medium">Links</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {runs.map((r) => {
                  const expanded = open === r.id
                  // The preview link is the client's current branch preview, so only show it on the run that produced that branch.
                  const preview = r.previewBranch && r.output.branch === r.previewBranch ? r.previewUrl : null
                  return (
                    <Fragment key={r.id}>
                      <tr>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            aria-label={expanded ? 'Collapse run' : 'Expand run'}
                            onClick={() => setOpen(expanded ? null : r.id)}
                            className="text-gray-500 hover:text-gray-200"
                          >
                            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-gray-300">{r.kind}</td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => actions.openEngagement(r.engagementId)}
                            className="text-gray-100 hover:text-blue-300 text-left"
                          >
                            {r.engagementName}
                          </button>
                        </td>
                        <td className={`px-3 py-2 ${STATUS_TONE[r.status] ?? 'text-gray-300'}`} title={r.error ?? undefined}>
                          {r.status}
                        </td>
                        <td className="px-3 py-2 text-gray-400">
                          <Age iso={r.startedAt} />
                        </td>
                        <td className="px-3 py-2 text-gray-400">
                          <Age iso={r.finishedAt} />
                        </td>
                        <td className="px-3 py-2">
                          <span className="flex gap-3">
                            <RunLink href={r.output.prUrl} label="PR" />
                            <RunLink href={preview} label={r.previewState ? `Preview (${r.previewState.toLowerCase()})` : 'Preview'} />
                            <RunLink href={r.output.runUrl ?? r.externalId} label="Run" />
                          </span>
                        </td>
                      </tr>
                      {expanded && (
                        <tr>
                          <td />
                          <td colSpan={6} className="px-3 pb-3 space-y-2 text-xs">
                            {r.error && <p className="text-red-300">Error: {r.error}</p>}
                            <RunDetail title="Input" text={describeInput(r.input)} />
                            <RunDetail
                              title={`Report${r.output.verifyPassed === false ? ' (gate failed)' : r.output.verifyPassed === true ? ' (gate passed)' : ''}`}
                              text={typeof r.output.reportExcerpt === 'string' && r.output.reportExcerpt ? r.output.reportExcerpt : 'No report yet.'}
                            />
                            {Array.isArray(r.output.failingChecks) && r.output.failingChecks.length > 0 && (
                              <p className="text-red-300">Failing: {(r.output.failingChecks as string[]).join(', ')}</p>
                            )}
                            {typeof r.output.branch === 'string' && <p className="text-gray-500">Branch: {r.output.branch}</p>}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  )
}

function describeInput(input: Record<string, unknown>): string {
  const text = input.brief ?? input.instructions
  const head = [input.repo ? `repo ${String(input.repo)}` : null].filter(Boolean).join('\n')
  return [head, typeof text === 'string' ? text : null].filter(Boolean).join('\n\n') || 'No input recorded.'
}

function RunDetail({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <p className="text-gray-500 mb-1">{title}</p>
      <pre className="whitespace-pre-wrap break-words rounded bg-gray-900 p-2 text-gray-300 max-h-64 overflow-y-auto">{text}</pre>
    </div>
  )
}

async function postSync(body: unknown): Promise<{ ok: boolean; data: SyncResult & { error?: string } }> {
  try {
    const res = await fetch('/api/admin/ops/agents/sync-workflow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return { ok: res.ok, data: await res.json().catch(() => ({})) }
  } catch {
    return { ok: false, data: { error: 'Network error' } as SyncResult & { error: string } }
  }
}

function SyncAll({ toast, onDone }: { toast: OpsActions['toast']; onDone: () => Promise<void> }) {
  const [plan, setPlan] = useState<SyncResult | null>(null)
  const [mode, setMode] = useState<'pr' | 'direct'>('pr')
  const [busy, setBusy] = useState(false)

  const preview = async () => {
    setBusy(true)
    const r = await postSync({ mode, dry: true })
    setBusy(false)
    if (!r.ok && !r.data.repos) return toast(String(r.data.error ?? 'Dry run failed'), 'error')
    setPlan(r.data)
  }
  const apply = async () => {
    if (!plan) return
    const how = mode === 'pr' ? `open a PR (branch ci/aa-build) on` : `commit straight to the default branch of`
    if (!window.confirm(`Set the two Actions secrets and ${how} ${plan.repos.length} repo${plan.repos.length === 1 ? '' : 's'}?`)) return
    setBusy(true)
    const r = await postSync({ mode, dry: false })
    setBusy(false)
    if (!r.data.repos) return toast(String(r.data.error ?? 'Sync failed'), 'error')
    setPlan(r.data)
    const failed = r.data.repos.filter((x) => x.errors.length > 0).length
    toast(`Workflow synced to ${r.data.repos.length - failed} repo${r.data.repos.length - failed === 1 ? '' : 's'}${failed ? `, ${failed} failed` : ''}`, failed ? 'error' : 'success')
    await onDone()
  }

  return (
    <Section title="Workflow in client repos">
      <div className="space-y-3 px-4 py-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={busy} onClick={preview} className={smallButton}>
            {busy && !plan?.dry ? 'Checking…' : 'Sync workflow to all repos (dry run)'}
          </button>
          {plan?.dry && plan.blocked.length === 0 && plan.repos.length > 0 && (
            <>
              <select
                aria-label="Sync mode"
                value={mode}
                onChange={(ev) => setMode(ev.target.value as 'pr' | 'direct')}
                className="rounded-md border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-gray-200"
              >
                <option value="pr">Open a PR per repo</option>
                <option value="direct">Commit to the default branch</option>
              </select>
              <button type="button" disabled={busy} onClick={apply} className={`${smallButton} border-blue-600 text-blue-200`}>
                {busy ? 'Syncing…' : 'Apply'}
              </button>
            </>
          )}
        </div>
        {plan && (
          <div className="space-y-2 text-xs">
            <p className="text-gray-500">{plan.dry ? 'Dry run, nothing written.' : `Applied (${plan.mode}).`}</p>
            {plan.blocked.map((b) => (
              <p key={b} className="text-red-300">
                Blocked: {b}
              </p>
            ))}
            {plan.repos.length === 0 && <p className="text-gray-400">No repo needs the workflow.</p>}
            <ul className="space-y-1">
              {plan.repos.map((r) => (
                <li key={r.repo} className="text-gray-300">
                  <span className="text-gray-100">{r.engagement}</span> · {r.repo}: {r.adds.join(', ')}
                  {r.prUrl && (
                    <>
                      {' '}
                      <RunLink href={r.prUrl} label="PR" />
                    </>
                  )}
                  {r.errors.length > 0 && <span className="text-red-300"> ✗ {r.errors.join('; ')}</span>}
                </li>
              ))}
            </ul>
            {plan.skipped.length > 0 && (
              <details>
                <summary className="cursor-pointer text-gray-500">Skipped ({plan.skipped.length})</summary>
                <ul className="mt-1 space-y-0.5 text-gray-500">
                  {plan.skipped.map((s) => (
                    <li key={s.engagement}>
                      {s.engagement}: {s.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </div>
    </Section>
  )
}
