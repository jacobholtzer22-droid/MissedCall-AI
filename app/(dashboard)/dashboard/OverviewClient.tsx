'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  BarChart3,
  Calendar,
  DollarSign,
  Globe2,
  Mail,
  Megaphone,
  MousePointerClick,
  Phone,
  PhoneCall,
  PhoneIncoming,
  PhoneMissed,
  PhoneOff,
  TrendingUp,
  Voicemail,
} from 'lucide-react'
import Link from 'next/link'
import { cn, formatPhoneNumber, formatRelativeTime } from '@/lib/utils'
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  CardSubtitle,
  CardTitle,
  EmptyState,
  ErrorState,
  LoadingState,
  MetricCard,
  PageHeader,
  PeriodSelector,
  Skeleton,
  StatusBadge,
  periodLabel,
  type MetricCardProps,
  type Period,
} from '@/app/components/ui'

type Features = {
  hasSpamFilter: boolean
  hasIvrScreener: boolean
  hasAnyScreening: boolean
  hasMissedCallAi: boolean
  hasForwarding: boolean
  hasCalendar: boolean
  showScreeningCards: boolean
  showAiCards: boolean
  totalCallsMode: 'screened' | 'calls'
  googleAds: boolean
  knownContactVoicemailEnabled: boolean
}

type LeadSourceKey = 'missed_call' | 'website_form' | 'referral' | 'google_ad' | 'imports' | 'manual'
type LeadSources = Record<LeadSourceKey, number>

type AnalyticsResponse = {
  totalCalls: number
  callsBlocked: number
  callsPassed: number
  leadsCapured: number
  leadsCaptured?: number
  websiteLeads: number
  messagesSent: number
  voicemailsCount: number
  previousTotalCalls: number | null
  previousLeadsCaptured: number | null
  leadSources: LeadSources
}

type VoicemailRow = {
  conversationId: string
  callerPhone: string
  contactName: string | null
  recordingUrl: string | null
  voicemailTranscription: string | null
  createdAt: string
}

type CallLogItem = {
  id: string
  kind: 'call' | 'lead'
  phone: string | null
  name: string | null
  result: string | null
  description: string | null
  createdAt: string
}

type AppointmentRow = {
  id: string
  customerName: string
  customerPhone: string
  serviceType: string
  scheduledAt: string
  status: string
}

type AdsTotals = {
  impressions: number
  clicks: number
  cost: number
  conversions: number
  avgCtr: number
  avgCostPerConversion: number | null
}

const SOURCE_META: Record<LeadSourceKey, { label: string; bar: string }> = {
  missed_call: { label: 'Missed Call', bar: 'bg-brand-orange' },
  website_form: { label: 'Website Form', bar: 'bg-blue-500' },
  referral: { label: 'Referral', bar: 'bg-green-500' },
  google_ad: { label: 'Google Ad', bar: 'bg-purple-500' },
  imports: { label: 'Imports', bar: 'bg-yellow-400' },
  manual: { label: 'Manual Entry', bar: 'bg-gray-500' },
}

const SOURCE_ORDER: LeadSourceKey[] = [
  'missed_call',
  'website_form',
  'referral',
  'google_ad',
  'imports',
  'manual',
]

function formatDelta(current: number, previous: number | null | undefined) {
  if (previous == null || previous < 0) return undefined
  if (previous === 0) {
    if (current === 0) return { label: 'No change', direction: 'neutral' as const }
    return { label: `+${current}`, direction: 'up' as const }
  }
  const diff = current - previous
  if (diff === 0) return { label: 'No change', direction: 'neutral' as const }
  const sign = diff > 0 ? '+' : ''
  return { label: `${sign}${diff} vs last`, direction: diff > 0 ? ('up' as const) : ('down' as const) }
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-US').format(n)
}

export function OverviewClient({
  features,
  initialVoicemails = [],
  callLog = [],
}: {
  features: Features
  initialVoicemails?: VoicemailRow[]
  callLog?: CallLogItem[]
}) {
  const [period, setPeriod] = useState<Period>('month')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null)
  const [upcomingAppointments, setUpcomingAppointments] = useState<AppointmentRow[]>([])
  const [adsTotals, setAdsTotals] = useState<AdsTotals | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const showVoicemails = !features.hasMissedCallAi || features.knownContactVoicemailEnabled

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    const fetches: Promise<void>[] = []

    fetches.push(
      fetch(`/api/dashboard/analytics?period=${period}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed to load analytics'))))
        .then((d: AnalyticsResponse) => {
          if (!cancelled) setAnalytics(d)
        })
    )

    if (features.hasCalendar) {
      fetches.push(
        fetch('/api/appointments')
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed to load appointments'))))
          .then((d) => {
            if (cancelled) return
            const now = new Date()
            const upcoming = (d.appointments ?? d ?? [])
              .filter((a: AppointmentRow) => new Date(a.scheduledAt) >= now && a.status === 'confirmed')
              .slice(0, 5)
            setUpcomingAppointments(upcoming)
          })
      )
    }

    if (features.googleAds) {
      const now = new Date()
      const start = new Date(now)
      start.setDate(start.getDate() - 30)
      const startStr = start.toISOString().split('T')[0]
      const endStr = now.toISOString().split('T')[0]
      fetches.push(
        fetch(`/api/dashboard/google-ads?startDate=${startStr}&endDate=${endStr}`)
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed to load ads data'))))
          .then((d) => {
            if (!cancelled) setAdsTotals(d.totals ?? null)
          })
      )
    }

    Promise.all(fetches)
      .catch((e) => {
        if (!cancelled) setError(e?.message ?? 'Something went wrong')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [period, reloadKey, features.hasCalendar, features.googleAds])

  const retry = useCallback(() => setReloadKey((k) => k + 1), [])

  const pLabel = periodLabel(period)

  // Reconcile website count so the card and the Lead Sources chart agree:
  // both use WebsiteLead form submissions (analytics.websiteLeads).
  const leadSources = useMemo<LeadSources | null>(() => {
    if (!analytics) return null
    return { ...analytics.leadSources, website_form: analytics.websiteLeads }
  }, [analytics])

  const totalLeadSources = useMemo(() => {
    if (!leadSources) return 0
    return SOURCE_ORDER.reduce((sum, key) => sum + leadSources[key], 0)
  }, [leadSources])

  const missedCallLeads = leadSources?.missed_call ?? 0

  const voicemailLabel = features.hasMissedCallAi ? 'Voicemails from Contacts' : 'Voicemails'

  const cards: (MetricCardProps & { show: boolean })[] = [
    {
      show: true,
      title: 'Total Calls',
      value: analytics?.totalCalls ?? 0,
      subLabel: `${features.totalCallsMode === 'screened' ? 'Screened' : 'Inbound'} calls · ${pLabel}`,
      icon: Phone,
      href: '/dashboard/blocked-calls',
      trend: formatDelta(analytics?.totalCalls ?? 0, analytics?.previousTotalCalls ?? null),
      loading,
    },
    {
      show: features.hasAnyScreening,
      title: 'Calls Blocked',
      value: analytics?.callsBlocked ?? 0,
      subLabel: 'Failed spam screening',
      icon: PhoneOff,
      href: '/dashboard/blocked-calls',
      loading,
    },
    {
      show: features.hasAnyScreening,
      title: 'Calls Passed',
      value: analytics?.callsPassed ?? 0,
      subLabel: 'Real callers rang through',
      icon: PhoneIncoming,
      href: '/dashboard/blocked-calls',
      loading,
    },
    {
      show: showVoicemails,
      title: voicemailLabel,
      value: analytics?.voicemailsCount ?? 0,
      subLabel: `Voicemails · ${pLabel}`,
      icon: Voicemail,
      href: '/dashboard/voicemails',
      loading,
    },
    {
      show: features.hasMissedCallAi,
      title: 'Missed Call Leads',
      value: missedCallLeads,
      subLabel: 'Leads from missed calls',
      icon: PhoneMissed,
      href: '/dashboard/conversations',
      loading,
    },
    {
      show: features.hasMissedCallAi,
      title: 'Website Leads',
      value: analytics?.websiteLeads ?? 0,
      subLabel: 'Form submissions',
      icon: Globe2,
      href: '/dashboard/leads',
      loading,
    },
  ]

  const visibleCards = cards.filter((c) => c.show)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle="Here's what's happening with your business at a glance."
        actions={<PeriodSelector value={period} onChange={setPeriod} />}
      />

      {error && <ErrorState message={error} onRetry={retry} />}

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 xl:grid-cols-3">
        {visibleCards.map((card) => {
          const { show: _show, ...metricProps } = card
          return <MetricCard key={card.title} {...metricProps} />
        })}
      </div>

      {/* ── Google Ads summary (gated) ── */}
      {features.googleAds && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Megaphone className="h-5 w-5 text-brand-orange" />
              Google Ads
            </CardTitle>
            <Link
              href="/dashboard/ads"
              className="inline-flex items-center text-sm font-medium text-brand-orange hover:text-brand-orange-dark"
            >
              View details <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <AdStat icon={DollarSign} label="Ad Spend" loading={loading} value={formatCurrency(adsTotals?.cost ?? 0)} />
              <AdStat icon={MousePointerClick} label="Clicks" loading={loading} value={formatNumber(adsTotals?.clicks ?? 0)} />
              <AdStat icon={TrendingUp} label="CTR" loading={loading} value={`${((adsTotals?.avgCtr ?? 0) * 100).toFixed(2)}%`} />
              <AdStat
                icon={DollarSign}
                label="Cost / Conv."
                loading={loading}
                value={adsTotals?.avgCostPerConversion != null ? formatCurrency(adsTotals.avgCostPerConversion) : '—'}
              />
            </div>
          </CardBody>
        </Card>
      )}

      {/* ── Upcoming appointments (gated) ── */}
      {features.hasCalendar && !loading && upcomingAppointments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-brand-orange" />
              Upcoming Quote Visits
            </CardTitle>
            <Link
              href="/dashboard/appointments"
              className="inline-flex items-center text-sm font-medium text-brand-orange hover:text-brand-orange-dark"
            >
              View all <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </CardHeader>
          <ul className="divide-y divide-gray-100">
            {upcomingAppointments.map((apt) => (
              <li key={apt.id} className="flex items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <p className="truncate font-medium text-brand-dark">{apt.customerName}</p>
                  <p className="truncate text-sm text-gray-500">
                    {apt.serviceType} · {formatPhoneNumber(apt.customerPhone)}
                  </p>
                </div>
                <div className="flex-shrink-0 text-right">
                  <p className="font-medium text-brand-dark">
                    {new Date(apt.scheduledAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </p>
                  <p className="text-sm text-gray-500">
                    {new Date(apt.scheduledAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* ── Lower content: Lead Sources + Call log ── */}
      <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-2">
        {/* Lead sources (period-scoped) */}
        <Card className="flex flex-col">
          <CardHeader className="block">
            <CardTitle>Lead Sources</CardTitle>
            <CardSubtitle>Where your leads came from · {pLabel}</CardSubtitle>
          </CardHeader>
          <CardBody className="flex-1">
            {loading ? (
              <LoadingState rows={3} />
            ) : !leadSources || totalLeadSources === 0 ? (
              <EmptyState
                icon={BarChart3}
                title="No leads captured yet"
                description="As leads come in from missed calls and your website, you'll see the breakdown here."
              />
            ) : (
              <div className="space-y-4">
                {SOURCE_ORDER.map((key) => {
                  const count = leadSources[key]
                  if (!count) return null
                  const pct = Math.round((count / totalLeadSources) * 100)
                  const meta = SOURCE_META[key]
                  return (
                    <div key={key} className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-brand-dark">{meta.label}</span>
                        <span className="text-xs text-gray-500">{count} · {pct}%</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                        <div className={cn('h-full rounded-full transition-all', meta.bar)} style={{ width: `${Math.max(4, pct)}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardBody>
        </Card>

        {/* Call log (newest-first, NOT period-scoped) */}
        <Card className="flex flex-col">
          <CardHeader className="block">
            <CardTitle>Recent Activity</CardTitle>
            <CardSubtitle>Latest calls &amp; missed-call leads</CardSubtitle>
          </CardHeader>
          {callLog.length === 0 ? (
            <CardBody className="flex-1">
              <EmptyState
                icon={PhoneCall}
                title="No recent call activity"
                description="Incoming calls and new missed-call leads will appear here as they happen."
              />
            </CardBody>
          ) : (
            <ul className="divide-y divide-gray-100">
              {callLog.map((item) => (
                <CallLogRow key={item.id} item={item} />
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* ── Recent voicemails with inline players (gated, latest 5) ── */}
      {showVoicemails && initialVoicemails.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-brand-orange" />
              {voicemailLabel}
            </CardTitle>
            <Link
              href="/dashboard/voicemails"
              className="inline-flex items-center text-sm font-medium text-brand-orange hover:text-brand-orange-dark"
            >
              View all <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </CardHeader>
          <ul className="divide-y divide-gray-100">
            {initialVoicemails.map((vm) => (
              <li key={vm.conversationId} className="px-5 py-4">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-brand-dark">
                      {vm.contactName ?? formatPhoneNumber(vm.callerPhone)}
                    </p>
                    {vm.contactName && (
                      <p className="truncate font-mono text-sm text-gray-500">{formatPhoneNumber(vm.callerPhone)}</p>
                    )}
                  </div>
                  <span className="flex-shrink-0 whitespace-nowrap text-sm text-gray-500">
                    {formatRelativeTime(new Date(vm.createdAt))}
                  </span>
                </div>
                {vm.recordingUrl && (
                  <audio controls preload="metadata" src={vm.recordingUrl} className="w-full max-w-md">
                    Your browser does not support the audio element.
                  </audio>
                )}
                {vm.voicemailTranscription && (
                  <p className="mt-2 line-clamp-2 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">
                    {vm.voicemailTranscription}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}

function AdStat({
  icon: Icon,
  label,
  value,
  loading,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  loading?: boolean
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
      <div className="mb-2 flex items-center gap-2">
        <Icon className="h-4 w-4 text-gray-400" />
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</span>
      </div>
      <p className="text-2xl font-bold tabular-nums text-brand-dark">
        {loading ? <Skeleton className="h-7 w-20" /> : value}
      </p>
    </div>
  )
}

function CallLogRow({ item }: { item: CallLogItem }) {
  const isCall = item.kind === 'call'
  const Icon = isCall ? (item.result === 'blocked' ? PhoneOff : PhoneIncoming) : PhoneMissed
  const primary = isCall
    ? item.phone
      ? formatPhoneNumber(item.phone)
      : 'Unknown caller'
    : item.name ?? (item.phone ? formatPhoneNumber(item.phone) : 'New lead')

  return (
    <li className="flex items-center gap-3 px-5 py-3.5">
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gray-100">
        <Icon className="h-4 w-4 text-gray-500" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={cn('truncate font-medium text-brand-dark', isCall && 'font-mono')}>{primary}</span>
          {isCall && item.result ? (
            <StatusBadge status={item.result} />
          ) : (
            <Badge tone="orange">Lead</Badge>
          )}
        </div>
        {!isCall && (
          <p className="truncate text-xs text-gray-500">{item.description ?? 'New lead from missed call'}</p>
        )}
      </div>
      <span className="flex-shrink-0 whitespace-nowrap text-xs text-gray-400">
        {formatRelativeTime(new Date(item.createdAt))}
      </span>
    </li>
  )
}
