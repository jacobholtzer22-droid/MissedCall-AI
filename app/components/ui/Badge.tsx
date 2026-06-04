import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export type BadgeTone =
  | 'neutral'
  | 'orange'
  | 'blue'
  | 'green'
  | 'red'
  | 'purple'
  | 'yellow'

// Single source of truth for badge colors across the dashboard.
const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-gray-100 text-gray-700 border-gray-200',
  orange: 'bg-brand-orange-light text-brand-orange border-orange-200',
  blue: 'bg-blue-100 text-blue-700 border-blue-200',
  green: 'bg-green-100 text-green-700 border-green-200',
  red: 'bg-red-100 text-red-700 border-red-200',
  purple: 'bg-purple-100 text-purple-700 border-purple-200',
  yellow: 'bg-yellow-100 text-yellow-800 border-yellow-200',
}

type BadgeProps = HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }

export function Badge({ tone = 'neutral', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        TONES[tone],
        className
      )}
      {...props}
    />
  )
}

// Semantic status → tone + label. Covers the call-log "blocked"/"passed" cases
// plus common CRM statuses so other pages can adopt it later.
const STATUS_MAP: Record<string, { tone: BadgeTone; label: string }> = {
  blocked: { tone: 'red', label: 'Blocked' },
  passed: { tone: 'green', label: 'Passed' },
  new: { tone: 'blue', label: 'New' },
  contacted: { tone: 'yellow', label: 'Contacted' },
  converted: { tone: 'green', label: 'Converted' },
  closed: { tone: 'neutral', label: 'Closed' },
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const entry = STATUS_MAP[status] ?? { tone: 'neutral' as BadgeTone, label: status }
  return (
    <Badge tone={entry.tone} className={className}>
      {entry.label}
    </Badge>
  )
}
