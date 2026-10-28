'use client'

// Clients: the roster. Counts by stage (each one filters), the two MRR
// numbers (Verified and Projected, from headlineMrr so they match the Money
// tab), the pending clients itemised with their amounts editable in place,
// the unmatched-Stripe strip, then every client as a card with search,
// filters and sort. Cards carry the deliverable chips and Stripe status the
// old table had.

import { useMemo, useState } from 'react'
import { ChevronDown, Eye, RefreshCw } from 'lucide-react'
import type { BoardEngagement, OpsBoard } from '@/lib/ops/board'
import { headlineMrr, mrrBucketOf } from '@/lib/ops/money'
import type { UnmatchedPayingCustomer } from '@/lib/ops/sync'
import { DELIVERABLE_TYPES, DELIVERABLE_TYPES_FOR_SERVICE, SERVICE_KEYS, STAGE_ORDER, type DeliverableType, type ServiceKey } from '@/lib/ops/types'
import { ClientCard } from './ClientCard'
import { EngagementPicker } from './Pickers'
import {
  AmountInput,
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

/** Always shown in the count row; other stages appear only when they have clients. */
const MAIN_STAGES = ['prospect', 'paid_upfront', 'onboarding', 'active', 'churned']

/** Which of the six deliverable columns this client actually bought. */
function boughtTypes(e: BoardEngagement): Set<DeliverableType> {
  return new Set(e.services.flatMap((s) => DELIVERABLE_TYPES_FOR_SERVICE[s as ServiceKey] ?? []))
}

function Chips({ e }: { e: BoardEngagement }) {
  const bought = boughtTypes(e)
  return (
    <span className="inline-flex flex-wrap gap-1">
      {DELIVERABLE_TYPES.map((t) => {
        const d = e.deliverables.find((x) => x.type === t)
        return <DeliverableChip key={t} type={t} status={d?.effectiveStatus ?? null} dim={!bought.has(t) && !d} manual={Boolean(d?.manualStatus)} view={d} />
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
  showRevenue,
  onShowRevenue,
  working,
}: {
  board: OpsBoard
  actions: OpsActions
  unmatched: UnmatchedPayingCustomer[] | null
  unmatchedLoading: boolean
  onLoadUnmatched: (refresh?: boolean) => void
  showRevenue: boolean
  onShowRevenue: () => void
  /** engagementId → the HQ agent running for it now. */
  working: Map<string, string>
}) {
  const [stage, setStage] = useState('all')
  const [service, setService] = useState('all')
  const [health, setHealth] = useState('all')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<SortKey>('health')
  const [showIgnored, setShowIgnored] = useState(false)

  const counts = board.money.countsByStage
  const stageButtons = [
    ...MAIN_STAGES,
    ...STAGE_ORDER.filter((s) => !MAIN_STAGES.includes(s) && s !== 'ignored' && (counts[s] ?? 0) > 0),
  ]

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const digits = needle.replace(/\D/g, '')
    const list = [...board.engagements, ...(showIgnored || stage === 'ignored' ? board.ignored : [])]
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
          return (HEALTH_ORDER[a.health] ?? 9) - (HEALTH_ORDER[b.health] ?? 9) || b.alerts.length - a.alerts.length || byName(a, b)
      }
    })
  }, [board.engagements, board.ignored, stage, service, health, q, sort, showIgnored])

  return (
    <div className="space-y-4">
      {/* Counts by stage; each filters the grid below */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Clients by stage">
        {[...stageButtons, 'ignored'].map((s) => {
          const n = s === 'ignored' ? board.ignored.length : counts[s] ?? 0
          const on = stage === s
          return (
            <button
              key={s}
              type="button"
              aria-pressed={on}
              onClick={() => setStage(on ? 'all' : s)}
              className={`inline-flex items-baseline gap-2 px-3 min-h-[44px] rounded-lg border text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                on ? 'border-blue-500 bg-blue-500/10 text-blue-200' : 'border-gray-800 bg-gray-900 text-gray-400 hover:text-gray-200'
              } ${s === 'ignored' ? 'sm:ml-auto' : ''}`}
            >
              <span className="text-lg font-semibold tabular-nums text-gray-100">{n}</span>
              {STAGE_LABELS[s]}
            </button>
          )
        })}
      </div>

      <MrrPanel board={board} actions={actions} showRevenue={showRevenue} onShowRevenue={onShowRevenue} />

      <UnmatchedStrip board={board} actions={actions} customers={unmatched} loading={unmatchedLoading} onLoad={onLoadUnmatched} />

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
          {STAGE_ORDER.map((s) => (
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
        <span className="text-xs text-gray-500 tabular-nums">
          {rows.length} of {board.engagements.length + (showIgnored ? board.ignored.length : 0)}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-500 px-1">No clients match these filters.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {rows.map((e) => (
            <li key={e.id}>
              <ClientCard
                e={e}
                working={working.get(e.id) ?? null}
                showRevenue={showRevenue}
                onOpen={actions.openEngagement}
                extra={
                  <span className="flex flex-wrap items-center gap-2 pt-1">
                    <Chips e={e} />
                    {e.stripeSubscriptionStatus ? (
                      <StripeStatusPill status={e.stripeSubscriptionStatus} />
                    ) : (
                      <span className="text-xs text-gray-600">{e.stripeCustomerId ? 'Stripe not synced' : 'Stripe unlinked'}</span>
                    )}
                  </span>
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * Verified and Projected MRR, large, then the pending clients (paid upfront,
 * onboarding, or a scheduled subscription) with monthly and upfront amounts
 * editable in place. Hidden behind the revenue toggle like the rest of /admin.
 */
function MrrPanel({
  board,
  actions,
  showRevenue,
  onShowRevenue,
}: {
  board: OpsBoard
  actions: OpsActions
  showRevenue: boolean
  onShowRevenue: () => void
}) {
  const mrr = headlineMrr(board.money)
  const pending = board.engagements
    .filter((e) => mrrBucketOf(e) === 'pending')
    .sort((a, b) => (b.monthlyAmount ?? 0) - (a.monthlyAmount ?? 0) || a.displayName.localeCompare(b.displayName))
  const pendingTotal = board.money.mrrPending.verified.total + board.money.mrrPending.projected.total

  if (!showRevenue) {
    return (
      <section className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 flex items-center justify-between gap-3">
        <p className="text-sm text-gray-500">MRR is hidden.</p>
        <button type="button" onClick={onShowRevenue} className={`${smallButton} min-h-[44px]`}>
          <Eye className="h-3.5 w-3.5" /> Show revenue
        </button>
      </section>
    )
  }

  return (
    <section aria-label="MRR" className="bg-gray-900 border border-gray-800 rounded-lg">
      <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-gray-800">
        <div className="p-4">
          <p className="text-xs text-gray-500">Verified MRR</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums text-gray-100">{money(mrr.verified, '$0')}</p>
          <p className="mt-1 text-xs text-gray-500">Stripe subscriptions that are active or past due</p>
        </div>
        <div className="p-4">
          <p className="text-xs text-gray-500">Projected MRR</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums text-gray-100">{money(mrr.projected, '$0')}</p>
          <p className="mt-1 text-xs text-gray-500">Once everyone who paid upfront is on a subscription</p>
        </div>
      </div>
      <details className="border-t border-gray-800 group" open={pending.length > 0 && pending.length <= 8}>
        <summary className="cursor-pointer list-none px-4 min-h-[48px] flex items-center justify-between gap-2 text-sm text-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500">
          <span>
            Pending
            <span className="ml-2 text-gray-500 tabular-nums">{pending.length}</span>
            <span className="ml-3 text-gray-300 tabular-nums">{money(pendingTotal, '$0')}/mo</span>
          </span>
          <ChevronDown className="h-4 w-4 text-gray-500 group-open:rotate-180" />
        </summary>
        {pending.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-gray-500">Nobody is waiting to go on a subscription.</p>
        ) : (
          <ul className="divide-y divide-gray-800 border-t border-gray-800">
            {pending.map((e) => (
              <li key={e.id} className="px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
                <button
                  type="button"
                  onClick={() => actions.openEngagement(e.id)}
                  className="flex-1 min-w-[10rem] text-left min-h-[44px] text-sm text-gray-100 hover:text-blue-300 truncate focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                >
                  {e.displayName}
                </button>
                <StagePill stage={e.stage} />
                {e.stripeSubscriptionStatus ? (
                  <StripeStatusPill status={e.stripeSubscriptionStatus} />
                ) : (
                  <span className="text-xs text-gray-600">{e.stripeCustomerId ? 'not synced' : 'Stripe unlinked'}</span>
                )}
                <label className="flex items-center gap-1.5 text-xs text-gray-500">
                  Monthly
                  <AmountInput
                    value={e.monthlyAmount}
                    label={`Monthly amount for ${e.displayName}`}
                    onSave={(v) => actions.patchEngagement(e.id, { monthlyAmount: v }, { monthlyAmount: v })}
                  />
                </label>
                <label className="flex items-center gap-1.5 text-xs text-gray-500">
                  Upfront
                  <AmountInput
                    value={e.upfrontAmount}
                    label={`Upfront amount for ${e.displayName}`}
                    onSave={(v) => actions.patchEngagement(e.id, { upfrontAmount: v }, { upfrontAmount: v })}
                  />
                </label>
              </li>
            ))}
          </ul>
        )}
      </details>
    </section>
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
