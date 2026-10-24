'use client'

// Searchable pickers for linking a Stripe customer to a client, from either
// side: EngagementPicker (from an unmatched customer) and StripeCustomerPicker
// (from a client's panel). Plain input + filtered list; no UI library.

import { useMemo, useState } from 'react'
import type { BoardEngagement } from '@/lib/ops/board'
import type { UnmatchedPayingCustomer } from '@/lib/ops/sync'
import { detroitDate, money, smallButton, smallControl } from './opsUi'

export function EngagementPicker({
  engagements,
  onPick,
  onCancel,
}: {
  engagements: BoardEngagement[]
  onPick: (engagement: BoardEngagement) => void
  onCancel: () => void
}) {
  const [q, setQ] = useState('')
  const options = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return engagements
      .filter((e) => !e.stripeCustomerId)
      .filter((e) => !needle || [e.displayName, e.email, e.phone].some((v) => v?.toLowerCase().includes(needle)))
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
      .slice(0, 50)
  }, [engagements, q])

  return (
    <div className="mt-2 rounded-lg border border-gray-700 bg-gray-950 p-2 space-y-2">
      <input
        autoFocus
        type="search"
        placeholder="Search clients without a Stripe customer"
        aria-label="Search clients"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className={smallControl}
      />
      <ul className="max-h-60 overflow-y-auto divide-y divide-gray-800">
        {options.length === 0 && <li className="px-2 py-2 text-xs text-gray-500">No matching client without a Stripe link.</li>}
        {options.map((e) => (
          <li key={e.id}>
            <button
              type="button"
              onClick={() => onPick(e)}
              className="w-full text-left px-2 py-2 text-sm text-gray-200 hover:bg-gray-800 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              {e.displayName}
              <span className="ml-2 text-xs text-gray-500">{e.email ?? e.phone ?? ''}</span>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={onCancel} className={smallButton}>
        Cancel
      </button>
    </div>
  )
}

export function StripeCustomerPicker({
  customers,
  loading,
  onPick,
  onCancel,
}: {
  customers: UnmatchedPayingCustomer[] | null
  loading: boolean
  onPick: (customerId: string) => void
  onCancel: () => void
}) {
  const [q, setQ] = useState('')
  const typedId = q.trim().match(/^cus_[A-Za-z0-9]+$/)?.[0] ?? null
  const options = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (customers ?? []).filter(
      (c) => !needle || [c.name, c.email, c.customerId].some((v) => v?.toLowerCase().includes(needle))
    )
  }, [customers, q])

  return (
    <div className="mt-2 rounded-lg border border-gray-700 bg-gray-950 p-2 space-y-2">
      <input
        autoFocus
        type="search"
        placeholder="Search unmatched customers, or paste a cus_ id"
        aria-label="Search Stripe customers"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className={smallControl}
      />
      {typedId && (
        <button type="button" onClick={() => onPick(typedId)} className={`${smallButton} w-full`}>
          Link {typedId}
        </button>
      )}
      <ul className="max-h-60 overflow-y-auto divide-y divide-gray-800">
        {loading && <li className="px-2 py-2 text-xs text-gray-500">Loading Stripe customers…</li>}
        {!loading && options.length === 0 && (
          <li className="px-2 py-2 text-xs text-gray-500">No unmatched paying customer. Paste a cus_ id above.</li>
        )}
        {options.map((c) => (
          <li key={c.customerId}>
            <button
              type="button"
              onClick={() => onPick(c.customerId)}
              className="w-full text-left px-2 py-2 text-sm text-gray-200 hover:bg-gray-800 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              {c.name ?? c.email ?? c.customerId}
              <span className="ml-2 text-xs text-gray-500">
                {c.email ?? ''} · {money(c.total)} · last {detroitDate(c.lastPaymentAt)}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={onCancel} className={smallButton}>
        Cancel
      </button>
    </div>
  )
}
