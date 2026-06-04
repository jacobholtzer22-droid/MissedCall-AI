'use client'

import { cn } from '@/lib/utils'

export type Period = 'today' | 'week' | 'month' | 'year' | 'all'

export const PERIOD_OPTIONS: { label: string; value: Period }[] = [
  { label: 'Today', value: 'today' },
  { label: 'This Week', value: 'week' },
  { label: 'This Month', value: 'month' },
  { label: 'This Year', value: 'year' },
  { label: 'All Time', value: 'all' },
]

export function periodLabel(value: Period): string {
  return PERIOD_OPTIONS.find((p) => p.value === value)?.label ?? 'This Month'
}

/** Segmented period control. Scrolls horizontally on small screens. */
export function PeriodSelector({
  value,
  onChange,
}: {
  value: Period
  onChange: (value: Period) => void
}) {
  return (
    <div
      role="tablist"
      aria-label="Select time period"
      className="inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-gray-200 bg-white p-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {PERIOD_OPTIONS.map((opt) => {
        const active = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'min-h-[44px] flex-shrink-0 whitespace-nowrap rounded-full px-3 text-sm font-medium transition md:min-h-0 md:py-1.5',
              active
                ? 'bg-brand-orange text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-100 hover:text-brand-dark'
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
