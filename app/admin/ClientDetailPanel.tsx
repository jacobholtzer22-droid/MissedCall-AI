'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { TogglesTab } from './ClientDetailPanel/TogglesTab'
import { SettingsTab } from './ClientDetailPanel/SettingsTab'
import { ToolsTab } from './ClientDetailPanel/ToolsTab'
import type { AdminBusiness } from './types'

type Tab = 'toggles' | 'settings' | 'tools'

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-500/10 text-green-400 border-green-500/20',
  trialing: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  past_due: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  canceled: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  trialing: 'Trialing',
  past_due: 'Past Due',
  canceled: 'Canceled',
}

interface Props {
  business: AdminBusiness
  onClose: () => void
  onUpdateBusiness: (updated: AdminBusiness) => void
  onToast: (message: string, type: 'success' | 'error') => void
}

export function ClientDetailPanel({ business, onClose, onUpdateBusiness, onToast }: Props) {
  const [tab, setTab] = useState<Tab>('toggles')

  // Reset to Toggles tab when switching to a different business
  const [prevId, setPrevId] = useState(business.id)
  if (prevId !== business.id) {
    setPrevId(business.id)
    setTab('toggles')
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      {/* Dimming backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
        aria-hidden
      />

      {/* Slide-in panel */}
      <div className="fixed top-0 right-0 h-full w-full sm:w-[520px] lg:w-[600px] bg-gray-900 border-l border-gray-800 z-50 flex flex-col shadow-2xl">
        {/* Panel header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-800 shrink-0 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-bold text-white truncate text-sm sm:text-base">{business.name}</span>
            <span
              className={`shrink-0 text-xs px-2 py-0.5 rounded-full border ${
                STATUS_COLORS[business.subscriptionStatus] ?? STATUS_COLORS.canceled
              }`}
            >
              {STATUS_LABELS[business.subscriptionStatus] ?? business.subscriptionStatus}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a
              href={`/api/admin/view-as?businessId=${business.id}`}
              className="text-xs px-2.5 py-1.5 bg-amber-600 hover:bg-amber-700 rounded-lg font-medium transition whitespace-nowrap"
            >
              View as Client
            </a>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition p-1 rounded"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-gray-800 shrink-0">
          {(['toggles', 'settings', 'tools'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-3 text-sm font-medium capitalize transition border-b-2 -mb-px ${
                tab === t
                  ? 'border-blue-500 text-white'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Tab content — scrollable */}
        <div className="flex-1 overflow-y-auto">
          {tab === 'toggles' && (
            <TogglesTab
              business={business}
              onUpdateBusiness={onUpdateBusiness}
              onToast={onToast}
            />
          )}
          {tab === 'settings' && (
            <SettingsTab
              business={business}
              onUpdateBusiness={onUpdateBusiness}
              onToast={onToast}
            />
          )}
          {tab === 'tools' && (
            <ToolsTab business={business} onToast={onToast} />
          )}
        </div>
      </div>
    </>
  )
}
