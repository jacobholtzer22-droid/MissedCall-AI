'use client'

// A client shown like an agent: health dot, name, stage, services, a one-line
// status, what is waiting and on whom, the ads state, last contact, next
// follow-up and the monthly amount (only with revenue shown). While an HQ
// agent runs for this client the card carries the desks' green pulse and
// "Ads is working". The whole card is one button that opens the panel. The
// status line is the newest 'status' activity, else derived from the oldest
// open step (shown dimmer).

import type { ReactNode } from 'react'
import Link from 'next/link'
import type { BoardEngagement } from '@/lib/ops/board'
import { adsState, derivedStatusLine, waitingLine } from '@/lib/ops/client-status'
import { Age, HealthDot } from '../ui'
import { StagePill, detroitDate, money } from './opsUi'

export function ClientCard({
  e,
  working,
  showRevenue,
  onOpen,
  extra,
}: {
  e: BoardEngagement
  /** Name of the agent running for this client now, or null. */
  working: string | null
  showRevenue: boolean
  onOpen: (id: string) => void
  /** Extra rows at the bottom (the Clients roster adds deliverable chips and Stripe status). */
  extra?: ReactNode
}) {
  const status = e.statusLine ?? derivedStatusLine(e)
  const waiting = waitingLine(e)
  const ads = adsState(e)
  const due = e.nextFollowUpAt && new Date(e.nextFollowUpAt) <= new Date()
  return (
    <div>
    <button
      type="button"
      onClick={() => onOpen(e.id)}
      className={`w-full text-left bg-gray-900 border rounded-lg p-3 space-y-1.5 min-h-[44px] hover:bg-gray-800/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
        working ? 'border-emerald-500/40' : 'border-gray-800'
      } ${e.stage === 'ignored' ? 'opacity-60' : ''}`}
    >
      <span className="flex items-center gap-2 min-w-0">
        <HealthDot health={e.health} />
        <span className="flex-1 min-w-0 truncate text-sm font-medium text-gray-100">{e.displayName}</span>
        <StagePill stage={e.stage} />
      </span>

      {working && (
        <span className="flex items-center gap-1.5 text-xs text-emerald-300">
          <span className="hq-pulse h-1.5 w-1.5 rounded-full bg-emerald-400" />
          {working} is working
        </span>
      )}

      {/* A status someone set reads brighter than the one derived from the steps. */}
      <span className={`block text-sm break-words ${e.statusLine ? 'text-gray-100' : 'text-gray-400'}`}>{status}</span>
      {waiting && <span className="block text-xs text-gray-400 break-words">{waiting}</span>}

      <span className="flex flex-wrap items-center gap-1">
        {e.services.map((s) => (
          <span key={s} className="px-1.5 py-0.5 rounded-full border border-gray-700 text-[11px] text-gray-400">
            {s}
          </span>
        ))}
        {ads && (
          <span
            className={`px-1.5 py-0.5 rounded-full border text-[11px] ${
              ads.startsWith('Running') ? 'border-emerald-500/30 text-emerald-300' : ads === 'Account needed' ? 'border-orange-500/40 text-orange-300' : 'border-gray-700 text-gray-300'
            }`}
          >
            Ads: {ads}
          </span>
        )}
      </span>

      <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500 tabular-nums">
        <span>
          contact <Age iso={e.lastContactedAt} />
        </span>
        {e.nextFollowUpAt && <span className={due ? 'text-amber-300' : ''}>follow-up {detroitDate(e.nextFollowUpAt)}</span>}
        {showRevenue && e.monthlyAmount != null && <span className="text-gray-300">{money(e.monthlyAmount)}/mo</span>}
      </span>
      {extra}
    </button>
    {e.services.includes('website') && (
      <Link
        href={`/admin/ops/intake/${e.id}`}
        className="inline-flex items-center min-h-[44px] px-1 text-xs text-blue-400 hover:text-blue-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
      >
        Intake: info and photos for the site
      </Link>
    )}
    </div>
  )
}
