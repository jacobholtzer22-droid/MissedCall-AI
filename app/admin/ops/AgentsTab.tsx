'use client'

// Agents: the AgentRun log, newest first. Read only in this branch; dispatch
// arrives with the first agent.

import { ExternalLink } from 'lucide-react'
import type { OpsBoard } from '@/lib/ops/board'
import { Age } from '../ui'
import { Empty, Section, type OpsActions } from './opsUi'

const STATUS_TONE: Record<string, string> = {
  queued: 'text-gray-400',
  dispatched: 'text-blue-300',
  running: 'text-amber-300',
  succeeded: 'text-emerald-400',
  failed: 'text-red-400',
  cancelled: 'text-gray-500',
}

const LINK_KEYS = [
  { key: 'prUrl', label: 'PR' },
  { key: 'previewUrl', label: 'Preview' },
  { key: 'runUrl', label: 'Run' },
] as const

export function AgentsTab({ board, actions }: { board: OpsBoard; actions: OpsActions }) {
  const runs = board.agentRuns
  return (
    <Section title="Agent runs" count={runs.length}>
      {runs.length === 0 ? (
        <Empty>No runs yet. Site builds arrive with the first agent.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-800">
                <th className="px-3 py-2 font-medium">Kind</th>
                <th className="px-3 py-2 font-medium">Client</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Started</th>
                <th className="px-3 py-2 font-medium">Finished</th>
                <th className="px-3 py-2 font-medium">Links</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {runs.map((r) => (
                <tr key={r.id}>
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
                      {LINK_KEYS.map(({ key, label }) => {
                        const href = r.output?.[key]
                        return typeof href === 'string' && /^https?:\/\//.test(href) ? (
                          <a key={key} href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 text-xs">
                            {label} <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : null
                      })}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  )
}
