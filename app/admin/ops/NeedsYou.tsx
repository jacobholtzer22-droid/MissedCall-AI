'use client'

// Needs you: one ranked list from rankNeedsYou (lib/ops/needs-you.ts). Each
// row: client, one line of what, age, and the one action that resolves it
// (Push or Reject, Open, Log contact and Snooze, Showed or No-show). Approvals
// decided in the last 30 minutes stay on top as one line each, uncounted, so a
// push shows Applying, then Applied or Failed (the error on hover). Steps waiting on clients and
// vendors sit at the bottom, collapsed: not Jacob's to do, still in sight.

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ExternalLink, Video } from 'lucide-react'
import type { OpsBoard } from '@/lib/ops/board'
import type { NeedsYouItem, NeedsYouKind, NeedsYouWaiting } from '@/lib/ops/needs-you'
import { formatPhoneNumber } from '@/lib/utils'
import { Age } from '../ui'
import { ApprovalCard } from './HqApprovals'
import type { FeedApproval } from './hqShared'
import { detroitTime, overdueLabel, smallButton, type OpsActions } from './opsUi'

const KIND_LABEL: Record<NeedsYouKind, string> = {
  approval: 'Push',
  red_alert: 'Problem',
  waiting_on_you: 'Your step',
  follow_up: 'Follow-up',
  booking: 'Call today',
  yellow_alert: 'Heads-up',
}

const KIND_TONE: Record<NeedsYouKind, string> = {
  approval: 'text-amber-300',
  red_alert: 'text-red-400',
  waiting_on_you: 'text-orange-300',
  follow_up: 'text-amber-300',
  booking: 'text-blue-300',
  yellow_alert: 'text-gray-400',
}

const FIRST = 15

const OUTCOME: Record<string, { label: string; tone: string }> = {
  approved: { label: 'Applying', tone: 'text-emerald-300' },
  applied: { label: 'Applied', tone: 'text-emerald-400' },
  rejected: { label: 'Rejected', tone: 'text-gray-500' },
  failed: { label: 'Failed', tone: 'text-red-400' },
}

export function NeedsYou({
  items,
  count,
  waitingOnOthers,
  approvals,
  board,
  actions,
  onDecide,
}: {
  items: NeedsYouItem[]
  count: number
  waitingOnOthers: NeedsYouWaiting[]
  approvals: FeedApproval[]
  board: OpsBoard
  actions: OpsActions
  onDecide: (id: string, decision: 'approve' | 'reject') => Promise<string | null>
}) {
  const [all, setAll] = useState(false)
  const recent = approvals.filter((a) => a.status !== 'pending').sort((a, b) => (b.decidedAt ?? '').localeCompare(a.decidedAt ?? ''))
  const shown = all ? items : items.slice(0, FIRST)

  return (
    <section aria-label="Needs you" className="bg-gray-900 border border-gray-800 rounded-lg">
      <div className="px-4 py-3 border-b border-gray-800">
        <h2 className="text-sm font-semibold text-gray-100">
          Needs you
          <span className="ml-2 text-gray-500 font-normal tabular-nums">{count}</span>
        </h2>
      </div>

      {recent.length > 0 && (
        <ul className="px-4 py-2 border-b border-gray-800 space-y-1" aria-label="Decided in the last 30 minutes">
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

      {items.length === 0 ? (
        <p className="px-4 py-6 text-sm text-gray-500">Nothing needs you right now.</p>
      ) : (
        <ol className="divide-y divide-gray-800">
          {shown.map((item) => (
            <li key={item.key} className={item.kind === 'approval' ? 'p-3' : 'px-4 py-3'}>
              {item.kind === 'approval' ? (
                <ApprovalRow item={item} approvals={approvals} onDecide={onDecide} />
              ) : (
                <Row item={item} board={board} actions={actions} />
              )}
            </li>
          ))}
        </ol>
      )}
      {items.length > FIRST && (
        <div className="p-3 border-t border-gray-800">
          <button
            type="button"
            onClick={() => setAll((v) => !v)}
            className="w-full min-h-[44px] rounded-lg border border-gray-700 bg-gray-800 hover:bg-gray-700 text-sm text-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            {all ? 'Show fewer' : `Show ${items.length - FIRST} more`}
          </button>
        </div>
      )}

      <WaitingOnOthers rows={waitingOnOthers} onOpen={actions.openEngagement} />
    </section>
  )
}

function ApprovalRow({
  item,
  approvals,
  onDecide,
}: {
  item: NeedsYouItem
  approvals: FeedApproval[]
  onDecide: (id: string, decision: 'approve' | 'reject') => Promise<string | null>
}) {
  const a = approvals.find((x) => x.id === item.approvalId)
  return a ? <ApprovalCard approval={a} onDecide={onDecide} compact /> : null
}

function Row({ item, board, actions }: { item: NeedsYouItem; board: OpsBoard; actions: OpsActions }) {
  const [busy, setBusy] = useState(false)
  const booking = item.bookingId ? board.bookedToday.find((b) => b.id === item.bookingId) : null
  const snooze = async (days: number) => {
    if (!item.engagementId) return
    setBusy(true)
    await actions.snooze(item.engagementId, days)
    setBusy(false)
  }

  const age =
    item.kind === 'follow_up' && item.at ? (
      <span className="text-amber-300">{overdueLabel(item.at)}</span>
    ) : item.kind === 'booking' && item.at ? (
      detroitTime(item.at)
    ) : item.at ? (
      <Age iso={item.at} />
    ) : null
  // Alerts and steps resolve in the panel: one Open, in the header row.
  const openOnly = item.engagementId && item.kind !== 'follow_up' && item.kind !== 'booking'

  return (
    <div className={`space-y-1.5 ${item.kind === 'booking' && !item.counts ? 'opacity-60' : ''}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <span className={`text-xs ${KIND_TONE[item.kind]}`}>{KIND_LABEL[item.kind]}</span>
          <span className="block text-sm font-medium text-gray-100 truncate">{item.client ?? 'Unnamed'}</span>
        </div>
        <div className="shrink-0 flex items-center gap-2 text-xs text-gray-500 tabular-nums">
          {age}
          {openOnly && (
            <button type="button" onClick={() => actions.openEngagement(item.engagementId!)} className={`${smallButton} min-h-[44px] min-w-[44px]`}>
              Open
            </button>
          )}
        </div>
      </div>
      <p className={`text-sm break-words ${item.kind === 'red_alert' ? 'text-red-300' : 'text-gray-300'}`}>{item.what}</p>

      {(item.kind === 'follow_up' || booking) && (
        <div className="flex flex-wrap items-center gap-2">
          {item.phone && (
            <a href={`tel:${item.phone}`} className="inline-flex items-center min-h-[44px] pr-1 text-xs text-blue-400 tabular-nums">
              {formatPhoneNumber(item.phone)}
            </a>
          )}
          {item.kind === 'follow_up' && item.followUpKind === 'prospect' && (
            <Link href="/admin/pipeline" className={`${smallButton} min-h-[44px]`}>
              Log in pipeline <ExternalLink className="h-3 w-3" />
            </Link>
          )}
          {item.kind === 'follow_up' && item.followUpKind === 'client' && item.engagementId && (
            <>
              <button type="button" onClick={() => actions.openEngagement(item.engagementId!, 'activity')} className={`${smallButton} min-h-[44px]`}>
                Log contact
              </button>
              {[1, 3, 7].map((d) => (
                <button key={d} type="button" disabled={busy} onClick={() => snooze(d)} aria-label={`Snooze ${d} day${d === 1 ? '' : 's'}`} className={`${smallButton} min-h-[44px] min-w-[44px]`}>
                  {d}d
                </button>
              ))}
            </>
          )}
          {booking && (
            <>
              {booking.googleMeetLink && (
                <a href={booking.googleMeetLink} target="_blank" rel="noreferrer" className={`${smallButton} min-h-[44px]`}>
                  <Video className="h-3.5 w-3.5" /> Meet
                </a>
              )}
              {(['showed', 'no_show'] as const).map((v) => {
                const on = booking.showStatus === v
                return (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={on}
                    onClick={() => actions.setShowStatus(booking.id, on ? 'pending' : v)}
                    className={`${smallButton} min-h-[44px] ${
                      on ? (v === 'showed' ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300' : 'border-red-500 bg-red-500/15 text-red-300') : ''
                    }`}
                  >
                    {v === 'showed' ? 'Showed' : 'No-show'}
                  </button>
                )
              })}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function WaitingOnOthers({ rows, onOpen }: { rows: NeedsYouWaiting[]; onOpen: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  if (rows.length === 0) return null
  return (
    <div className="border-t border-gray-800">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 px-4 min-h-[48px] text-sm text-gray-300 hover:bg-gray-800/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 rounded-b-lg"
      >
        <span>
          Waiting on clients and vendors
          <span className="ml-2 text-gray-500 tabular-nums">{rows.length}</span>
        </span>
        <ChevronDown className={`h-4 w-4 text-gray-500 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ul className="pb-2">
          {rows.map((r) => (
            <li key={`${r.engagementId}:${r.type}`}>
              <button
                type="button"
                onClick={() => onOpen(r.engagementId)}
                className="w-full text-left px-4 py-2 min-h-[44px] hover:bg-gray-800/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="text-sm text-gray-100 truncate">{r.client}</span>
                  <span className="shrink-0 text-xs text-gray-500">
                    {r.waitingOn}, <Age iso={r.at} />
                  </span>
                </span>
                <span className="block text-xs text-gray-400 break-words">{r.what}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
