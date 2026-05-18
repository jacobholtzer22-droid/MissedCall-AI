'use client'

import { useState, useCallback, useMemo } from 'react'
import { HeaderKPIs } from './HeaderKPIs'
import { AdminTools } from './AdminTools'
import { ClientTable } from './ClientTable'
import { ClientDetailPanel } from './ClientDetailPanel'
import type { AdminBusiness } from './types'

type StatusFilter = 'all' | 'active' | 'trialing' | 'past_due' | 'canceled'
type SortKey = 'last_activity' | 'name' | 'mrr' | 'convos'

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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortKey, setSortKey] = useState<SortKey>('last_activity')
  const [toasts, setToasts] = useState<Toast[]>([])
  const [refreshing, setRefreshing] = useState(false)

  const addToast = useCallback((message: string, type: 'success' | 'error') => {
    const id = Math.random().toString(36).slice(2)
    setToasts(t => [...t, { id, message, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000)
  }, [])

  const updateBusiness = useCallback((updated: AdminBusiness) => {
    setBusinesses(prev => prev.map(b => b.id === updated.id ? updated : b))
    setSelectedBusiness(prev => prev?.id === updated.id ? updated : prev)
  }, [])

  const refreshBusinesses = useCallback(async () => {
    setRefreshing(true)
    try {
      const res = await fetch('/api/admin/businesses')
      if (res.ok) {
        const data = await res.json()
        setBusinesses(data.businesses)
        // Keep selectedBusiness in sync if open
        setSelectedBusiness(prev => {
          if (!prev) return null
          return data.businesses.find((b: AdminBusiness) => b.id === prev.id) ?? prev
        })
      }
    } finally {
      setRefreshing(false)
    }
  }, [])

  const filtered = useMemo(() => {
    return businesses
      .filter(b => {
        if (!search) return true
        const q = search.toLowerCase()
        return (
          b.name.toLowerCase().includes(q) ||
          (b.telnyxPhoneNumber ?? '').includes(q) ||
          (b.businessType ?? '').toLowerCase().includes(q)
        )
      })
      .filter(b => statusFilter === 'all' || b.subscriptionStatus === statusFilter)
      .sort((a, b) => {
        switch (sortKey) {
          case 'name': return a.name.localeCompare(b.name)
          case 'mrr': return (b.monthlyFee ?? 0) - (a.monthlyFee ?? 0)
          case 'convos': return b.conversationsThisMonth - a.conversationsThisMonth
          case 'last_activity':
          default:
            return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        }
      })
  }, [businesses, search, statusFilter, sortKey])

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-900/50 px-4 sm:px-6 py-4">
        <div className="max-w-screen-2xl mx-auto flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Admin Dashboard</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              {businesses.length} client{businesses.length !== 1 ? 's' : ''}
              {refreshing && <span className="ml-2 text-gray-500">Refreshing...</span>}
            </p>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <AdminTools onToast={addToast} onRefresh={refreshBusinesses} />
            <a href="/dashboard" className="text-sm text-gray-400 hover:text-white transition whitespace-nowrap">
              ← Dashboard
            </a>
          </div>
        </div>
      </div>

      <div className="max-w-screen-2xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6">
        <HeaderKPIs businesses={businesses} />

        {/* Controls bar */}
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="text"
            placeholder="Search clients..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 flex-1 min-w-[140px] sm:w-56 sm:flex-none focus:outline-none focus:border-gray-600"
          />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as StatusFilter)}
            className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="trialing">Trialing</option>
            <option value="past_due">Past Due</option>
            <option value="canceled">Canceled</option>
          </select>
          <select
            value={sortKey}
            onChange={e => setSortKey(e.target.value as SortKey)}
            className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white"
          >
            <option value="last_activity">Last Activity</option>
            <option value="name">Name</option>
            <option value="mrr">MRR</option>
            <option value="convos">Conversations</option>
          </select>
          <span className="text-xs text-gray-600 hidden sm:inline">
            {filtered.length !== businesses.length
              ? `${filtered.length} of ${businesses.length}`
              : `${businesses.length} total`}
          </span>
        </div>

        <ClientTable
          businesses={filtered}
          selectedId={selectedBusiness?.id}
          onSelect={setSelectedBusiness}
        />
      </div>

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
      <div className="fixed bottom-4 right-4 space-y-2 z-[100] pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`px-4 py-2.5 rounded-lg text-sm font-medium shadow-lg pointer-events-auto ${
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
