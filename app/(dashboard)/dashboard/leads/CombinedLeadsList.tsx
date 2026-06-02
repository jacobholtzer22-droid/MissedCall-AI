'use client'

import { useEffect, useMemo, useState } from 'react'
import { MessageSquare, Globe, X, Mail, MapPin, Phone, ChevronRight } from 'lucide-react'
import { formatPhoneNumber, formatRelativeTime, cn } from '@/lib/utils'
import { getConversationBucket, BUCKET_LABELS, type ConversationBucket } from '@/lib/conversation-buckets'

// ── Endpoint shapes (reused as-is; no new API) ──────────────────────────────
type ConvMessage = { id: string; direction: string; content: string; createdAt: string }
type ConversationRow = {
  id: string
  callerPhone: string
  callerName: string | null
  status: string
  summary: string | null
  intent: string | null
  serviceRequested: string | null
  createdAt: string
  lastMessageAt: string
  customerEmail: string | null
  customerAddress: string | null
  customerTimeframe: string | null
  appointment: { id: string } | null
  messages: ConvMessage[]
}
type WebsiteLeadRow = {
  id: string
  name: string
  phone: string | null
  email: string | null
  message: string | null
  status: string
  createdAt: string
}

// ── Unified row for the merged list ─────────────────────────────────────────
type UnifiedLead = {
  kind: 'missed_call' | 'website'
  key: string
  conversationId?: string
  name: string
  summary: string | null
  statusLabel: string
  statusClass: string
  email: string | null
  phone: string | null
  address: string | null
  message: string | null
  sortTs: number
  dateStr: string
}

type SourceFilter = 'all' | 'missed_call' | 'website'

// Light-theme badge colors (matches the Contacts page palette). Labels come from
// BUCKET_LABELS so missed-call statuses stay consistent with the Conversations tab.
const BUCKET_LIGHT: Record<ConversationBucket, string> = {
  cold: 'bg-gray-100 text-gray-700',
  active: 'bg-green-100 text-green-700',
  stalled: 'bg-amber-100 text-amber-700',
  closed: 'bg-blue-100 text-blue-700',
}

const WEBSITE_STATUS: Record<string, { label: string; className: string }> = {
  new: { label: 'New', className: 'bg-blue-100 text-blue-700' },
  contacted: { label: 'Contacted', className: 'bg-amber-100 text-amber-700' },
  converted: { label: 'Converted', className: 'bg-green-100 text-green-700' },
  closed: { label: 'Closed', className: 'bg-gray-100 text-gray-700' },
}

const SOURCE_BADGE: Record<'missed_call' | 'website', { label: string; className: string }> = {
  missed_call: { label: 'Missed Call', className: 'bg-orange-100 text-orange-800 border border-orange-200' },
  website: { label: 'Website', className: 'bg-blue-100 text-blue-800 border border-blue-200' },
}

function nameOrPhone(name: string | null, phone: string | null): string {
  if (name && name.trim()) return name.trim()
  if (phone && phone.trim()) return formatPhoneNumber(phone)
  return 'Unknown'
}

export function CombinedLeadsList({
  onOpenConversation,
}: {
  onOpenConversation: (conversationId: string) => void
}) {
  const [conversations, setConversations] = useState<ConversationRow[]>([])
  const [websiteLeads, setWebsiteLeads] = useState<WebsiteLeadRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<SourceFilter>('all')
  const [detail, setDetail] = useState<UnifiedLead | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [cRes, wRes] = await Promise.all([
          fetch('/api/dashboard/conversations'),
          fetch('/api/dashboard/website-leads'),
        ])
        if (!cRes.ok || !wRes.ok) throw new Error('Failed to load')
        const cData = await cRes.json()
        const wData = await wRes.json()
        if (cancelled) return
        setConversations(cData.conversations || [])
        setWebsiteLeads(wData.leads || [])
      } catch {
        if (!cancelled) setError('Failed to load leads.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const merged = useMemo<UnifiedLead[]>(() => {
    const fromConvos: UnifiedLead[] = conversations.map(c => {
      const bucket = getConversationBucket(c)
      return {
        kind: 'missed_call',
        key: `c-${c.id}`,
        conversationId: c.id,
        name: nameOrPhone(c.callerName, c.callerPhone),
        summary: c.serviceRequested || c.summary || null,
        statusLabel: BUCKET_LABELS[bucket],
        statusClass: BUCKET_LIGHT[bucket],
        email: c.customerEmail,
        phone: c.callerPhone,
        address: c.customerAddress,
        message: null,
        sortTs: new Date(c.lastMessageAt || c.createdAt).getTime(),
        dateStr: formatRelativeTime(c.lastMessageAt || c.createdAt),
      }
    })
    const fromWeb: UnifiedLead[] = websiteLeads.map(w => {
      const status = WEBSITE_STATUS[w.status] ?? { label: w.status, className: 'bg-gray-100 text-gray-700' }
      return {
        kind: 'website',
        key: `w-${w.id}`,
        name: nameOrPhone(w.name, w.phone),
        summary: w.message || null,
        statusLabel: status.label,
        statusClass: status.className,
        email: w.email,
        phone: w.phone,
        address: null,
        message: w.message,
        sortTs: new Date(w.createdAt).getTime(),
        dateStr: formatRelativeTime(w.createdAt),
      }
    })
    return [...fromConvos, ...fromWeb].sort((a, b) => b.sortTs - a.sortTs)
  }, [conversations, websiteLeads])

  const counts = useMemo(
    () => ({
      all: merged.length,
      missed_call: merged.filter(l => l.kind === 'missed_call').length,
      website: merged.filter(l => l.kind === 'website').length,
    }),
    [merged]
  )

  const visible = useMemo(
    () => (filter === 'all' ? merged : merged.filter(l => l.kind === filter)),
    [merged, filter]
  )

  function handleRowClick(lead: UnifiedLead) {
    if (lead.kind === 'missed_call' && lead.conversationId) {
      onOpenConversation(lead.conversationId)
    } else {
      setDetail(lead)
    }
  }

  const FILTERS: { value: SourceFilter; label: string }[] = [
    { value: 'all', label: `All (${counts.all})` },
    { value: 'missed_call', label: `Missed Call (${counts.missed_call})` },
    { value: 'website', label: `Website (${counts.website})` },
  ]

  return (
    <div className="space-y-4">
      {/* Source filter */}
      <div className="flex flex-wrap gap-1">
        {FILTERS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={cn(
              'px-3 py-2.5 min-h-[44px] md:min-h-0 rounded-lg text-sm font-medium transition',
              filter === value ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="p-8 text-center">
            <p className="text-red-600">{error}</p>
            <button onClick={() => window.location.reload()} className="mt-3 text-sm text-gray-600 underline">
              Retry
            </button>
          </div>
        ) : visible.length === 0 ? (
          <div className="p-10 text-center text-gray-500">
            <p className="font-medium text-gray-700">No leads yet</p>
            <p className="text-sm mt-1">Missed-call and website leads will show up here.</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {visible.map(lead => {
              const source = SOURCE_BADGE[lead.kind]
              return (
                <li key={lead.key}>
                  <button
                    type="button"
                    onClick={() => handleRowClick(lead)}
                    className="w-full text-left p-4 hover:bg-gray-50 transition flex items-start gap-3"
                  >
                    <span className="mt-0.5 shrink-0 text-gray-400">
                      {lead.kind === 'missed_call' ? (
                        <MessageSquare className="h-5 w-5" />
                      ) : (
                        <Globe className="h-5 w-5" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-gray-900 truncate">{lead.name}</span>
                        <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', source.className)}>
                          {source.label}
                        </span>
                        <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', lead.statusClass)}>
                          {lead.statusLabel}
                        </span>
                      </div>
                      {lead.summary && (
                        <p className="text-sm text-gray-600 mt-1 line-clamp-1">{lead.summary}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-gray-500">
                        {lead.phone && <span>{formatPhoneNumber(lead.phone)}</span>}
                        {lead.email && <span className="truncate">{lead.email}</span>}
                        {lead.address && <span className="truncate">{lead.address}</span>}
                      </div>
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      <span className="text-xs text-gray-400 whitespace-nowrap">{lead.dateStr}</span>
                      <ChevronRight className="h-4 w-4 text-gray-300" />
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Website lead detail (missed-call rows open the Conversations tab instead) */}
      {detail && detail.kind === 'website' && (
        <div
          className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 p-0 md:p-4"
          onClick={() => setDetail(null)}
        >
          <div
            className="bg-white rounded-t-2xl md:rounded-xl shadow-xl max-w-md w-full"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Globe className="h-5 w-5 text-blue-600" />
                <h2 className="text-lg font-bold text-gray-900">Website Lead</h2>
              </div>
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-400">Name</p>
                <p className="text-gray-900 font-medium">{detail.name}</p>
              </div>
              {detail.phone && (
                <div className="flex items-center gap-2 text-gray-700">
                  <Phone className="h-4 w-4 text-gray-400" />
                  <span>{formatPhoneNumber(detail.phone)}</span>
                </div>
              )}
              {detail.email && (
                <div className="flex items-center gap-2 text-gray-700">
                  <Mail className="h-4 w-4 text-gray-400" />
                  <span className="break-all">{detail.email}</span>
                </div>
              )}
              {detail.address && (
                <div className="flex items-center gap-2 text-gray-700">
                  <MapPin className="h-4 w-4 text-gray-400" />
                  <span>{detail.address}</span>
                </div>
              )}
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-400 mb-1">Message</p>
                <p className="text-gray-700 whitespace-pre-wrap">{detail.message || 'No message provided.'}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
