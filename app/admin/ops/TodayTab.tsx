'use client'

// Today: what needs Jacob now. Four blocks, in this order: red alerts, follow-ups
// due (clients and pipeline prospects), demo calls booked today, yellow alerts
// grouped by code.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ExternalLink, Video } from 'lucide-react'
import type { OpsBoard } from '@/lib/ops/board'
import type { OpsAlertCode } from '@/lib/ops/alerts'
import { formatPhoneNumber } from '@/lib/utils'
import { HealthDot } from '../ui'
import { Empty, Section, StagePill, detroitTime, overdueLabel, smallButton, type OpsActions } from './opsUi'

const ALERT_LABELS: Record<OpsAlertCode, string> = {
  no_subscription: 'Paid upfront, no subscription',
  past_due: 'Past due',
  deliverable_blocked: 'Deliverable blocked',
  stripe_unlinked: 'No Stripe customer linked',
  status_mismatch: 'Platform and Stripe disagree',
  no_platform_account: 'No platform account',
  onboarding_stale: 'Onboarding stale',
  follow_up_due: 'Follow-up due',
  no_owner_contact: 'Owner contact missing',
}

const SHOW_BUTTONS = [
  { value: 'showed', label: 'Showed' },
  { value: 'no_show', label: 'No-show' },
] as const

export function TodayTab({ board, actions }: { board: OpsBoard; actions: OpsActions }) {
  const needsYou = useMemo(
    () =>
      board.engagements
        .map((e) => ({ e, red: e.alerts.filter((a) => a.severity === 'red') }))
        .filter((r) => r.red.length > 0)
        .sort((a, b) => b.red.length - a.red.length || a.e.createdAt.localeCompare(b.e.createdAt)),
    [board.engagements]
  )

  const yellowGroups = useMemo(() => {
    const groups = new Map<OpsAlertCode, { id: string; name: string; message: string }[]>()
    for (const e of board.engagements) {
      for (const a of e.alerts) {
        if (a.severity !== 'yellow') continue
        const list = groups.get(a.code) ?? []
        list.push({ id: e.id, name: e.displayName, message: a.message })
        groups.set(a.code, list)
      }
    }
    return Array.from(groups.entries()).sort((a, b) => b[1].length - a[1].length)
  }, [board.engagements])

  return (
    <div className="space-y-5">
      {/* a. Needs you */}
      <Section title="Needs you" count={needsYou.length}>
        {needsYou.length === 0 ? (
          <Empty>No red alerts.</Empty>
        ) : (
          <ul className="divide-y divide-gray-800">
            {needsYou.map(({ e, red }) => (
              <li key={e.id} className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-3">
                <div className="flex items-center gap-2 min-w-0 sm:w-64 shrink-0">
                  <HealthDot health={e.health} />
                  <span className="truncate text-sm font-medium text-gray-100">{e.displayName}</span>
                  <StagePill stage={e.stage} />
                </div>
                <div className="flex-1 min-w-0 text-sm text-red-300">{red.map((a) => a.message).join(' · ')}</div>
                <button type="button" onClick={() => actions.openEngagement(e.id)} className={smallButton}>
                  Open
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* b. Follow-ups due */}
      <Section title="Follow-ups due" count={board.followUpsDue.length}>
        {board.followUpsDue.length === 0 ? (
          <Empty>Nothing due.</Empty>
        ) : (
          <ul className="divide-y divide-gray-800">
            {board.followUpsDue.map((f) => (
              <FollowUpRow key={`${f.kind}:${f.id}`} f={f} actions={actions} />
            ))}
          </ul>
        )}
      </Section>

      {/* c. Booked today */}
      <Section title="Booked today" count={board.bookedToday.length}>
        {board.bookedToday.length === 0 ? (
          <Empty>No demo calls today.</Empty>
        ) : (
          <ul className="divide-y divide-gray-800">
            {board.bookedToday.map((b) => (
              <li key={b.id} className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span className="w-20 shrink-0 text-sm font-semibold tabular-nums text-gray-100">{detroitTime(b.scheduledAt)}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-gray-100">
                      {b.customerName}
                      {b.status === 'cancelled' && <span className="ml-2 text-xs text-gray-500">(calendar: cancelled)</span>}
                    </span>
                    <a href={`tel:${b.customerPhone}`} className="text-xs text-blue-400 tabular-nums">
                      {formatPhoneNumber(b.customerPhone)}
                    </a>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {b.googleMeetLink && (
                    <a href={b.googleMeetLink} target="_blank" rel="noreferrer" className={smallButton}>
                      <Video className="h-3.5 w-3.5" /> Meet
                    </a>
                  )}
                  {SHOW_BUTTONS.map((s) => {
                    const on = b.showStatus === s.value
                    return (
                      <button
                        key={s.value}
                        type="button"
                        aria-pressed={on}
                        onClick={() => actions.setShowStatus(b.id, on ? 'pending' : s.value)}
                        className={`${smallButton} ${
                          on ? (s.value === 'showed' ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300' : 'border-red-500 bg-red-500/15 text-red-300') : ''
                        }`}
                      >
                        {s.label}
                      </button>
                    )
                  })}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* d. Yellow alerts */}
      <Section title="Yellow alerts" count={yellowGroups.reduce((n, [, l]) => n + l.length, 0)}>
        {yellowGroups.length === 0 ? (
          <Empty>No yellow alerts.</Empty>
        ) : (
          <ul className="divide-y divide-gray-800">
            {yellowGroups.map(([code, list]) => (
              <YellowGroup key={code} label={ALERT_LABELS[code] ?? code} list={list} onOpen={actions.openEngagement} />
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}

function FollowUpRow({ f, actions }: { f: OpsBoard['followUpsDue'][number]; actions: OpsActions }) {
  const [busy, setBusy] = useState(false)
  const snooze = async (days: number) => {
    setBusy(true)
    await actions.snooze(f.id, days)
    setBusy(false)
  }
  return (
    <li className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-3">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span
          className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] border ${
            f.kind === 'client' ? 'border-blue-500/30 text-blue-300 bg-blue-500/10' : 'border-violet-500/30 text-violet-300 bg-violet-500/10'
          }`}
        >
          {f.kind}
        </span>
        <span className="truncate text-sm text-gray-100">{f.name}</span>
        {f.phone && (
          <a href={`tel:${f.phone}`} className="shrink-0 text-xs text-blue-400 tabular-nums">
            {formatPhoneNumber(f.phone)}
          </a>
        )}
        <span className="shrink-0 text-xs text-amber-300">{overdueLabel(f.dueAt)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {f.kind === 'client' ? (
          <>
            <button type="button" onClick={() => actions.openEngagement(f.id, 'activity')} className={smallButton}>
              Log contact
            </button>
            {[1, 3, 7].map((d) => (
              <button key={d} type="button" disabled={busy} onClick={() => snooze(d)} className={smallButton}>
                {d}d
              </button>
            ))}
          </>
        ) : (
          <Link href="/admin/pipeline" className={smallButton}>
            Log in pipeline <ExternalLink className="h-3 w-3" />
          </Link>
        )}
      </div>
    </li>
  )
}

function YellowGroup({
  label,
  list,
  onOpen,
}: {
  label: string
  list: { id: string; name: string; message: string }[]
  onOpen: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 px-4 min-h-[48px] text-sm text-gray-200 hover:bg-gray-800/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
      >
        <span>
          {label}
          <span className="ml-2 text-amber-300 tabular-nums">{list.length}</span>
        </span>
        <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ul className="pb-2">
          {list.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onOpen(r.id)}
                className="w-full text-left px-6 py-2 text-sm hover:bg-gray-800/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
              >
                <span className="text-gray-100">{r.name}</span>
                <span className="ml-2 text-xs text-gray-500">{r.message}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}
