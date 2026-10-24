'use client'

// Clients: the unmatched-Stripe strip, then one row per engagement with
// filters and sort. A table from 768px up, cards below it.

import { useMemo, useState } from 'react'
import { ChevronDown, RefreshCw } from 'lucide-react'
import type { BoardEngagement, OpsBoard } from '@/lib/ops/board'
import type { UnmatchedPayingCustomer } from '@/lib/ops/sync'
import { DELIVERABLE_TYPES, DELIVERABLE_TYPES_FOR_SERVICE, SERVICE_KEYS, STAGE_ORDER, type DeliverableType, type ServiceKey } from '@/lib/ops/types'
import { Age, HealthDot } from '../ui'
import { EngagementPicker } from './Pickers'
import {
  DeliverableChip,
  STAGE_LABELS,
  StagePill,
  StripeStatusPill,
  control,
  detroitDate,
  money,
  smallButton,
  type OpsActions,
} from './opsUi'

type SortKey = 'health' | 'name' | 'stage' | 'follow_up'
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'health', label: 'Health' },
  { key: 'name', label: 'Name' },
  { key: 'stage', label: 'Stage' },
  { key: 'follow_up', label: 'Follow-up' },
]
const HEALTH_ORDER: Record<string, number> = { red: 0, yellow: 1, green: 2, gray: 3 }

/** Which of the six deliverable columns this client actually bought. */
function boughtTypes(e: BoardEngagement): Set<DeliverableType> {
  return new Set(
    e.services.flatMap((s) => DELIVERABLE_TYPES_FOR_SERVICE[s as ServiceKey] ?? [])
  )
}

function Chips({ e }: { e: BoardEngagement }) {
  const bought = boughtTypes(e)
  return (
    <span className="inline-flex flex-wrap gap-1">
      {DELIVERABLE_TYPES.map((t) => {
        const d = e.deliverables.find((x) => x.type === t)
        return (
          <DeliverableChip
            key={t}
            type={t}
            status={d?.effectiveStatus ?? null}
            dim={!bought.has(t) && !d}
            manual={Boolean(d?.manualStatus)}
            view={d}
          />
        )
      })}
    </span>
  )
}

export function ClientsTab({
  board,
  actions,
  unmatched,
  unmatchedLoading,
  onLoadUnmatched,
}: {
  board: OpsBoard
  actions: OpsActions
  unmatched: UnmatchedPayingCustomer[] | null
  unmatchedLoading: boolean
  onLoadUnmatched: (refresh?: boolean) => void
}) {
  const [stage, setStage] = useState('all')
  const [service, setService] = useState('all')
  const [health, setHealth] = useState('all')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<SortKey>('health')
  const [showIgnored, setShowIgnored] = useState(false)

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const digits = needle.replace(/\D/g, '')
    const list = [...board.engagements, ...(showIgnored ? board.ignored : [])]
      .filter((e) => stage === 'all' || e.stage === stage)
      .filter((e) => service === 'all' || e.services.includes(service))
      .filter((e) => health === 'all' || e.health === health)
      .filter(
        (e) =>
          !needle ||
          e.displayName.toLowerCase().includes(needle) ||
          (e.email ?? '').toLowerCase().includes(needle) ||
          (digits.length >= 3 && (e.phone ?? '').replace(/\D/g, '').includes(digits))
      )
    const byName = (a: BoardEngagement, b: BoardEngagement) => a.displayName.localeCompare(b.displayName)
    const stageRank = (s: string) => (STAGE_ORDER as readonly string[]).indexOf(s)
    return list.sort((a, b) => {
      switch (sort) {
        case 'name':
          return byName(a, b)
        case 'stage':
          return stageRank(a.stage) - stageRank(b.stage) || byName(a, b)
        case 'follow_up':
          if (!a.nextFollowUpAt && !b.nextFollowUpAt) return byName(a, b)
          if (!a.nextFollowUpAt) return 1
          if (!b.nextFollowUpAt) return -1
          return a.nextFollowUpAt.localeCompare(b.nextFollowUpAt)
        default:
          return (
            (HEALTH_ORDER[a.health] ?? 9) - (HEALTH_ORDER[b.health] ?? 9) ||
            b.alerts.length - a.alerts.length ||
            byName(a, b)
          )
      }
    })
  }, [board.engagements, board.ignored, stage, service, health, q, sort, showIgnored])

  return (
    <div className="space-y-4">
      <UnmatchedStrip
        board={board}
        actions={actions}
        customers={unmatched}
        loading={unmatchedLoading}
        onLoad={onLoadUnmatched}
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          placeholder="Search name, email, phone"
          aria-label="Search clients"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className={`${control} flex-1 min-w-[180px] sm:flex-none sm:w-64 placeholder-gray-500`}
        />
        <select aria-label="Stage" value={stage} onChange={(e) => setStage(e.target.value)} className={control}>
          <option value="all">All stages</option>
          {STAGE_ORDER.filter((s) => s !== 'ignored' || showIgnored).map((s) => (
            <option key={s} value={s}>
              {STAGE_LABELS[s]}
            </option>
          ))}
        </select>
        <select aria-label="Service" value={service} onChange={(e) => setService(e.target.value)} className={control}>
          <option value="all">All services</option>
          {SERVICE_KEYS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select aria-label="Health" value={health} onChange={(e) => setHealth(e.target.value)} className={control}>
          <option value="all">Any health</option>
          <option value="red">Red</option>
          <option value="yellow">Yellow</option>
          <option value="green">Green</option>
          <option value="gray">Gray</option>
        </select>
        <label className="inline-flex items-center gap-2 text-sm text-gray-400 min-h-[44px]">
          <span className="sr-only sm:not-sr-only">Sort</span>
          <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className={control}>
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-gray-400 min-h-[44px] px-1 cursor-pointer">
          <input
            type="checkbox"
            checked={showIgnored}
            onChange={(e) => setShowIgnored(e.target.checked)}
            className="h-4 w-4 rounded border-gray-700 bg-gray-900 accent-blue-500"
          />
          Show ignored ({board.ignored.length})
        </label>
        <span className="text-xs text-gray-500">
          {rows.length} of {board.engagements.length + (showIgnored ? board.ignored.length : 0)}
        </span>
      </div>

      {rows.length === 0 && <p className="text-sm text-gray-500 px-1">No clients match these filters.</p>}

      {/* Table, 768px and up */}
      {rows.length > 0 && (
        <div className="hidden md:block bg-gray-900 border border-gray-800 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-800">
                <th className="px-3 py-2 font-medium">Client</th>
                <th className="px-3 py-2 font-medium">Stage</th>
                <th className="px-3 py-2 font-medium">Deliverables</th>
                <th className="px-3 py-2 font-medium text-right">Monthly</th>
                <th className="px-3 py-2 font-medium">Stripe</th>
                <th className="px-3 py-2 font-medium">Follow-up</th>
                <th className="px-3 py-2 font-medium">Activity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {rows.map((e) => (
                <tr
                  key={e.id}
                  tabIndex={0}
                  onClick={() => actions.openEngagement(e.id)}
                  onKeyDown={(ev) => ev.key === 'Enter' && actions.openEngagement(e.id)}
                  className={`cursor-pointer hover:bg-gray-800/50 focus:outline-none focus-visible:bg-gray-800 ${e.stage === 'ignored' ? 'opacity-60' : ''}`}
                >
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-2">
                      <HealthDot health={e.health} />
                      <span className="min-w-0">
                        <span className="block font-medium text-gray-100 truncate max-w-[16rem]">{e.displayName}</span>
                        <span className="block text-xs text-gray-500">{e.services.join(', ') || 'no services set'}</span>
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <StagePill stage={e.stage} />
                  </td>
                  <td className="px-3 py-2.5">
                    <Chips e={e} />
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-gray-200">{money(e.monthlyAmount)}</td>
                  <td className="px-3 py-2.5">
                    {e.stripeSubscriptionStatus ? (
                      <StripeStatusPill status={e.stripeSubscriptionStatus} />
                    ) : (
                      <span className="text-xs text-gray-600">{e.stripeCustomerId ? 'not synced' : 'unlinked'}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-gray-400">
                    {e.nextFollowUpAt ? (
                      <span className={new Date(e.nextFollowUpAt) <= new Date() ? 'text-amber-300' : ''}>
                        {detroitDate(e.nextFollowUpAt)}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-gray-400">
                    <Age iso={e.lastActivityAt} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Cards, under 768px */}
      <ul className="md:hidden space-y-2">
        {rows.map((e) => (
          <li key={e.id}>
            <button
              type="button"
              onClick={() => actions.openEngagement(e.id)}
              className={`w-full text-left bg-gray-900 border border-gray-800 rounded-lg p-3 space-y-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                e.stage === 'ignored' ? 'opacity-60' : ''
              }`}
            >
              <span className="flex items-center gap-2">
                <HealthDot health={e.health} />
                <span className="flex-1 min-w-0 truncate font-medium text-gray-100">{e.displayName}</span>
                <StagePill stage={e.stage} />
              </span>
              <Chips e={e} />
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400">
                <span className="tabular-nums text-gray-200">{money(e.monthlyAmount)}/mo</span>
                {e.stripeSubscriptionStatus ? <StripeStatusPill status={e.stripeSubscriptionStatus} /> : <span>Stripe unlinked</span>}
                <span>follow-up {e.nextFollowUpAt ? detroitDate(e.nextFollowUpAt) : '—'}</span>
                <span>
                  activity <Age iso={e.lastActivityAt} />
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function UnmatchedStrip({
  board,
  actions,
  customers,
  loading,
  onLoad,
}: {
  board: OpsBoard
  actions: OpsActions
  customers: UnmatchedPayingCustomer[] | null
  loading: boolean
  onLoad: (refresh?: boolean) => void
}) {
  const count = customers?.length ?? 0
  // Collapsed by default when empty; opened by default when there is work.
  const [openPref, setOpenPref] = useState<boolean | null>(null)
  const open = openPref ?? count > 0
  const [linking, setLinking] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const link = async (customerId: string, engagement: BoardEngagement) => {
    setLinking(null)
    setBusy(customerId)
    const ok = await actions.patchEngagement(engagement.id, { stripeCustomerId: customerId }, { stripeCustomerId: customerId })
    setBusy(null)
    if (ok) {
      actions.toast(`Linked to ${engagement.displayName}`, 'success')
      onLoad(true)
    }
  }
  const create = async (c: UnmatchedPayingCustomer) => {
    if (!window.confirm(`Create a new client from ${c.name ?? c.email ?? c.customerId}?`)) return
    setBusy(c.customerId)
    const id = await actions.createFromStripe(c.customerId)
    setBusy(null)
    if (id) {
      onLoad(true)
      actions.openEngagement(id)
    }
  }

  return (
    <section className="bg-gray-900 border border-gray-800 rounded-lg">
      <div className="flex items-center gap-2 px-4">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpenPref(!open)}
          className="flex-1 flex items-center gap-2 min-h-[48px] text-sm font-semibold text-gray-100 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
        >
          Unmatched Stripe customers
          <span className={`tabular-nums font-normal ${count > 0 ? 'text-amber-300' : 'text-gray-500'}`}>
            {customers === null ? (loading ? '…' : '') : count}
          </span>
          <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        <button
          type="button"
          onClick={() => onLoad(true)}
          disabled={loading}
          aria-label="Reload unmatched Stripe customers"
          className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg text-gray-400 hover:text-gray-100 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      {open && (
        <div className="border-t border-gray-800">
          {customers === null ? (
            <p className="px-4 py-4 text-sm text-gray-500">{loading ? 'Loading from Stripe…' : 'Not loaded.'}</p>
          ) : count === 0 ? (
            <p className="px-4 py-4 text-sm text-gray-500">Every paying customer from the last 120 days is linked.</p>
          ) : (
            <ul className="divide-y divide-gray-800">
              {customers.map((c) => (
                <li key={c.customerId} className="px-4 py-3">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-100 truncate">{c.name ?? c.customerId}</p>
                      <p className="text-xs text-gray-500 truncate">
                        {c.email ?? 'no email'} · last paid {detroitDate(c.lastPaymentAt)} ·{' '}
                        <span className="text-gray-300 tabular-nums">{money(c.total)}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={busy === c.customerId}
                        onClick={() => setLinking(linking === c.customerId ? null : c.customerId)}
                        className={smallButton}
                      >
                        Link to…
                      </button>
                      <button type="button" disabled={busy === c.customerId} onClick={() => create(c)} className={smallButton}>
                        Create client
                      </button>
                    </div>
                  </div>
                  {linking === c.customerId && (
                    <EngagementPicker
                      engagements={board.engagements}
                      onPick={(e) => link(c.customerId, e)}
                      onCancel={() => setLinking(null)}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
