'use client'

import { useState, useRef } from 'react'
import { Upload, Shield, Voicemail, MessageSquare, Ban } from 'lucide-react'
import type { AdminBusiness } from '../types'

interface Props {
  business: AdminBusiness
  onToast: (message: string, type: 'success' | 'error') => void
}

function ToolSection({ icon: Icon, title, description, children }: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="py-4 border-b border-gray-800/50 last:border-0">
      <div className="flex items-start gap-3 mb-3">
        <div className="p-1.5 rounded-lg bg-gray-800 shrink-0 mt-0.5">
          <Icon className="h-4 w-4 text-gray-400" />
        </div>
        <div>
          <p className="text-sm font-medium text-gray-200">{title}</p>
          <p className="text-xs text-gray-500 mt-0.5">{description}</p>
        </div>
      </div>
      <div className="ml-9">{children}</div>
    </div>
  )
}

function BulkImportSection({ businessId, onToast }: { businessId: string; onToast: Props['onToast'] }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [preview, setPreview] = useState<{ total: number; newCount: number } | null>(null)
  const [pendingContacts, setPendingContacts] = useState<{ phoneNumber: string; name?: string }[]>([])

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    const { parseContactFile } = await import('@/lib/import-contacts')
    try {
      const { contacts } = await parseContactFile(file)
      setPreview({ total: contacts.length, newCount: contacts.length })
      setPendingContacts(contacts.map(c => ({ phoneNumber: c.phoneNumber, name: c.name ?? undefined })))
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to parse file', 'error')
    }
  }

  async function doImport() {
    if (!pendingContacts.length) return
    setImporting(true)
    setProgress(0)
    const BATCH = 100
    const batches: typeof pendingContacts[] = []
    for (let i = 0; i < pendingContacts.length; i += BATCH) {
      batches.push(pendingContacts.slice(i, i + BATCH))
    }
    let done = 0
    try {
      for (const batch of batches) {
        const res = await fetch(`/api/admin/businesses/${businessId}/contacts/bulk`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contacts: batch }),
        })
        if (!res.ok) {
          const d = await res.json().catch(() => ({}))
          throw new Error(d.error || 'Import failed')
        }
        done++
        setProgress(Math.round((done / batches.length) * 100))
      }
      onToast(`Imported ${pendingContacts.length} contacts`, 'success')
      setPreview(null)
      setPendingContacts([])
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Import failed', 'error')
    } finally {
      setImporting(false)
      setProgress(0)
    }
  }

  return (
    <div className="space-y-3">
      <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFile} />
      {!preview ? (
        <button
          onClick={() => fileRef.current?.click()}
          className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-xs font-medium transition"
        >
          Choose File (CSV / Excel)
        </button>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-gray-300">
            Found <span className="text-green-400 font-semibold">{preview.newCount}</span> contacts
          </p>
          {importing && (
            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div className="h-full bg-amber-500 transition-all" style={{ width: `${progress}%` }} />
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={doImport}
              disabled={importing}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 rounded-lg text-xs font-medium"
            >
              {importing ? `Importing... ${progress}%` : `Import ${preview.newCount} Contacts`}
            </button>
            <button
              onClick={() => { setPreview(null); setPendingContacts([]) }}
              disabled={importing}
              className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export function ToolsTab({ business, onToast }: Props) {
  return (
    <div className="px-6 py-4">
      {/* Conversations */}
      <ToolSection
        icon={MessageSquare}
        title="Conversations"
        description="View and filter all SMS conversations for this client"
      >
        <a
          href={`/admin/${business.id}/conversations`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-xs font-medium transition"
        >
          Open Conversations →
        </a>
      </ToolSection>

      {/* Screened Calls */}
      <ToolSection
        icon={Shield}
        title="Screened Calls Log"
        description="View spam-filtered and IVR-passed calls"
      >
        <div className="space-y-2">
          <ScreenedCallsSummary businessId={business.id} />
        </div>
      </ToolSection>

      {/* Bulk Import */}
      <ToolSection
        icon={Upload}
        title="Bulk Import Contacts"
        description="Upload CSV or Excel to add existing customers (they will skip automated SMS)"
      >
        <BulkImportSection businessId={business.id} onToast={onToast} />
      </ToolSection>

      {/* Blocked Numbers */}
      <ToolSection
        icon={Ban}
        title="Blocked Numbers"
        description="Numbers that never receive automated SMS"
      >
        <BlockedNumbersSection businessId={business.id} onToast={onToast} />
      </ToolSection>

      {/* Voicemails */}
      <ToolSection
        icon={Voicemail}
        title="Voicemails"
        description="Listen to recorded voicemails for this client"
      >
        <a
          href={`/api/admin/view-as?businessId=${business.id}`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-xs font-medium transition"
        >
          Open Client Dashboard →
        </a>
      </ToolSection>
    </div>
  )
}

function ScreenedCallsSummary({ businessId }: { businessId: string }) {
  const [data, setData] = useState<{ stats: { blocked: number; passed: number; total: number; blockRate: number } } | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)

  async function load() {
    if (loaded || loading) return
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/businesses/${businessId}/screened-calls?days=30`)
      if (res.ok) {
        setData(await res.json())
        setLoaded(true)
      }
    } finally {
      setLoading(false)
    }
  }

  if (!loaded) {
    return (
      <button onClick={load} disabled={loading} className="text-xs text-blue-400 hover:text-blue-300">
        {loading ? 'Loading...' : 'Load last 30 days →'}
      </button>
    )
  }

  if (!data) return <p className="text-xs text-gray-500">No data</p>

  return (
    <div className="flex gap-4 text-xs text-gray-400">
      <span><span className="text-red-400 font-semibold">{data.stats.blocked}</span> blocked</span>
      <span><span className="text-green-400 font-semibold">{data.stats.passed}</span> passed</span>
      <span><span className="text-blue-400 font-semibold">{data.stats.blockRate}%</span> block rate</span>
    </div>
  )
}

function BlockedNumbersSection({
  businessId,
  onToast,
}: {
  businessId: string
  onToast: Props['onToast']
}) {
  const [numbers, setNumbers] = useState<{ id: string; phoneNumber: string; label: string | null }[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [phone, setPhone] = useState('')
  const [label, setLabel] = useState('')
  const [adding, setAdding] = useState(false)

  async function load() {
    if (loaded || loading) return
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/businesses/${businessId}/blocked-numbers`)
      if (res.ok) {
        const d = await res.json()
        setNumbers(d.blockedNumbers ?? [])
        setLoaded(true)
      }
    } finally {
      setLoading(false)
    }
  }

  async function add() {
    if (!phone.trim()) return
    setAdding(true)
    try {
      const res = await fetch(`/api/admin/businesses/${businessId}/blocked-numbers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: phone.trim(), label: label.trim() || null }),
      })
      if (res.ok) {
        setPhone('')
        setLabel('')
        await load()
        onToast('Number blocked', 'success')
      } else {
        const d = await res.json()
        onToast(d.error || 'Failed to block number', 'error')
      }
    } finally {
      setAdding(false)
    }
  }

  async function remove(id: string) {
    await fetch(`/api/admin/businesses/${businessId}/blocked-numbers?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
    setNumbers(n => n.filter(x => x.id !== id))
  }

  if (!loaded) {
    return (
      <button onClick={load} disabled={loading} className="text-xs text-blue-400 hover:text-blue-300">
        {loading ? 'Loading...' : 'Load blocked numbers →'}
      </button>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          value={phone}
          onChange={e => setPhone(e.target.value)}
          placeholder="+15551234567"
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white placeholder-gray-600"
        />
        <input
          value={label}
          onChange={e => setLabel(e.target.value)}
          placeholder="Label"
          className="w-24 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white placeholder-gray-600"
        />
        <button
          onClick={add}
          disabled={adding || !phone.trim()}
          className="px-2 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded-lg text-xs"
        >
          Add
        </button>
      </div>
      {numbers.length === 0 ? (
        <p className="text-xs text-gray-600">No blocked numbers.</p>
      ) : (
        <ul className="space-y-1 max-h-40 overflow-y-auto">
          {numbers.map(n => (
            <li key={n.id} className="flex items-center justify-between bg-gray-800/50 rounded px-2 py-1.5">
              <span className="text-xs text-gray-300 font-mono">
                {n.phoneNumber}
                {n.label && <span className="text-gray-500 ml-1.5">({n.label})</span>}
              </span>
              <button onClick={() => remove(n.id)} className="text-xs text-red-400 hover:text-red-300">
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
