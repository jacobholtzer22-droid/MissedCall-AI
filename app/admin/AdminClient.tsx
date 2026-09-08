'use client'

import { useState, useCallback, useMemo } from 'react'
import { AlertsPanel, FleetLine } from './AlertsPanel'
import { AdminTools } from './AdminTools'
import { ClientGrid } from './ClientGrid'
import { ClientDetailPanel } from './ClientDetailPanel'
import type { AdminBusiness, AdminHealth } from './types'

type Chip = 'all' | 'attention' | 'phone' | 'web' | 'ads'
type SortKey = 'health' | 'last_activity' | 'name' | 'missed' | 'web_leads'

const CHIPS: { key: Chip; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'attention', label: 'Needs attention' },
  { key: 'phone', label: 'Phone' },
  { key: 'web', label: 'Web only' },
  { key: 'ads', label: 'Ads' },
]

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'health', label: 'Health' },
  { key: 'last_activity', label: 'Last activity' },
  { key: 'name', label: 'Name' },
  { key: 'missed', label: 'Missed calls' },
  { key: 'web_leads', label: 'Web leads' },
]

const HEALTH_ORDER: Record<AdminHealth, number> = { red: 0, yellow: 1, green: 2, gray: 3 }

function ts(iso: string | null): number {
  return iso ? new Date(iso).getTime() : Number.NEGATIVE_INFINITY
}

/** Newest first, nulls last. */
function byLastActivityDesc(a: AdminBusiness, b: AdminBusiness): number {
  return ts(b.stats.lastActivityAt) - ts(a.stats.lastActivityAt)
}

export interface Toast {
  id: string
  message: string
  type: 'success' | 'error'
}

interface Props {
  initialBusinesses: AdminBusiness[]
}

export function AdminClient({ initialBusinesses }: Props) {
  const [businesses, setBusinesses] = useState<AdminBusiness[]>(initialBusinesses)
  const [selectedBusiness, setSelectedBusiness] = useState<AdminBusiness | null>(null)
  const [search, setSearch] = useState('')
  const [chip, setChip] = useState<Chip>('all')
  const [sortKey, setSortKey] = useState<SortKey>('health')
  const [showCanceled, setShowCanceled] = useState(false)
  const [showRevenue] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [refreshing, setRefreshing] = useState(false)

  const addToast = useCallback((message: string, type: 'success' | 'error') => {
    const id = Math.random().toString(36).slice(2)
    setToasts(t => [...t, { id, message, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000)
  }, [])

  const updateBusiness = useCallback((updated: AdminBusiness) => {
    setBusinesses(prev => prev.map(b => (b.id === updated.id ? updated : b)))
    setSelectedBusiness(prev => (prev?.id === updated.id ? updated : prev))
  }, [])

  const refreshBusinesses = useCallback(async () => {
    setRefreshing(true)
    try {
      const res = await fetch('/api/admin/businesses')
      if (res.ok) {
        const data = await res.json()
        setBusinesses(data.businesses)
        setSelectedBusiness(prev => {
          if (!prev) return null
          return data.businesses.find((b: AdminBusiness) => b.id === prev.id) ?? prev
        })
      } else {
        addToast('Refresh failed. Try again.', 'error')
      }
    } catch {
      addToast('Refresh failed. Check your connection and try again.', 'error')
    } finally {
      setRefreshing(false)
    }
  }, [addToast])

  const clearFilter = useCallback(() => {
    setSearch('')
    setChip('all')
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return businesses
      .filter(b => showCanceled || b.subscriptionStatus !== 'canceled')
      .filter(b => {
        if (!q) return true
        return (
          b.name.toLowerCase().includes(q) ||
          (b.telnyxPhoneNumber ?? '').includes(q) ||
          (b.businessType ?? '').toLowerCase().includes(q)
        )
      })
      .filter(b => {
        switch (chip) {
          case 'attention':
            return b.health === 'red' || b.health === 'yellow'
          case 'phone':
            return Boolean(b.telnyxPhoneNumber)
          case 'web':
            return !b.telnyxPhoneNumber
          case 'ads':
            return b.googleAdsEnabled
          default:
            return true
        }
      })
      .sort((a, b) => {
        switch (sortKey) {
          case 'name':
            return a.name.localeCompare(b.name)
          case 'last_activity':
            return byLastActivityDesc(a, b) || a.name.localeCompare(b.name)
          case 'missed':
            return b.stats.missedCallsMonth - a.stats.missedCallsMonth || byLastActivityDesc(a, b)
          case 'web_leads':
            return b.stats.webLeadsMonth - a.stats.webLeadsMonth || byLastActivityDesc(a, b)
          case 'health':
          default:
            return HEALTH_ORDER[a.health] - HEALTH_ORDER[b.health] || byLastActivityDesc(a, b)
        }
      })
  }, [businesses, search, chip, sortKey, showCanceled])

  const control =
    'bg-gray-900 border border-gray-800 rounded-lg px-3 text-sm text-gray-100 min-h-[44px] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500'

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <header className="border-b border-gray-800 px-3 sm:px-6">
        <div className="max-w-screen-2xl mx-auto flex items-center justify-between gap-3 min-h-[56px]">
          <h1 className="text-lg font-semibold">
            Admin
            {refreshing && <span className="ml-2 text-sm font-normal text-gray-500">Refreshing</span>}
          </h1>
          <div className="flex items-center gap-2">
            <AdminTools onToast={addToast} onRefresh={refreshBusinesses} />
            <a
              href="/dashboard"
              className="inline-flex items-center text-sm text-gray-400 hover:text-gray-100 whitespace-nowrap min-h-[44px] px-2 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              ← Dashboard
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-screen-2xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-5">
        <AlertsPanel businesses={businesses} onSelect={setSelectedBusiness} />
        <FleetLine businesses={businesses} />

        {/* Controls */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              placeholder="Search clients"
              aria-label="Search clients"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className={`${control} flex-1 min-w-[160px] sm:flex-none sm:w-64 placeholder-gray-500`}
            />
            <label className="inline-flex items-center gap-2 text-sm text-gray-400 min-h-[44px]">
              <span className="sr-only sm:not-sr-only">Sort</span>
              <select
                aria-label="Sort clients"
                value={sortKey}
                onChange={e => setSortKey(e.target.value as SortKey)}
                className={control}
              >
                {SORTS.map(s => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-gray-400 min-h-[44px] px-1 cursor-pointer">
              <input
                type="checkbox"
                checked={showCanceled}
                onChange={e => setShowCanceled(e.target.checked)}
                className="h-4 w-4 rounded border-gray-700 bg-gray-900 accent-blue-500"
              />
              Show canceled
            </label>
          </div>
          <div
            role="group"
            aria-label="Filter clients"
            className="flex gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] -mx-3 px-3 sm:mx-0 sm:px-0"
          >
            {CHIPS.map(c => {
              const active = chip === c.key
              return (
                <button
                  key={c.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setChip(c.key)}
                  className={`whitespace-nowrap shrink-0 rounded-full border px-3 min-h-[44px] text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                    active
                      ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                      : 'border-gray-800 bg-gray-900 text-gray-400'
                  }`}
                >
                  {c.label}
                </button>
              )
            })}
            <span className="self-center shrink-0 text-xs text-gray-500 pl-1">
              {filtered.length} of {businesses.length}
            </span>
          </div>
        </div>

        <ClientGrid
          businesses={filtered}
          selectedId={selectedBusiness?.id}
          showRevenue={showRevenue}
          onSelect={setSelectedBusiness}
          onClearFilter={clearFilter}
        />
      </main>

      {/* Detail panel */}
      {selectedBusiness && (
        <ClientDetailPanel
          business={selectedBusiness}
          onClose={() => setSelectedBusiness(null)}
          onUpdateBusiness={updateBusiness}
          onToast={addToast}
        />
      )}

      {/* Toast stack */}
      <div className="fixed bottom-4 right-4 space-y-2 z-[100] pointer-events-none" aria-live="polite">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`px-4 py-2.5 rounded-lg text-sm font-medium pointer-events-auto ${
              t.type === 'success' ? 'bg-green-700 text-white' : 'bg-red-700 text-white'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </div>
  )
}
