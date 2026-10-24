'use client'

// Money: MRR and one-time totals from Engagement rows (ignored excluded), and
// a by-stage table. Every MRR figure is split: Verified (Stripe subscription
// active or past_due) is the big number, Projected (any other row with a
// monthlyAmount) the small one under it. 'scheduled' subscriptions count under
// Pending (lib/ops/money.ts). Amounts come from Stripe where a customer is linked and
// from the hand-entered / Business-fee values otherwise; the note under the
// cards says how many summed rows are the latter.

import { useMemo } from 'react'
import type { MoneyBucket, MrrSplit, OpsBoard } from '@/lib/ops/board'
import { isVerifiedMrr } from '@/lib/ops/money'
import { STAGE_ORDER } from '@/lib/ops/types'
import { STAGE_LABELS, StagePill, money, type OpsActions } from './opsUi'

function Card({ label, bucket }: { label: string; bucket: MoneyBucket }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-100">{money(bucket.total, '$0')}</p>
      <p className="mt-1 text-xs text-gray-500">
        {bucket.count} client{bucket.count === 1 ? '' : 's'}
        {bucket.noStripe > 0 && <span className="text-amber-300"> · {bucket.noStripe} not from Stripe</span>}
      </p>
    </div>
  )
}

const clients = (n: number) => `${n} client${n === 1 ? '' : 's'}`

function MrrCard({ label, split }: { label: string; split: MrrSplit }) {
  const { verified: v, projected: p } = split
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-100">{money(v.total, '$0')}</p>
      <p className="text-xs text-gray-500">verified · {clients(v.count)}</p>
      <p className="mt-2 text-sm tabular-nums text-gray-300">
        {money(p.total, '$0')} <span className="text-xs text-gray-500">projected · {clients(p.count)}</span>
      </p>
      {v.noStripe + p.noStripe > 0 && (
        <p className="mt-1 text-xs text-amber-300">{v.noStripe + p.noStripe} not from Stripe</p>
      )}
    </div>
  )
}

export function MoneyTab({ board, actions }: { board: OpsBoard; actions: OpsActions }) {
  const m = board.money
  const byStage = useMemo(
    () =>
      STAGE_ORDER.filter((s) => s !== 'ignored')
        .map((stage) => {
          const rows = board.engagements
            .filter((e) => e.stage === stage)
            .sort((a, b) => (b.monthlyAmount ?? 0) - (a.monthlyAmount ?? 0) || a.displayName.localeCompare(b.displayName))
          return {
            stage,
            rows,
            verified: rows.filter((e) => isVerifiedMrr(e.stripeSubscriptionStatus)).reduce((s, e) => s + (e.monthlyAmount ?? 0), 0),
            projected: rows.filter((e) => !isVerifiedMrr(e.stripeSubscriptionStatus)).reduce((s, e) => s + (e.monthlyAmount ?? 0), 0),
            upfront: rows.reduce((s, e) => s + (e.upfrontAmount ?? 0), 0),
          }
        })
        .filter((g) => g.rows.length > 0),
    [board.engagements]
  )

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <MrrCard label="MRR active" split={m.mrrActive} />
        <MrrCard label="MRR pending (paid upfront, onboarding, scheduled)" split={m.mrrPending} />
        <MrrCard label="MRR churned" split={m.mrrChurned} />
        <Card label="One-time this month" bucket={m.oneTimeThisMonth} />
        <Card label="One-time total" bucket={m.oneTimeTotal} />
      </div>
      <p className="text-xs text-gray-500">
        {m.summedWithoutStripe === 0
          ? 'Every summed row is linked to a Stripe customer.'
          : `${m.summedWithoutStripe} summed row${m.summedWithoutStripe === 1 ? ' has' : 's have'} no Stripe customer, so ${
              m.summedWithoutStripe === 1 ? 'its amounts come' : 'their amounts come'
            } from the Business fees or a hand edit, not Stripe.`}{' '}
        Ignored rows are excluded.
      </p>

      <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-gray-800">
              <th className="px-3 py-2 font-medium">Client</th>
              <th className="px-3 py-2 font-medium">Stage</th>
              <th className="px-3 py-2 font-medium text-right">Monthly verified</th>
              <th className="px-3 py-2 font-medium text-right">Monthly projected</th>
              <th className="px-3 py-2 font-medium text-right">Upfront</th>
              <th className="px-3 py-2 font-medium">Stripe</th>
            </tr>
          </thead>
          {byStage.map((g) => (
            <tbody key={g.stage} className="divide-y divide-gray-800 border-b border-gray-800">
              <tr className="bg-gray-950/60">
                <th colSpan={2} className="px-3 py-2 text-left text-xs font-semibold text-gray-300">
                  {STAGE_LABELS[g.stage]} <span className="text-gray-500 font-normal">{g.rows.length}</span>
                </th>
                <td className="px-3 py-2 text-right text-xs font-semibold tabular-nums text-gray-300">{money(g.verified, '$0')}</td>
                <td className="px-3 py-2 text-right text-xs font-semibold tabular-nums text-gray-500">{money(g.projected, '$0')}</td>
                <td className="px-3 py-2 text-right text-xs font-semibold tabular-nums text-gray-300">{money(g.upfront, '$0')}</td>
                <td />
              </tr>
              {g.rows.map((e) => (
                <tr
                  key={e.id}
                  tabIndex={0}
                  onClick={() => actions.openEngagement(e.id)}
                  onKeyDown={(ev) => ev.key === 'Enter' && actions.openEngagement(e.id)}
                  className="cursor-pointer hover:bg-gray-800/50 focus:outline-none focus-visible:bg-gray-800"
                >
                  <td className="px-3 py-2 text-gray-100">{e.displayName}</td>
                  <td className="px-3 py-2">
                    <StagePill stage={e.stage} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-200">
                    {isVerifiedMrr(e.stripeSubscriptionStatus) ? money(e.monthlyAmount) : '—'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-400">
                    {isVerifiedMrr(e.stripeSubscriptionStatus) ? '—' : money(e.monthlyAmount)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-200">{money(e.upfrontAmount)}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">
                    {e.stripeCustomerId ? e.stripeSubscriptionStatus ?? 'not synced' : <span className="text-amber-300">not linked</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </div>
  )
}
