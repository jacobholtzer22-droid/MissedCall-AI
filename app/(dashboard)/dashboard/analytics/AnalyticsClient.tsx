'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  Globe2,
  MessageSquare,
  Phone,
  Shield,
  UserPlus,
} from 'lucide-react'
import { formatRelativeTime } from '@/lib/utils'
import { cn } from '@/lib/utils'

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

const PERIOD_OPTIONS: { label: string; value: AnalyticsPeriod }[] = [
  { label: 'Today', value: 'today' },
  { label: 'This Week', value: 'week' },
  { label: 'This Month', value: 'month' },
  { label: 'All Time', value: 'all' },
]

// Match source badge colors from contacts page
const SOURCE_COLORS: Record<string, string> = {
  missed_call: 'bg-orange-100 text-orange-800 border border-orange-200',
  website_form: 'bg-blue-100 text-blue-800 border border-blue-200',
  referral: 'bg-green-100 text-green-800 border border-green-200',
  google_ad: 'bg-purple-100 text-purple-800 border border-purple-200',
  jobber_import: 'bg-yellow-100 text-yellow-800 border border-yellow-200',
  manual: 'bg-gray-100 text-gray-800 border border-gray-200',
  sms_conversation: 'bg-indigo-100 text-indigo-700',
  servicetitan_import: 'bg-teal-100 text-teal-800 border border-teal-200',
  housecallpro_import: 'bg-indigo-100 text-indigo-800 border border-indigo-200',
  quickbooks_import: 'bg-green-100 text-green-800 border border-green-200',
  square_import: 'bg-slate-100 text-slate-800 border border-slate-200',
  google_contacts_import: 'bg-red-100 text-red-800 border border-red-200',
  excel_import: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
  other_crm_import: 'bg-cyan-100 text-cyan-800 border border-cyan-200',
  manual_list: 'bg-gray-100 text-gray-800 border border-gray-200',
}

const SOURCE_LABELS: Record<string, string> = {
  missed_call: 'Missed Call',
  website_form: 'Website Form',
  referral: 'Referral',
  google_ad: 'Google Ad',
  jobber_import: 'Jobber Import',
  manual: 'Manual Entry',
  servicetitan_import: 'ServiceTitan',
  housecallpro_import: 'Housecall Pro',
  quickbooks_import: 'QuickBooks',
  square_import: 'Square',
  google_contacts_import: 'Google Contacts',
  excel_import: 'Excel Import',
  other_crm_import: 'Other CRM',
  manual_list: 'Manual List',
  imports: 'Imports',
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

export function AnalyticsClient() {
  const [period, setPeriod] = useState<AnalyticsPeriod>('month')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<AnalyticsResponse | null>(null)

  useEffect(() => {
    let isMounted = true
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/dashboard/analytics?period=${period}`)
        if (!res.ok) {
          throw new Error('Failed to load analytics')
        }
        const json = await res.json()
        if (!isMounted) return
        setData(json as AnalyticsResponse)
      } catch (err) {
        console.error(err)
        if (isMounted) setError('Something went wrong loading analytics.')
      } finally {
        if (isMounted) setLoading(false)
      }
    }
    void load()
    return () => {
      isMounted = false
    }
  }, [period])

  const effectiveLeadsCaptured = useMemo(() => {
    if (!data) return 0
    return typeof data.leadsCaptured === 'number' ? data.leadsCaptured : data.leadsCapured
  }, [data])

  const periodLabel = useMemo(() => {
    const found = PERIOD_OPTIONS.find((p) => p.value === period)
    return found?.label ?? 'This Month'
  }, [period])

  const totalLeadSources = useMemo(() => {
    if (!data) return 0
    return (
      data.leadSources.missed_call +
      data.leadSources.website_form +
      data.leadSources.referral +
      data.leadSources.google_ad +
      data.leadSources.imports +
      data.leadSources.manual
    )
  }, [data])

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-blue-600" />
            Analytics
          </h1>
          <p className="text-gray-500 mt-1">
            See how MissedCall AI is capturing leads and blocking spam for your business.
          </p>
        </div>
        <div className="inline-flex items-center gap-1 bg-white rounded-full border border-gray-200 p-1">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setPeriod(opt.value)}
              className={cn(
                'px-3 py-1.5 text-sm rounded-full font-medium transition',
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

      {/* Metric cards */}
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          title="Total Calls"
          value={data?.totalCalls ?? 0}
          description={`Screened calls ${periodLabel.toLowerCase()}`}
          icon={Phone}
          color="blue"
          delta={formatDelta(data?.totalCalls ?? 0, data?.previousTotalCalls ?? null)}
          loading={loading}
        />
        <MetricCard
          title="Calls Blocked (Spam)"
          value={data?.callsBlocked ?? 0}
          description="Blocked by spam filter"
          icon={Shield}
          color="red"
          loading={loading}
        />
        <MetricCard
          title="Calls Passed (Real)"
          value={data?.callsPassed ?? 0}
          description="Real customers that rang through"
          icon={CheckCircle2}
          color="green"
          loading={loading}
        />
        <MetricCard
          title="Leads Captured"
          value={effectiveLeadsCaptured}
          description="Missed calls & website form leads"
          icon={UserPlus}
          color="blue"
          delta={formatDelta(effectiveLeadsCaptured, data?.previousLeadsCaptured ?? null)}
          loading={loading}
        />
        <MetricCard
          title="Website Leads"
          value={data?.websiteLeads ?? 0}
          description="Leads from your website form"
          icon={Globe2}
          color="purple"
          loading={loading}
          emptyCta={
            (data?.websiteLeads ?? 0) === 0
              ? 'Get a website to capture more leads'
              : undefined
          }
        />
        <MetricCard
          title="Messages Sent"
          value={data?.messagesSent ?? 0}
          description="Outbound texts sent by MissedCall AI and your team"
          icon={MessageSquare}
          color="gray"
          loading={loading}
        />
      </div>

      {/* Lower sections */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Lead sources */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col">
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
          ) : !data || totalLeadSources === 0 ? (
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
                [
                  'missed_call',
                  'website_form',
                  'referral',
                  'google_ad',
                  'imports',
                  'manual',
                ] as LeadSourceKey[]
              ).map((sourceKey) => {
                const count = data.leadSources[sourceKey]
                if (!count) return null
                const percentage = totalLeadSources > 0 ? Math.round((count / totalLeadSources) * 100) : 0
                const label = SOURCE_LABELS[sourceKey] ?? sourceKey.replace(/_/g, ' ')
                const colorClass =
                  sourceKey === 'imports'
                    ? 'bg-yellow-100 text-yellow-800 border border-yellow-200'
                    : SOURCE_COLORS[sourceKey] ?? 'bg-gray-100 text-gray-800 border border-gray-200'

                return (
                  <div key={sourceKey} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold uppercase tracking-wide',
                            colorClass
                          )}
                        >
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
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
              <p className="text-sm text-gray-500">
                Latest leads, messages, jobs, and interactions across your CRM.
              </p>
            </div>
          </div>

          {loading ? (
            <div className="py-6 text-center text-sm text-gray-500">Loading activity...</div>
          ) : !data || data.recentActivity.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-500">
              <p>No activity yet.</p>
              <p className="text-gray-400 mt-1">
                As new leads, messages, and jobs come in, they&apos;ll appear here in a live
                timeline.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {data.recentActivity.map((item) => {
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

function MetricCard({
  title,
  value,
  description,
  icon: Icon,
  color,
  loading,
  delta,
  emptyCta,
}: MetricCardProps) {
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

