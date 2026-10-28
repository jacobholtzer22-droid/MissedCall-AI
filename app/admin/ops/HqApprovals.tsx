'use client'

// Waiting for you: approval cards newest first. Pending cards carry Push and
// Reject; after Push the card follows the approval through the feed poll:
// Applying… (approved, the apply run is working), then Applied or the error.
// Cards decided in the last 30 minutes stay so the outcome is visible.

import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { personaFor } from '@/lib/ops/hq/personas'
import { adsAccountUrl } from '@/lib/ops/hq/links'
import { Avatar, costLine, type FeedApproval } from './hqShared'

export function Approvals({
  approvals,
  onDecide,
}: {
  approvals: FeedApproval[]
  onDecide: (id: string, decision: 'approve' | 'reject') => Promise<string | null>
}) {
  const pending = approvals.filter((a) => a.status === 'pending').length
  return (
    <section aria-label="Waiting for you" className="bg-gray-900 border border-gray-800 rounded-lg">
      <div className="px-4 py-3 border-b border-gray-800">
        <h2 className="text-sm font-semibold text-gray-100">
          Waiting for you
          <span className="ml-2 text-gray-500 font-normal tabular-nums">{pending}</span>
        </h2>
      </div>
      {approvals.length === 0 ? (
        <p className="px-4 py-6 text-sm text-gray-500">Nothing waits for your Push.</p>
      ) : (
        <div className="p-3 space-y-3">
          {approvals.map((a) => (
            <ApprovalCard key={a.id} approval={a} onDecide={onDecide} />
          ))}
        </div>
      )}
    </section>
  )
}

function argLines(args: unknown): [string, string][] {
  if (!args || typeof args !== 'object') return []
  return Object.entries(args as Record<string, unknown>).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)])
}

/** compact (Home's Needs you): title, cost and the buttons; the exact change sits behind Details. */
export function ApprovalCard({
  approval: a,
  onDecide,
  compact = false,
}: {
  approval: FeedApproval
  onDecide: (id: string, decision: 'approve' | 'reject') => Promise<string | null>
  compact?: boolean
}) {
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const persona = personaFor(a.agent)
  const d = a.detail ?? {}
  const customerId = typeof d.customerId === 'string' ? d.customerId : null
  const links = [
    customerId ? { label: 'Google Ads account', url: adsAccountUrl(customerId) } : null,
    typeof d.prUrl === 'string' ? { label: 'Pull request', url: d.prUrl } : null,
    typeof d.previewUrl === 'string' ? { label: 'Preview', url: d.previewUrl } : null,
  ].filter((l): l is { label: string; url: string } => Boolean(l && /^https?:\/\//.test(l.url)))

  const decide = async (decision: 'approve' | 'reject') => {
    setBusy(decision)
    setError(null)
    const err = await onDecide(a.id, decision)
    setBusy(null)
    if (err) setError(err)
  }

  const details = (
    <>
      {typeof d.action === 'string' && (
        <div className="rounded-lg border border-gray-800 bg-gray-900 px-3 py-2">
          <div className="font-mono text-[12px] text-gray-200">{d.action}</div>
          {argLines(d.args).map(([k, v]) => (
            <div key={k} className="text-xs text-gray-400 break-words">
              {k}: <span className="text-gray-200 tabular-nums">{v}</span>
            </div>
          ))}
        </div>
      )}

      {(a.expected || typeof d.why === 'string') && (
        <div className="space-y-1 text-gray-300">
          {typeof d.why === 'string' && d.why && <p className="text-gray-400">{d.why}</p>}
          {a.expected && (
            <p>
              <span className="text-gray-500">Expected: </span>
              {a.expected}
            </p>
          )}
        </div>
      )}

      {links.length > 0 && (
        <div className="flex flex-wrap gap-x-4">
          {links.map((l) => (
            <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 min-h-[44px] text-blue-400 hover:text-blue-300">
              {l.label} <ExternalLink className="h-3 w-3" />
            </a>
          ))}
        </div>
      )}
    </>
  )

  return (
    <article className="rounded-lg border border-gray-800 bg-gray-950 p-3 space-y-3 text-sm">
      <div className="flex items-start gap-3 min-w-0">
        {persona && <Avatar persona={persona} size={28} />}
        <div className="min-w-0 flex-1">
          <div className="text-xs text-gray-500 truncate">
            {persona?.name ?? a.agent}
            {a.client ? `, ${a.client}` : ''}
          </div>
          <h3 className="font-medium text-gray-100 break-words">{a.title}</h3>
        </div>
      </div>

      {compact ? (
        <>
          <p className="text-gray-200 tabular-nums">{costLine(d.monthlyCostChange)}</p>
          <details className="rounded-lg border border-gray-800">
            <summary className="cursor-pointer list-none px-3 min-h-[44px] flex items-center text-xs text-gray-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-lg">Details</summary>
            <div className="px-3 pb-3 space-y-3">{details}</div>
          </details>
        </>
      ) : (
        <>
          {details}
          <p className="text-gray-200 tabular-nums">{costLine(d.monthlyCostChange)}</p>
        </>
      )}

      {a.status === 'pending' ? (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => decide('approve')}
            className="min-h-[44px] rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
          >
            {busy === 'approve' ? 'Pushing…' : 'Push'}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => decide('reject')}
            className="min-h-[44px] rounded-lg border border-gray-700 bg-gray-800 hover:bg-gray-700 text-gray-100 font-medium disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            {busy === 'reject' ? 'Rejecting…' : 'Reject'}
          </button>
        </div>
      ) : (
        <Outcome status={a.status} error={a.error} />
      )}
      {error && <p className="text-red-400 text-xs">{error}</p>}
    </article>
  )
}

function Outcome({ status, error }: { status: string; error: string | null }) {
  if (status === 'approved')
    return (
      <p className="flex items-center gap-2 min-h-[44px] text-emerald-300">
        <span className="hq-pulse h-1.5 w-1.5 rounded-full bg-emerald-400" /> Applying…
      </p>
    )
  if (status === 'applied') return <p className="min-h-[44px] flex items-center text-emerald-400 font-medium">Applied</p>
  if (status === 'rejected') return <p className="min-h-[44px] flex items-center text-gray-500">Rejected</p>
  return <p className="min-h-[44px] flex items-center text-red-400 break-words">Failed{error ? `: ${error}` : ''}</p>
}
