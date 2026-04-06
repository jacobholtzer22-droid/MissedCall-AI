'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Megaphone, DollarSign, MousePointerClick, Eye, Target, TrendingUp, RefreshCw } from 'lucide-react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'

type RangePreset = '7d' | '30d' | '90d' | 'custom'

type Totals = {
  impressions: number
  clicks: number
  cost: number
  conversions: number
  avgCtr: number
  avgCostPerConversion: number | null
}

type DailyRow = {
  date: string
  impressions: number
  clicks: number
  cost: number
  conversions: number
}

type CampaignRow = {
  campaignId: string
  campaignName: string
  impressions: number
  clicks: number
  cost: number
  conversions: number
  ctr: number
  costPerConversion: number | null
}

type AdsResponse = {
  totals: Totals
  daily: DailyRow[]
  campaigns: CampaignRow[]
  lastSyncedAt: string | null
}

const RANGE_OPTIONS: { label: string; value: RangePreset }[] = [
  { label: 'Last 7 Days', value: '7d' },
  { label: 'Last 30 Days', value: '30d' },
  { label: 'Last 90 Days', value: '90d' },
]

function rangeToParams(range: RangePreset, customStart?: string, customEnd?: string) {
  if (range === 'custom' && customStart && customEnd) {
    return `startDate=${customStart}&endDate=${customEnd}`
  }
  const now = new Date()
  const end = now.toISOString().split('T')[0]
  const start = new Date(now)
  if (range === '7d') start.setDate(start.getDate() - 7)
  else if (range === '90d') start.setDate(start.getDate() - 90)
  else start.setDate(start.getDate() - 30)
  return `startDate=${start.toISOString().split('T')[0]}&endDate=${end}`
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-US').format(n)
}

function formatPercent(n: number): string {
  return (n * 100).toFixed(2) + '%'
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatRelativeTimestamp(iso: string): string {
  const d = new Date(iso)
  const now = Date.now()
  const diffMs = now - d.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHr = Math.floor(diffMin / 60)

  if (diffMs < 0) return 'just now'
  if (diffSec < 60) return 'just now'
  if (diffMin === 1) return '1 minute ago'
  if (diffMin < 60) return `${diffMin} minutes ago`
  if (diffHr === 1) return '1 hour ago'
  if (diffHr < 24) return `${diffHr} hours ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function AdsClient() {
  const [range, setRange] = useState<RangePreset>('30d')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<AdsResponse | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = rangeToParams(range, customStart, customEnd)
      const res = await fetch(`/api/dashboard/google-ads?${params}`)
      if (!res.ok) throw new Error('Failed to load ad data')
      const json = (await res.json()) as AdsResponse
      setData(json)
      if (json.lastSyncedAt) setLastSyncedAt(json.lastSyncedAt)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }, [range, customStart, customEnd])

  useEffect(() => {
    let cancelled = false
    void fetchData().then(() => { if (cancelled) { /* noop */ } })
    return () => { cancelled = true }
  }, [fetchData])

  async function handleRefresh() {
    setSyncing(true)
    try {
      const res = await fetch('/api/dashboard/google-ads/sync', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Sync failed')
      setLastSyncedAt(json.lastSyncedAt || new Date().toISOString())
      await fetchData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  const chartData = useMemo(() => {
    if (!data) return []
    return data.daily.map((d) => ({
      ...d,
      label: formatShortDate(d.date),
    }))
  }, [data])

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Megaphone className="h-6 w-6 text-blue-600" />
            Google Ads
          </h1>
          <p className="text-gray-500 mt-1">
            Campaign performance and spend tracking.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap items-center gap-1 md:inline-flex bg-white rounded-full border border-gray-200 p-1">
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setRange(opt.value)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
                  range === opt.value
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {opt.label}
              </button>
            ))}
            <button
              onClick={() => setRange('custom')}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
                range === 'custom'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Custom
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={syncing}
              title="Refresh data from Google Ads"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition"
            >
              <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing…' : 'Refresh Data'}
            </button>
            {lastSyncedAt && (
              <span className="text-xs text-gray-400">
                Last updated: {formatRelativeTimestamp(lastSyncedAt)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Custom date range */}
      {range === 'custom' && (
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
            />
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && data && data.daily.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Megaphone className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No ad data available yet</h3>
          <p className="text-gray-500">Data syncs daily. Check back after your first sync.</p>
        </div>
      )}

      {/* Content */}
      {!loading && !error && data && data.daily.length > 0 && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <SummaryCard
              icon={<DollarSign className="h-5 w-5 text-green-600" />}
              label="Total Spend"
              value={formatCurrency(data.totals.cost)}
            />
            <SummaryCard
              icon={<MousePointerClick className="h-5 w-5 text-blue-600" />}
              label="Total Clicks"
              value={formatNumber(data.totals.clicks)}
            />
            <SummaryCard
              icon={<Eye className="h-5 w-5 text-purple-600" />}
              label="Impressions"
              value={formatNumber(data.totals.impressions)}
            />
            <SummaryCard
              icon={<TrendingUp className="h-5 w-5 text-orange-600" />}
              label="Avg CTR"
              value={formatPercent(data.totals.avgCtr)}
            />
            <SummaryCard
              icon={<Target className="h-5 w-5 text-indigo-600" />}
              label="Conversions"
              value={formatNumber(data.totals.conversions)}
            />
            <SummaryCard
              icon={<DollarSign className="h-5 w-5 text-red-600" />}
              label="Cost / Conv."
              value={data.totals.avgCostPerConversion != null ? formatCurrency(data.totals.avgCostPerConversion) : '—'}
            />
          </div>

          {/* Daily trend chart */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Daily Trends</h2>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 12, fill: '#6b7280' }}
                    tickLine={false}
                    axisLine={{ stroke: '#e5e7eb' }}
                  />
                  <YAxis
                    yAxisId="left"
                    tick={{ fontSize: 12, fill: '#6b7280' }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => `$${v}`}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fontSize: 12, fill: '#6b7280' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid #e5e7eb',
                      fontSize: '13px',
                    }}
                    formatter={(value, name) => {
                      const v = Number(value)
                      const n = String(name)
                      if (n === 'Spend') return [formatCurrency(v), n]
                      return [formatNumber(v), n]
                    }}
                  />
                  <Legend />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="cost"
                    name="Spend"
                    stroke="#2563eb"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="clicks"
                    name="Clicks"
                    stroke="#16a34a"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Campaign breakdown table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Campaign Breakdown</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-gray-500 font-medium">
                    <th className="px-6 py-3">Campaign</th>
                    <th className="px-4 py-3 text-right">Impressions</th>
                    <th className="px-4 py-3 text-right">Clicks</th>
                    <th className="px-4 py-3 text-right">CTR</th>
                    <th className="px-4 py-3 text-right">Spend</th>
                    <th className="px-4 py-3 text-right">Conversions</th>
                    <th className="px-4 py-3 text-right">Cost / Conv.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.campaigns.map((c) => (
                    <tr key={c.campaignId} className="hover:bg-gray-50 transition">
                      <td className="px-6 py-3 font-medium text-gray-900 max-w-xs truncate">
                        {c.campaignName}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700 tabular-nums">
                        {formatNumber(c.impressions)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700 tabular-nums">
                        {formatNumber(c.clicks)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700 tabular-nums">
                        {formatPercent(c.ctr)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700 tabular-nums">
                        {formatCurrency(c.cost)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700 tabular-nums">
                        {formatNumber(c.conversions)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700 tabular-nums">
                        {c.costPerConversion != null ? formatCurrency(c.costPerConversion) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-xl font-bold text-gray-900 tabular-nums">{value}</p>
    </div>
  )
}
