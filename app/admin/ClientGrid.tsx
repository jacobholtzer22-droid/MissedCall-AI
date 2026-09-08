'use client'

import type { AdminBusiness } from './types'
import { ClientCard } from './ClientCard'

interface Props {
  businesses: AdminBusiness[]
  selectedId?: string
  showRevenue: boolean
  onSelect: (b: AdminBusiness) => void
  onClearFilter: () => void
}

export function ClientGrid({ businesses, selectedId, showRevenue, onSelect, onClearFilter }: Props) {
  if (businesses.length === 0) {
    return (
      <p className="text-sm text-gray-400 py-8 text-center">
        No clients match.{' '}
        <button
          type="button"
          onClick={onClearFilter}
          className="text-blue-400 underline-offset-2 hover:underline min-h-[44px] px-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-lg"
        >
          Clear the filter.
        </button>
      </p>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      {businesses.map(biz => (
        <ClientCard
          key={biz.id}
          biz={biz}
          selected={selectedId === biz.id}
          showRevenue={showRevenue}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}
