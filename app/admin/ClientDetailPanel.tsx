'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { HealthTab } from './ClientDetailPanel/HealthTab'
import { TogglesTab } from './ClientDetailPanel/TogglesTab'
import { SettingsTab } from './ClientDetailPanel/SettingsTab'
import { ToolsTab } from './ClientDetailPanel/ToolsTab'
import type { AdminBusiness } from './types'
import { StatusPill, HealthDot } from './ui'

type Tab = 'health' | 'toggles' | 'settings' | 'tools'

const TABS: { key: Tab; label: string }[] = [
  { key: 'health', label: 'Health' },
  { key: 'toggles', label: 'Toggles' },
  { key: 'settings', label: 'Settings' },
  { key: 'tools', label: 'Tools' },
]

interface Props {
  business: AdminBusiness
  /** Bumped by the parent on every open so re-opening the same client resets to Health. */
  openKey?: number
  showRevenue: boolean
  onClose: () => void
  onUpdateBusiness: (updated: AdminBusiness) => void
  onToast: (message: string, type: 'success' | 'error') => void
}

export function ClientDetailPanel({ business, openKey = 0, showRevenue, onClose, onUpdateBusiness, onToast }: Props) {
  const [tab, setTab] = useState<Tab>('health')

  // Reset to Health when switching business or re-opening
  const [prevKey, setPrevKey] = useState(`${business.id}:${openKey}`)
  const key = `${business.id}:${openKey}`
  if (prevKey !== key) {
    setPrevKey(key)
    setTab('health')
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
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} aria-hidden />

      {/* Slide-in panel */}
      <div
        role="dialog"
        aria-label={`${business.name} details`}
        className="fixed top-0 right-0 h-full w-full sm:w-[520px] lg:w-[600px] bg-gray-900 border-l border-gray-800 z-50 flex flex-col"
      >
        {/* Panel header: name on its own line, controls on the next */}
        <div className="px-4 sm:px-6 pt-4 pb-3 border-b border-gray-800 shrink-0">
          <p className="flex items-start gap-2 text-base font-semibold text-gray-100 leading-6">
            <HealthDot health={business.health} className="mt-[7px]" />
            <span className="min-w-0 flex-1">{business.name}</span>
          </p>
          <div className="mt-1 flex items-center justify-between gap-2 pl-[18px]">
            <StatusPill status={business.subscriptionStatus} />
            <div className="flex items-center gap-1">
              <a
                href={`/api/admin/view-as?businessId=${business.id}`}
                className="inline-flex items-center text-sm px-3 min-h-[44px] rounded-lg text-amber-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 whitespace-nowrap"
              >
                View as client
              </a>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg text-gray-400 hover:text-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Tab bar */}
        <div role="tablist" className="flex border-b border-gray-800 shrink-0 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {TABS.map(t => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 sm:px-5 min-h-[44px] text-sm font-medium whitespace-nowrap border-b-2 -mb-px focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${
                tab === t.key ? 'border-blue-500 text-gray-100' : 'border-transparent text-gray-500'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content — scrollable */}
        <div className="flex-1 overflow-y-auto">
          {tab === 'health' && <HealthTab business={business} showRevenue={showRevenue} />}
          {tab === 'toggles' && (
            <TogglesTab business={business} onUpdateBusiness={onUpdateBusiness} onToast={onToast} />
          )}
          {tab === 'settings' && (
            <SettingsTab
              business={business}
              showRevenue={showRevenue}
              onUpdateBusiness={onUpdateBusiness}
              onToast={onToast}
            />
          )}
          {tab === 'tools' && <ToolsTab business={business} onToast={onToast} />}
        </div>
      </div>
    </>
  )
}
