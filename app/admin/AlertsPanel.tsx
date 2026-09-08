'use client'

import { useMemo } from 'react'
import type { AdminBusiness, AdminHealth } from './types'
import { HealthDot, Stat } from './ui'

const HEALTH_ORDER: Record<AdminHealth, number> = { red: 0, yellow: 1, green: 2, gray: 3 }

interface Props {
  businesses: AdminBusiness[]
  onSelect: (b: AdminBusiness) => void
}

/**
 * Fleet-wide alerts. Canceled clients are excluded. Sorted red first, then
 * yellow, then by name. Tapping a row opens that client's detail panel.
 */
export function AlertsPanel({ businesses, onSelect }: Props) {
  const rows = useMemo(
    () =>
      businesses
        .filter(b => b.subscriptionStatus !== 'canceled' && b.alerts.length > 0)
        .sort(
          (a, b) =>
            HEALTH_ORDER[a.health] - HEALTH_ORDER[b.health] || a.name.localeCompare(b.name)
        ),
    [businesses]
  )

  if (rows.length === 0) {
    return (
      <p className="text-sm text-gray-400 flex items-center gap-2">
        <HealthDot health="green" />
        All clients healthy
      </p>
    )
  }

  return (
    <section aria-label="Clients needing attention">
      <h2 className="text-sm font-medium text-gray-100 mb-2">
        {rows.length} need{rows.length === 1 ? 's' : ''} attention
      </h2>
      <ul className="rounded-lg border border-gray-800 bg-gray-900 divide-y divide-gray-800/60">
        {rows.map(b => (
          <li key={b.id}>
            <button
              type="button"
              onClick={() => onSelect(b)}
              className="w-full text-left flex items-start gap-3 px-4 py-3 min-h-[44px] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset"
            >
              <HealthDot health={b.health} className="mt-1.5" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-gray-100">{b.name}</span>
                {b.alerts.map(a => (
                  <span
                    key={a.code}
                    className={`block text-sm ${a.severity === 'red' ? 'text-red-400' : 'text-gray-400'}`}
                  >
                    {a.message}
                  </span>
                ))}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** One line under the alerts: client count plus this month's fleet totals. No card chrome. */
export function FleetLine({ businesses }: { businesses: AdminBusiness[] }) {
  const live = businesses.filter(b => b.subscriptionStatus !== 'canceled')
  const sum = (pick: (s: AdminBusiness['stats']) => number) =>
    live.reduce((acc, b) => acc + pick(b.stats), 0)

  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
      <span className="text-sm text-gray-400 pb-0.5">
        {live.length} client{live.length === 1 ? '' : 's'}
      </span>
      <Stat value={sum(s => s.missedCallsMonth)} label="Missed" />
      <Stat value={sum(s => s.textbacksMonth)} label="Texted" />
      <Stat value={sum(s => s.capturedMonth)} label="Captured" />
      <Stat value={sum(s => s.webLeadsMonth)} label="Web leads" />
      <span className="text-xs text-gray-500 pb-1">this month</span>
    </div>
  )
}
