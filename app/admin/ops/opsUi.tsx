'use client'

// /admin/ops presentational pieces. Same tokens as app/admin/ui.tsx: surfaces
// bg-gray-900 + border-gray-800, text gray-100/400/500, accent blue-500.

import type { BoardDeliverable, BoardEngagement } from '@/lib/ops/board'
import type { DeliverableStatus, DeliverableType } from '@/lib/ops/types'

export const OPS_TZ = 'America/Detroit'

/** What every tab and the panel call to change data. Each returns false on failure (already toasted). */
export interface OpsActions {
  patchEngagement: (id: string, patch: Record<string, unknown>, optimistic?: Partial<BoardEngagement>) => Promise<boolean>
  patchDeliverable: (
    engagementId: string,
    deliverableId: string,
    patch: Record<string, unknown>,
    optimistic?: Partial<BoardDeliverable>
  ) => Promise<boolean>
  logActivity: (id: string, input: { kind: string; body: string; followUpAt?: string | null }) => Promise<boolean>
  snooze: (id: string, days: number) => Promise<boolean>
  setShowStatus: (bookingId: string, showStatus: string) => Promise<boolean>
  createFromStripe: (customerId: string) => Promise<string | null>
  openEngagement: (id: string, focus?: 'activity') => void
  toast: (message: string, type: 'success' | 'error') => void
}

export const control =
  'bg-gray-900 border border-gray-800 rounded-lg px-3 text-sm text-gray-100 min-h-[44px] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500'
export const smallControl =
  'bg-gray-950 border border-gray-800 rounded-md px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 w-full'
export const button =
  'inline-flex items-center justify-center gap-1.5 px-3 min-h-[44px] rounded-lg border border-gray-700 bg-gray-800 hover:bg-gray-700 text-sm font-medium text-gray-100 transition disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500'
export const smallButton =
  'inline-flex items-center justify-center gap-1 px-2.5 min-h-[36px] rounded-md border border-gray-700 bg-gray-800 hover:bg-gray-700 text-xs font-medium text-gray-200 transition disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500'

export function Section({ title, count, children, action }: { title: string; count?: number; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="bg-gray-900 border border-gray-800 rounded-lg">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-800">
        <h2 className="text-sm font-semibold text-gray-100">
          {title}
          {count !== undefined && <span className="ml-2 text-gray-500 font-normal tabular-nums">{count}</span>}
        </h2>
        {action}
      </div>
      <div>{children}</div>
    </section>
  )
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-6 text-sm text-gray-500">{children}</p>
}

// ── Stage ────────────────────────────────────────────────────────────────────

export const STAGE_LABELS: Record<string, string> = {
  prospect: 'Prospect',
  paid_upfront: 'Paid upfront',
  onboarding: 'Onboarding',
  active: 'Active',
  one_time: 'One-time',
  paused: 'Paused',
  churned: 'Churned',
  ignored: 'Ignored',
}

const STAGE_COLORS: Record<string, string> = {
  prospect: 'bg-gray-500/10 text-gray-300 border-gray-500/20',
  paid_upfront: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  onboarding: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  active: 'bg-green-500/10 text-green-400 border-green-500/20',
  one_time: 'bg-violet-500/10 text-violet-300 border-violet-500/20',
  paused: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  churned: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
  ignored: 'bg-gray-800 text-gray-500 border-gray-700',
}

export function StagePill({ stage }: { stage: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border whitespace-nowrap ${STAGE_COLORS[stage] ?? STAGE_COLORS.prospect}`}>
      {STAGE_LABELS[stage] ?? stage}
    </span>
  )
}

// ── Deliverables ─────────────────────────────────────────────────────────────

export const DELIVERABLE_LABELS: Record<DeliverableType, string> = {
  website: 'Web',
  domain: 'DNS',
  email: 'Mail',
  missedcall: 'MCA',
  ads: 'Ads',
  gbp: 'GBP',
}

export const DELIVERABLE_STATUS_LABELS: Record<DeliverableStatus, string> = {
  live: 'Live',
  in_progress: 'In progress',
  blocked: 'Blocked',
  not_started: 'Not started',
  unknown: 'Unknown',
}

const CHIP_COLORS: Record<DeliverableStatus, string> = {
  live: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  in_progress: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  blocked: 'bg-red-500/15 text-red-300 border-red-500/40',
  not_started: 'bg-gray-700/60 text-gray-300 border-gray-600',
  unknown: 'bg-transparent text-gray-400 border-gray-600 border-dashed',
}

/** Status chip; `dim` when the client did not buy this service. */
export function DeliverableChip({
  type,
  status,
  dim = false,
  manual = false,
}: {
  type: DeliverableType
  status: DeliverableStatus | null
  dim?: boolean
  manual?: boolean
}) {
  const s = status ?? 'unknown'
  const title = `${type}: ${dim ? 'not bought' : DELIVERABLE_STATUS_LABELS[s]}${manual ? ' (set by hand)' : ''}`
  return (
    <span
      title={title}
      aria-label={title}
      className={`inline-flex items-center justify-center w-10 h-6 rounded border text-[10px] font-semibold uppercase tracking-wide ${
        dim ? 'border-gray-800 text-gray-700' : CHIP_COLORS[s]
      }`}
    >
      {DELIVERABLE_LABELS[type]}
      {manual && !dim && <span className="ml-0.5">•</span>}
    </span>
  )
}

// ── Formatting ───────────────────────────────────────────────────────────────

export function money(n: number | null | undefined, empty = '—'): string {
  if (n == null) return empty
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: n % 1 ? 2 : 0, minimumFractionDigits: n % 1 ? 2 : 0 })}`
}

export function detroitTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: OPS_TZ })
}

export function detroitDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: OPS_TZ })
}

/** "3d overdue" / "due in 2d" / "due now". */
export function overdueLabel(iso: string, now = Date.now()): string {
  const diff = now - new Date(iso).getTime()
  const abs = Math.abs(diff)
  const d = Math.floor(abs / 86_400_000)
  const h = Math.floor(abs / 3_600_000)
  const span = d >= 1 ? `${d}d` : h >= 1 ? `${h}h` : `${Math.max(1, Math.floor(abs / 60_000))}m`
  return diff >= 0 ? `${span} overdue` : `due in ${span}`
}

/** Value for <input type="datetime-local"> in the browser's zone. */
export function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export const ALERT_TONE = {
  red: 'border-red-500/40 bg-red-500/10 text-red-300',
  yellow: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
} as const
