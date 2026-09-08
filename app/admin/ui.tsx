'use client'

// Shared admin primitives. Everything here is module-scope and presentational.
// Tokens: surfaces bg-gray-900 + border-gray-800, text gray-100/400/500,
// accent blue-500, health emerald-400 / amber-400 / red-500 / gray-500.
// Radius: rounded-lg for containers, rounded-full for pills.

import { Shield, MessageCircle, Calendar, Megaphone, Globe } from 'lucide-react'
import type { AdminBusiness, AdminHealth } from './types'

// ---------------------------------------------------------------------------
// Subscription status
// ---------------------------------------------------------------------------

export const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-500/10 text-green-400 border-green-500/20',
  trialing: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  past_due: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  canceled: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
}

export const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  trialing: 'Trialing',
  past_due: 'Past due',
  canceled: 'Canceled',
}

export function StatusPill({ status, className = '' }: { status: string; className?: string }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border whitespace-nowrap ${
        STATUS_COLORS[status] ?? STATUS_COLORS.canceled
      } ${className}`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export const HEALTH_DOT: Record<AdminHealth, string> = {
  green: 'bg-emerald-400',
  yellow: 'bg-amber-400',
  red: 'bg-red-500',
  gray: 'bg-gray-500',
}

export const HEALTH_LABELS: Record<AdminHealth, string> = {
  green: 'Healthy',
  yellow: 'Needs attention',
  red: 'Needs attention now',
  gray: 'Canceled',
}

export function HealthDot({ health, className = '' }: { health: AdminHealth; className?: string }) {
  return (
    <span
      role="img"
      aria-label={HEALTH_LABELS[health]}
      title={HEALTH_LABELS[health]}
      className={`inline-block h-2.5 w-2.5 rounded-full shrink-0 ${HEALTH_DOT[health]} ${className}`}
    />
  )
}

// ---------------------------------------------------------------------------
// Feature icons — active features only; renders nothing when none are on.
// ---------------------------------------------------------------------------

export function FeatureIcons({ biz, className = '' }: { biz: AdminBusiness; className?: string }) {
  const items: { key: string; title: string; icon: React.ComponentType<{ className?: string }> }[] = []

  if (biz.callScreenerEnabled || biz.spamFilterEnabled) {
    items.push({
      key: 'screen',
      title:
        biz.callScreenerEnabled && biz.spamFilterEnabled
          ? 'Call screener and spam filter'
          : biz.callScreenerEnabled
          ? 'Call screener'
          : 'Spam filter',
      icon: Shield,
    })
  }
  if (biz.telnyxPhoneNumber && biz.missedCallAiEnabled) {
    items.push({ key: 'ai', title: 'MissedCall AI', icon: MessageCircle })
  }
  if (biz.calendarEnabled) {
    items.push({
      key: 'booking',
      title: biz.googleCalendarConnected ? 'Online booking, calendar connected' : 'Online booking, calendar not connected',
      icon: Globe,
    })
  }
  if (biz.calendarEnabled && biz.googleCalendarConnected) {
    items.push({ key: 'calendar', title: 'Google Calendar connected', icon: Calendar })
  }
  if (biz.googleAdsEnabled) {
    items.push({ key: 'ads', title: 'Google Ads', icon: Megaphone })
  }

  if (items.length === 0) return null

  return (
    <span className={`inline-flex items-center gap-1.5 text-gray-500 ${className}`}>
      {items.map(({ key, title, icon: Icon }) => (
        <span key={key} title={title} aria-label={title}>
          <Icon className="h-3.5 w-3.5" />
        </span>
      ))}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Age — compact relative age. "never" for null.
// ---------------------------------------------------------------------------

export function formatAge(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return 'never'
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return 'never'
  const s = Math.max(0, Math.floor((now - t) / 1000))
  if (s < 60) return 'now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 14) return `${d}d`
  const w = Math.floor(d / 7)
  if (w < 9) return `${w}w`
  const mo = Math.floor(d / 30)
  return `${mo}mo`
}

export function Age({ iso, className = '' }: { iso: string | null | undefined; className?: string }) {
  const full = iso ? new Date(iso).toLocaleString() : 'No record'
  return (
    <span title={full} className={`tabular-nums ${className}`} suppressHydrationWarning>
      {formatAge(iso)}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Stat — number + label pair used in funnels.
// ---------------------------------------------------------------------------

export function Stat({
  value,
  label,
  tone = 'default',
  className = '',
}: {
  value: number | string
  label: string
  tone?: 'default' | 'muted' | 'red' | 'amber'
  className?: string
}) {
  const valueClass =
    tone === 'red'
      ? 'text-red-400'
      : tone === 'amber'
      ? 'text-amber-400'
      : tone === 'muted'
      ? 'text-gray-500'
      : 'text-gray-100'
  return (
    <span className={`inline-flex flex-col leading-tight ${className}`}>
      <span className={`text-base font-semibold tabular-nums ${valueClass}`}>{value}</span>
      <span className="text-xs text-gray-500">{label}</span>
    </span>
  )
}
