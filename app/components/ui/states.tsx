import type { ComponentType, ReactNode } from 'react'
import { AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './Button'

/** A single shimmer block. */
export function Skeleton({ className }: { className?: string }) {
  return <span className={cn('inline-block animate-pulse rounded bg-gray-100', className)} />
}

/** Section-level loading placeholder: N shimmer rows. */
export function LoadingState({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-3', className)} aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-100" />
      ))}
    </div>
  )
}

/** Empty state: icon + message, optional helper line + action. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ComponentType<{ className?: string }>
  title: string
  description?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      {Icon && <Icon className="mb-3 h-10 w-10 text-gray-300" />}
      <p className="text-sm font-medium text-gray-700">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-gray-400">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/** Visible error banner with a retry affordance. */
export function ErrorState({
  message,
  onRetry,
  className,
}: {
  message: string
  onRetry?: () => void
  className?: string
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between',
        className
      )}
    >
      <span className="flex items-center gap-2">
        <AlertCircle className="h-4 w-4 flex-shrink-0" />
        {message}
      </span>
      {onRetry && (
        <Button variant="destructive" size="sm" onClick={onRetry} className="self-start sm:self-auto">
          Retry
        </Button>
      )}
    </div>
  )
}
