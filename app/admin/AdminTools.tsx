'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, RefreshCw, Download, RotateCcw, ShieldAlert, MessageSquare, BarChart3 } from 'lucide-react'

interface Props {
  onToast: (message: string, type: 'success' | 'error') => void
  onRefresh: () => Promise<void>
}

type ActionKey = 'telnyx' | 'ads' | 'sheets' | 'export' | 'refresh' | 'spam' | 'marketing-line' | 'arms'

export function AdminTools({ onToast, onRefresh }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState<ActionKey | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onOutsideClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onOutsideClick)
    return () => document.removeEventListener('mousedown', onOutsideClick)
  }, [])

  async function run(key: ActionKey, fn: () => Promise<void>) {
    setLoading(key)
    try {
      await fn()
    } finally {
      setLoading(null)
      setOpen(false)
    }
  }

  async function syncTelnyx() {
    const res = await fetch('/api/admin/usage/sync?dateRange=last_90_days', { method: 'POST' })
    const data = await res.json()
    if (res.ok) {
      onToast(`Synced ${data.mdrsProcessed ?? 0} SMS + ${data.cdrsProcessed ?? 0} call records`, 'success')
    } else {
      onToast(data.error || 'Telnyx sync failed', 'error')
    }
  }

  async function syncGoogleAds() {
    const res = await fetch('/api/admin/google-ads/sync', { method: 'POST' })
    const data = await res.json()
    if (res.ok) {
      onToast(`Synced Google Ads for ${data.synced ?? 0} businesses`, 'success')
    } else {
      onToast(data.error || 'Google Ads sync failed', 'error')
    }
  }

  async function syncSheets() {
    const res = await fetch('/api/admin/usage/sheets-sync', { method: 'POST' })
    const data = await res.json()
    if (res.ok) {
      onToast('Synced to Google Sheets', 'success')
    } else {
      onToast(data.error || 'Sheets sync failed', 'error')
    }
  }

  function exportExcel() {
    window.open('/api/admin/usage/export?preset=this_month', '_blank')
  }

  const items: {
    key: ActionKey
    label: string
    icon: React.ComponentType<{ className?: string }>
    action: () => void | Promise<void>
  }[] = [
    {
      key: 'refresh',
      label: 'Refresh Table',
      icon: RotateCcw,
      action: () => run('refresh', onRefresh),
    },
    {
      key: 'telnyx',
      label: 'Sync Telnyx Usage',
      icon: RefreshCw,
      action: () => run('telnyx', syncTelnyx),
    },
    {
      key: 'ads',
      label: 'Sync Google Ads',
      icon: RefreshCw,
      action: () => run('ads', syncGoogleAds),
    },
    {
      key: 'sheets',
      label: 'Sync Google Sheets',
      icon: RefreshCw,
      action: () => run('sheets', syncSheets),
    },
    {
      key: 'export',
      label: 'Export to Excel',
      icon: Download,
      action: exportExcel,
    },
    {
      key: 'spam',
      label: 'Spam / scored leads',
      icon: ShieldAlert,
      action: () => router.push('/admin/spam'),
    },
    {
      key: 'marketing-line',
      label: 'Marketing line texts',
      icon: MessageSquare,
      action: () => router.push('/admin/marketing'),
    },
    {
      key: 'arms',
      label: 'Funnel arms',
      icon: BarChart3,
      action: () => router.push('/admin/arms'),
    },
  ]

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-sm font-medium transition"
      >
        {loading ? (
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
        ) : null}
        Tools
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-52 bg-gray-900 border border-gray-700 rounded-xl shadow-xl z-50 py-1 overflow-hidden">
          {items.map(item => (
            <button
              key={item.key}
              onClick={() => item.action()}
              disabled={loading !== null}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-200 hover:bg-gray-800 transition disabled:opacity-50 text-left"
            >
              <item.icon
                className={`h-3.5 w-3.5 shrink-0 ${loading === item.key ? 'animate-spin' : ''}`}
              />
              {loading === item.key ? 'Working...' : item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
