'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Calendar,
  CheckCircle2,
  DollarSign,
  Globe2,
  Megaphone,
  MessageSquare,
  MousePointerClick,
  Phone,
  PhoneCall,
  PhoneOff,
  Shield,
  Mail,
  TrendingUp,
  UserPlus,
} from 'lucide-react'
import Link from 'next/link'
import { formatRelativeTime, formatPhoneNumber } from '@/lib/utils'
import { cn } from '@/lib/utils'

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

type AnalyticsPeriod = 'today' | 'week' | 'month' | 'all'

type LeadSourceKey = 'missed_call' | 'website_form' | 'referral' | 'google_ad' | 'imports' | 'manual'
type LeadSources = Record<LeadSourceKey, number>

type RecentActivityItem = {
  id: string
  type: string
  description: string
  createdAt: string
  contactName: string | null
  contactPhone: string | null
}

type AnalyticsResponse = {
  totalCalls: number
  callsBlocked: number
  callsPassed: number
  leadsCapured: number
  leadsCaptured?: number
  websiteLeads: number
  messagesSent: number
  previousTotalCalls: number | null
  previousLeadsCaptured: number | null
  leadSources: LeadSources
  recentActivity: RecentActivityItem[]
}

type ScreenedCallRow = {
  id: string
  callerPhone: string
  result: string
  createdAt: string
}

type VoicemailRow = {
  conversationId: string
  callerPhone: string
  contactName: string | null
  recordingUrl: string | null
  voicemailTranscription: string | null
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

const PERIOD_OPTIONS: { label: string; value: AnalyticsPeriod }[] = [
  { label: 'Today', value: 'today' },
  { label: 'This Week', value: 'week' },
  { label: 'This Month', value: 'month' },
  { label: 'All Time', value: 'all' },
]

const SOURCE_COLORS: Record<string, string> = {
  missed_call: 'bg-orange-100 text-orange-800 border border-orange-200',
  website_form: 'bg-blue-100 text-blue-800 border border-blue-200',
  referral: 'bg-green-100 text-green-800 border border-green-200',
  google_ad: 'bg-purple-100 text-purple-800 border border-purple-200',
  imports: 'bg-yellow-100 text-yellow-800 border border-yellow-200',
  manual: 'bg-gray-100 text-gray-800 border border-gray-200',
}

const SOURCE_LABELS: Record<string, string> = {
  missed_call: 'Missed Call',
  website_form: 'Website Form',
  referral: 'Referral',
  google_ad: 'Google Ad',
  imports: 'Imports',
  manual: 'Manual Entry',
}

const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  missed_call: 'Missed Call',
  sms_conversation: 'SMS Conversation',
  voicemail: 'Voicemail',
  website_form: 'Website Form',
  email_sent: 'Email',
  job_created: 'Job Created',
  job_completed: 'Job Completed',
  note_added: 'Note Added',
  status_changed: 'Status Changed',
  manual: 'Manual',
}

const ACTIVITY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  missed_call: Phone,
  sms_conversation: MessageSquare,
  voicemail: Phone,
  website_form: Globe2,
  email_sent: MessageSquare,
  job_created: UserPlus,
  job_completed: UserPlus,
  note_added: MessageSquare,
  status_changed: MessageSquare,
  manual: UserPlus,
}

function formatDelta(current: number, previous: number | null | undefined) {
  if (previous == null || previous < 0) return { label: '—', direction: 'neutral' as const }
  if (previous === 0) {
    if (current === 0) return { label: 'No change', direction: 'neutral' as const }
    return { label: `+${current} from last period`, direction: 'up' as const }
  }
  const diff = current - previous
  if (diff === 0) return { label: 'No change from last period', direction: 'neutral' as const }
  const sign = diff > 0 ? '+' : ''
  return {
    label: `${sign}${diff} from last period`,
    direction: diff > 0 ? ('up' as const) : ('down' as const),
  }
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
}: {
  features: Features
  initialVoicemails?: VoicemailRow[]
}) {
  const [period, setPeriod] = useState<AnalyticsPeriod>('month')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null)

  // Spam screening data (only fetched if spam features enabled)
  const [screenedToday, setScreenedToday] = useState<{ blocked: number; passed: number; total: number } | null>(null)
  const [recentScreened, setRecentScreened] = useState<ScreenedCallRow[]>([])
  const [voicemails, setVoicemails] = useState<VoicemailRow[]>([])

  // Appointments (only fetched if calendar enabled)
  const [upcomingAppointments, setUpcomingAppointments] = useState<AppointmentRow[]>([])

  // Google Ads (only fetched if ads enabled)
  const [adsTotals, setAdsTotals] = useState<AdsTotals | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    const fetches: Promise<void>[] = []

    // Always fetch analytics
    fetches.push(
      fetch(`/api/dashboard/analytics?period=${period}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed to load analytics'))))
        .then((d: AnalyticsResponse) => {
          if (!cancelled) setAnalytics(d)
        })
    )

    // Spam screening data
    if (features.hasAnyScreening) {
      fetches.push(
        fetch('/api/dashboard/screened-calls?days=1')
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed to load screened calls'))))
          .then((d) => {
            if (!cancelled) {
              setScreenedToday(d.stats)
              setRecentScreened(d.recentCalls ?? [])
            }
          })
      )
      // Voicemails for non-AI businesses (today count)
      if (!features.hasMissedCallAi) {
        fetches.push(
          fetch('/api/dashboard/voicemails')
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed to load voicemails'))))
            .then((d) => {
              if (!cancelled) setVoicemails(d.voicemails ?? [])
            })
        )
      }
    }

    // Upcoming appointments
    if (features.hasCalendar) {
      fetches.push(
        fetch('/api/appointments')
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed to load appointments'))))
          .then((d) => {
            if (!cancelled) {
              const now = new Date()
              const upcoming = (d.appointments ?? d ?? [])
                .filter((a: AppointmentRow) => new Date(a.scheduledAt) >= now && a.status === 'confirmed')
                .slice(0, 5)
              setUpcomingAppointments(upcoming)
            }
          })
      )
    }

    // Google Ads summary (last 30 days)
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

    return () => { cancelled = true }
  }, [period, features.hasAnyScreening, features.hasMissedCallAi, features.hasCalendar, features.googleAds])

  const effectiveLeadsCaptured = useMemo(() => {
    if (!analytics) return 0
    return typeof analytics.leadsCaptured === 'number' ? analytics.leadsCaptured : analytics.leadsCapured
  }, [analytics])

  const periodLabel = useMemo(() => {
    const found = PERIOD_OPTIONS.find((p) => p.value === period)
    return found?.label ?? 'This Month'
  }, [period])

  const totalLeadSources = useMemo(() => {
    if (!analytics) return 0
    return (
      analytics.leadSources.missed_call +
      analytics.leadSources.website_form +
      analytics.leadSources.referral +
      analytics.leadSources.google_ad +
      analytics.leadSources.imports +
      analytics.leadSources.manual
    )
  }, [analytics])

  const voicemailsToday = useMemo(() => {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    return voicemails.filter((v) => new Date(v.createdAt) >= todayStart).length
  }, [voicemails])

  return (
    <div className="space-y-8">
      {/* Header + period picker */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 mt-1">Here&apos;s what&apos;s happening with your business.</p>
        </div>
        <div className="flex flex-wrap items-center gap-1 md:inline-flex bg-white rounded-full border border-gray-200 p-1">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setPeriod(opt.value)}
              className={cn(
                'px-2 py-2 min-h-[44px] md:min-h-0 md:py-1.5 md:px-3 text-sm rounded-full font-medium transition',
                period === opt.value
                  ? 'bg-gray-900 text-white shadow-sm'
                  : 'text-gray-700 hover:bg-gray-100'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* ── Spam Screening Stats ── */}
      {features.hasAnyScreening && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
          <div className="rounded-xl border border-red-200 bg-red-50 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-red-700">Calls Blocked Today</p>
                <p className="text-3xl font-bold text-red-900 mt-1">
                  {loading ? <span className="inline-block w-12 h-8 rounded bg-red-100" /> : screenedToday?.blocked ?? 0}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-red-100">
                <PhoneOff className="h-6 w-6 text-red-600" />
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-green-200 bg-green-50 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-700">Calls Passed Today</p>
                <p className="text-3xl font-bold text-green-900 mt-1">
                  {loading ? <span className="inline-block w-12 h-8 rounded bg-green-100" /> : screenedToday?.passed ?? 0}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-green-100">
                <Phone className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </div>
          {!features.hasMissedCallAi && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-blue-700">Voicemails Today</p>
                  <p className="text-3xl font-bold text-blue-900 mt-1">
                    {loading ? <span className="inline-block w-12 h-8 rounded bg-blue-100" /> : voicemailsToday}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-blue-100">
                  <Mail className="h-6 w-6 text-blue-600" />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Missed Call AI / Lead Capture Stats ── */}
      {features.hasMissedCallAi && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6">
          <MetricCard
            title="Total Calls"
            value={analytics?.totalCalls ?? 0}
            description={`${features.totalCallsMode === 'screened' ? 'Screened calls' : 'Inbound calls'} ${periodLabel.toLowerCase()}`}
            icon={Phone}
            color="blue"
            delta={formatDelta(analytics?.totalCalls ?? 0, analytics?.previousTotalCalls ?? null)}
            loading={loading}
          />
          <MetricCard
            title="Leads Captured"
            value={effectiveLeadsCaptured}
            description="Missed calls & website form leads"
            icon={UserPlus}
            color="blue"
            delta={formatDelta(effectiveLeadsCaptured, analytics?.previousLeadsCaptured ?? null)}
            loading={loading}
          />
          <MetricCard
            title="Messages Sent"
            value={analytics?.messagesSent ?? 0}
            description="Outbound texts sent"
            icon={MessageSquare}
            color="gray"
            loading={loading}
          />
          <MetricCard
            title="Website Leads"
            value={analytics?.websiteLeads ?? 0}
            description="Leads from your website form"
            icon={Globe2}
            color="purple"
            loading={loading}
            emptyCta={(analytics?.websiteLeads ?? 0) === 0 ? 'Get a website to capture more leads' : undefined}
          />
          {features.hasAnyScreening && (
            <>
              <MetricCard
                title="Calls Blocked (Spam)"
                value={analytics?.callsBlocked ?? 0}
                description="Blocked by spam filter"
                icon={Shield}
                color="red"
                loading={loading}
              />
              <MetricCard
                title="Calls Passed (Real)"
                value={analytics?.callsPassed ?? 0}
                description="Real customers that rang through"
                icon={CheckCircle2}
                color="green"
                loading={loading}
              />
            </>
          )}
        </div>
      )}

      {/* ── Google Ads Summary ── */}
      {features.googleAds && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Megaphone className="h-5 w-5 text-blue-600" />
              Google Ads (Last 30 Days)
            </h2>
            <Link href="/dashboard/ads" className="text-sm text-blue-600 hover:text-blue-700 flex items-center">
              View details<ArrowRight className="h-4 w-4 ml-1" />
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="h-5 w-5 text-green-600" />
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Ad Spend</span>
              </div>
              <p className="text-2xl font-bold text-gray-900 tabular-nums">
                {loading ? <span className="inline-block w-20 h-7 rounded bg-gray-100" /> : formatCurrency(adsTotals?.cost ?? 0)}
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <div className="flex items-center gap-2 mb-2">
                <MousePointerClick className="h-5 w-5 text-blue-600" />
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Clicks</span>
              </div>
              <p className="text-2xl font-bold text-gray-900 tabular-nums">
                {loading ? <span className="inline-block w-16 h-7 rounded bg-gray-100" /> : formatNumber(adsTotals?.clicks ?? 0)}
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-5 w-5 text-orange-600" />
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">CTR</span>
              </div>
              <p className="text-2xl font-bold text-gray-900 tabular-nums">
                {loading ? <span className="inline-block w-16 h-7 rounded bg-gray-100" /> : ((adsTotals?.avgCtr ?? 0) * 100).toFixed(2) + '%'}
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="h-5 w-5 text-red-600" />
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Cost / Conv.</span>
              </div>
              <p className="text-2xl font-bold text-gray-900 tabular-nums">
                {loading
                  ? <span className="inline-block w-20 h-7 rounded bg-gray-100" />
                  : adsTotals?.avgCostPerConversion != null
                    ? formatCurrency(adsTotals.avgCostPerConversion)
                    : '—'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Upcoming Appointments ── */}
      {features.hasCalendar && upcomingAppointments.length > 0 && !loading && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Calendar className="h-5 w-5 text-blue-600" />
              Upcoming Quote Visits
            </h2>
            <Link href="/dashboard/appointments" className="text-sm text-blue-600 hover:text-blue-700 flex items-center">
              View all<ArrowRight className="h-4 w-4 ml-1" />
            </Link>
          </div>
          <div className="divide-y divide-gray-100">
            {upcomingAppointments.map((apt) => (
              <div key={apt.id} className="px-6 py-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">{apt.customerName}</p>
                  <p className="text-sm text-gray-500">{apt.serviceType} · {formatPhoneNumber(apt.customerPhone)}</p>
                </div>
                <div className="text-right">
                  <p className="font-medium text-gray-900">
                    {new Date(apt.scheduledAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </p>
                  <p className="text-sm text-gray-500">
                    {new Date(apt.scheduledAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Spam Screening Recent Activity (non-AI businesses) ── */}
      {features.hasAnyScreening && !features.hasMissedCallAi && !loading && (
        <div className="bg-white rounded-xl border border-gray-200 w-full">
          <div className="px-4 md:px-6 py-4 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center">
              <PhoneCall className="h-5 w-5 text-blue-600 mr-2 shrink-0" />
              <h2 className="text-lg font-semibold text-gray-900">Recent Screened Calls</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/dashboard/blocked-calls" className="text-sm text-blue-600 hover:text-blue-700 min-h-[44px] flex items-center py-2">
                View all calls
              </Link>
              <span className="text-gray-300 hidden sm:inline self-center">|</span>
              <Link href="/dashboard/voicemails" className="text-sm text-blue-600 hover:text-blue-700 min-h-[44px] flex items-center py-2">
                View voicemails
              </Link>
            </div>
          </div>
          {recentScreened.length === 0 ? (
            <div className="p-4 md:p-6 text-center py-12">
              <PhoneCall className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No recent calls</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {recentScreened.slice(0, 10).map((call) => (
                <li key={call.id} className="px-4 md:px-6 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 hover:bg-gray-50/50">
                  <div className="flex items-center gap-3">
                    <PhoneCall className="h-4 w-4 text-gray-400 shrink-0" />
                    <span className="font-mono text-gray-900">{formatPhoneNumber(call.callerPhone)}</span>
                    <span className={call.result === 'passed' ? 'text-green-600 text-sm font-medium' : 'text-red-600 text-sm font-medium'}>
                      {call.result === 'passed' ? 'Passed' : 'Blocked'}
                    </span>
                  </div>
                  <span className="text-sm text-gray-500 sm:ml-auto">{new Date(call.createdAt).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ── Recent Voicemails — non-AI clients (all voicemails) and AI clients with
            known-contact voicemail routing (labeled "Voicemails from Contacts") ── */}
      {(!features.hasMissedCallAi || features.knownContactVoicemailEnabled) && initialVoicemails.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 w-full">
          <div className="px-4 md:px-6 py-4 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center">
              <Mail className="h-5 w-5 text-blue-600 mr-2 shrink-0" />
              <h2 className="text-lg font-semibold text-gray-900">
                {features.hasMissedCallAi ? 'Voicemails from Contacts' : 'Recent Voicemails'}
              </h2>
            </div>
            <Link href="/dashboard/voicemails" className="text-sm text-blue-600 hover:text-blue-700 min-h-[44px] flex items-center py-2">
              View all voicemails
            </Link>
          </div>
          <ul className="divide-y divide-gray-100">
            {initialVoicemails.map((vm) => (
              <li key={vm.conversationId} className="px-4 md:px-6 py-4 flex flex-col gap-1">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-gray-900">
                      {vm.contactName ?? formatPhoneNumber(vm.callerPhone)}
                    </p>
                    {vm.contactName && (
                      <p className="text-sm text-gray-500 font-mono">{formatPhoneNumber(vm.callerPhone)}</p>
                    )}
                  </div>
                  <span className="text-sm text-gray-500 whitespace-nowrap">
                    {formatRelativeTime(new Date(vm.createdAt))}
                  </span>
                </div>
                {vm.voicemailTranscription && (
                  <p className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2 line-clamp-2">
                    {vm.voicemailTranscription}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Lead Sources + Recent Activity (two-column) ── */}
      {features.hasMissedCallAi && (
        <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-2">
          {/* Lead sources */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6 flex flex-col w-full">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Lead Sources</h2>
                <p className="text-sm text-gray-500">
                  Where your leads are coming from {periodLabel === 'All Time' ? '' : periodLabel.toLowerCase()}.
                </p>
              </div>
            </div>

            {loading ? (
              <div className="flex-1 flex items-center justify-center text-sm text-gray-500">
                Loading lead sources...
              </div>
            ) : !analytics || totalLeadSources === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center text-sm text-gray-500 py-8">
                <BarChart3 className="h-8 w-8 text-gray-300 mb-3" />
                <p>No leads captured yet.</p>
                <p className="text-gray-400 mt-1">
                  As leads come in from missed calls and your website, you&apos;ll see them broken
                  down here.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {(
                  ['missed_call', 'website_form', 'referral', 'google_ad', 'imports', 'manual'] as LeadSourceKey[]
                ).map((sourceKey) => {
                  const count = analytics.leadSources[sourceKey]
                  if (!count) return null
                  const percentage = totalLeadSources > 0 ? Math.round((count / totalLeadSources) * 100) : 0
                  const label = SOURCE_LABELS[sourceKey] ?? sourceKey.replace(/_/g, ' ')
                  const colorClass = SOURCE_COLORS[sourceKey] ?? 'bg-gray-100 text-gray-800 border border-gray-200'

                  return (
                    <div key={sourceKey} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className={cn('inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold uppercase tracking-wide', colorClass)}>
                            {label}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <span>{count} leads</span>
                          <span>·</span>
                          <span>{percentage}%</span>
                        </div>
                      </div>
                      <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all',
                            sourceKey === 'missed_call' && 'bg-orange-400',
                            sourceKey === 'website_form' && 'bg-blue-500',
                            sourceKey === 'referral' && 'bg-green-500',
                            sourceKey === 'google_ad' && 'bg-purple-500',
                            sourceKey === 'imports' && 'bg-yellow-400',
                            sourceKey === 'manual' && 'bg-gray-500'
                          )}
                          style={{ width: `${Math.max(4, percentage)}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Recent activity */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6 w-full">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
                <p className="text-sm text-gray-500">
                  Latest leads, messages, and interactions.
                </p>
              </div>
            </div>

            {loading ? (
              <div className="py-6 text-center text-sm text-gray-500">Loading activity...</div>
            ) : !analytics || analytics.recentActivity.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-500">
                <p>No activity yet.</p>
                <p className="text-gray-400 mt-1">
                  As new leads, messages, and jobs come in, they&apos;ll appear here.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {analytics.recentActivity.map((item) => {
                  const Icon = ACTIVITY_ICONS[item.type] ?? MessageSquare
                  const typeLabel = ACTIVITY_TYPE_LABELS[item.type] ?? item.type.replace(/_/g, ' ')
                  return (
                    <div key={item.id} className="flex gap-3 px-1 py-3">
                      <div className="flex-shrink-0 w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center">
                        <Icon className="h-4 w-4 text-gray-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {item.description}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5 flex flex-wrap gap-1 items-center">
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-700 text-[11px] font-medium">
                                {typeLabel}
                              </span>
                              {item.contactName && (
                                <>
                                  <span>·</span>
                                  <span className="truncate max-w-[180px]">{item.contactName}</span>
                                </>
                              )}
                            </p>
                          </div>
                          <span className="text-xs text-gray-400 whitespace-nowrap">
                            {formatRelativeTime(new Date(item.createdAt))}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

type MetricCardProps = {
  title: string
  value: number
  description: string
  icon: React.ComponentType<{ className?: string }>
  color: 'blue' | 'red' | 'green' | 'purple' | 'gray'
  loading?: boolean
  delta?: { label: string; direction: 'up' | 'down' | 'neutral' }
  emptyCta?: string
}

function MetricCard({ title, value, description, icon: Icon, color, loading, delta, emptyCta }: MetricCardProps) {
  const baseColor =
    color === 'blue'
      ? 'text-blue-600 bg-blue-50'
      : color === 'red'
      ? 'text-red-600 bg-red-50'
      : color === 'green'
      ? 'text-green-600 bg-green-50'
      : color === 'purple'
      ? 'text-purple-600 bg-purple-50'
      : 'text-gray-700 bg-gray-50'

  const deltaColor =
    delta?.direction === 'up'
      ? 'text-emerald-700 bg-emerald-50'
      : delta?.direction === 'down'
      ? 'text-red-700 bg-red-50'
      : 'text-gray-600 bg-gray-100'

  return (
    <div className="relative overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="p-5 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="mt-2 text-3xl font-bold text-gray-900 tabular-nums">
            {loading ? <span className="inline-block w-16 h-7 rounded bg-gray-100" /> : value}
          </p>
          <p className="mt-1 text-sm text-gray-500">{description}</p>
          {delta && (
            <div className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border border-transparent">
              <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full', deltaColor)}>
                {delta.direction === 'up' && <ArrowUpRight className="h-3 w-3" />}
                {delta.direction === 'down' && <ArrowDownRight className="h-3 w-3" />}
                <span>{delta.label}</span>
              </span>
            </div>
          )}
          {emptyCta && value === 0 && (
            <p className="mt-3 text-xs text-blue-700 bg-blue-50 rounded-md px-2 py-1 inline-block">
              {emptyCta}
            </p>
          )}
        </div>
        <div className={cn('p-3 rounded-xl', baseColor)}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
    </div>
  )
}
