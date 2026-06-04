import type { ComponentType } from 'react'
import Link from 'next/link'
import { ArrowDownRight, ArrowUpRight, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Skeleton } from './states'

export type Trend = { label: string; direction: 'up' | 'down' | 'neutral' }

export type MetricCardProps = {
  title: string
  value: number | string
  subLabel?: string
  icon: ComponentType<{ className?: string }>
  href?: string
  trend?: Trend
  loading?: boolean
}

function TrendChip({ trend }: { trend: Trend }) {
  const tone =
    trend.direction === 'up'
      ? 'text-emerald-700 bg-emerald-50'
      : trend.direction === 'down'
        ? 'text-red-700 bg-red-50'
        : 'text-gray-600 bg-gray-100'
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-medium', tone)}>
      {trend.direction === 'up' && <ArrowUpRight className="h-3 w-3" />}
      {trend.direction === 'down' && <ArrowDownRight className="h-3 w-3" />}
      {trend.label}
    </span>
  )
}

function MetricCardInner({ title, value, subLabel, icon: Icon, trend, loading, clickable }: MetricCardProps & { clickable: boolean }) {
  return (
    <>
      <div className="flex items-start justify-between gap-3 p-5">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-brand-dark">
            {loading ? <Skeleton className="h-7 w-16" /> : value}
          </p>
          {subLabel && <p className="mt-1 text-sm text-gray-500">{subLabel}</p>}
          {trend && !loading && (
            <div className="mt-2">
              <TrendChip trend={trend} />
            </div>
          )}
        </div>
        <div className="rounded-xl bg-brand-orange-light p-3 text-brand-orange">
          <Icon className="h-6 w-6" />
        </div>
      </div>
      {clickable && (
        <ArrowRight className="absolute bottom-4 right-4 h-4 w-4 text-gray-300 opacity-0 transition group-hover:translate-x-0.5 group-hover:text-brand-orange group-hover:opacity-100" />
      )}
    </>
  )
}

/**
 * Stat card. With `href`, the whole card becomes a keyboard-accessible link
 * with a clear hover affordance (orange border + reveal arrow).
 */
export function MetricCard(props: MetricCardProps) {
  const base = 'relative overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm'

  if (props.href) {
    return (
      <Link
        href={props.href}
        className={cn(
          base,
          'group block transition hover:border-brand-orange/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:ring-offset-2'
        )}
      >
        <MetricCardInner {...props} clickable />
      </Link>
    )
  }

  return (
    <div className={base}>
      <MetricCardInner {...props} clickable={false} />
    </div>
  )
}
