'use client'

import { useEffect, useMemo, useState } from 'react'
import { MessageSquare, Globe, X, Mail, MapPin, Phone, ChevronRight, Trash2 } from 'lucide-react'
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
  businessName?: string // only present when the business is in an owner group
}

// ── Unified row for the merged list ─────────────────────────────────────────
type UnifiedLead = {
  kind: 'missed_call' | 'website'
  key: string
  conversationId?: string
  websiteLeadId?: string
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
  businessName?: string // website leads only, and only when in an owner group
  isPartial?: boolean // /book contact step submitted, no time slot picked yet
}

type SourceFilter = 'all' | 'partial' | 'missed_call' | 'website'

// Light-theme badge colors (matches the Contacts page palette). Labels come from
// BUCKET_LABELS so missed-call statuses stay consistent with the Conversations tab.
const BUCKET_LIGHT: Record<ConversationBucket, string> = {
  cold: 'bg-gray-100 text-gray-700',
  active: 'bg-green-100 text-green-700',
  stalled: 'bg-amber-100 text-amber-700',
  closed: 'bg-blue-100 text-blue-700',
}

const WEBSITE_STATUS: Record<string, { label: string; className: string }> = {
  // Contact captured on /book but no time picked. Highest-intent callback list.
  partial: { label: 'Call now', className: 'bg-red-100 text-red-700 border border-red-200' },
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
  const [isGroup, setIsGroup] = useState(false)
  // false when /api/dashboard/conversations answered 403 (MissedCall AI off for
  // this business): the page still works, it just has no missed-call leads.
  const [hasAiLeads, setHasAiLeads] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<SourceFilter>('all')
  const [detail, setDetail] = useState<UnifiedLead | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<UnifiedLead | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [cRes, wRes] = await Promise.all([
          fetch('/api/dashboard/conversations?view=leads'),
          fetch('/api/dashboard/website-leads'),
        ])
        // Website leads are required. Conversations are optional: a 403 means
        // MissedCall AI is off for this business, so treat it as an empty list.
        if (!wRes.ok) throw new Error('Failed to load')
        const aiEnabled = cRes.status !== 403
        if (!cRes.ok && aiEnabled) throw new Error('Failed to load')
        const cData = aiEnabled ? await cRes.json() : { conversations: [] }
        const wData = await wRes.json()
        if (cancelled) return
        setHasAiLeads(aiEnabled)
        setConversations(cData.conversations || [])
        setWebsiteLeads(wData.leads || [])
        setIsGroup(wData.isGroup === true)
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
    // Missed-call leads = only captured/converted conversations (bucket === 'closed').
    // Cold / in-progress / stalled threads stay in the Conversations tab, not here.
    const fromConvos: UnifiedLead[] = conversations
      .map(c => ({ c, bucket: getConversationBucket(c) }))
      .filter(({ bucket }) => bucket === 'closed')
      .map(({ c, bucket }) => ({
        kind: 'missed_call' as const,
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
      }))
    const fromWeb: UnifiedLead[] = websiteLeads.map(w => {
      const status = WEBSITE_STATUS[w.status] ?? { label: w.status, className: 'bg-gray-100 text-gray-700' }
      return {
        kind: 'website',
        key: `w-${w.id}`,
        websiteLeadId: w.id,
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
        businessName: w.businessName,
        isPartial: w.status === 'partial',
      }
    })
    return [...fromConvos, ...fromWeb].sort((a, b) => b.sortTs - a.sortTs)
  }, [conversations, websiteLeads])

  const counts = useMemo(
    () => ({
      all: merged.length,
      partial: merged.filter(l => l.isPartial).length,
      missed_call: merged.filter(l => l.kind === 'missed_call').length,
      website: merged.filter(l => l.kind === 'website').length,
    }),
    [merged]
  )

  const visible = useMemo(() => {
    if (filter === 'all') return merged
    if (filter === 'partial') return merged.filter(l => l.isPartial)
    return merged.filter(l => l.kind === filter)
  }, [merged, filter])

  function handleRowClick(lead: UnifiedLead) {
    if (lead.kind === 'missed_call' && lead.conversationId) {
      onOpenConversation(lead.conversationId)
    } else {
      setDetail(lead)
    }
  }

  // Soft delete, both sources. The row leaves the list only once the server
  // says so (no refetch); a failure keeps it and shows the error in the dialog.
  async function handleConfirmDelete() {
    const lead = confirmDelete
    if (!lead || deleting) return
    const url =
      lead.kind === 'website' && lead.websiteLeadId
        ? `/api/dashboard/website-leads/${lead.websiteLeadId}`
        : lead.conversationId
          ? `/api/dashboard/conversations/${lead.conversationId}`
          : null
    if (!url) return
    setDeleting(true)
    setDeleteError(null)
    try {
      const res = await fetch(url, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      if (lead.kind === 'website') setWebsiteLeads(prev => prev.filter(w => w.id !== lead.websiteLeadId))
      else setConversations(prev => prev.filter(c => c.id !== lead.conversationId))
      if (detail?.key === lead.key) setDetail(null)
      setConfirmDelete(null)
      setToast(`Deleted ${lead.name}`)
    } catch {
      setDeleteError('Could not delete that lead. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  function openDelete(lead: UnifiedLead) {
    setDeleteError(null)
    setConfirmDelete(lead)
  }

  const FILTERS: { value: SourceFilter; label: string }[] = [
    { value: 'all', label: `All (${counts.all})` },
    { value: 'partial', label: `Call now (${counts.partial})` },
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
            {hasAiLeads ? (
              <>
                <p className="font-medium text-gray-700">No leads yet</p>
                <p className="text-sm mt-1">Missed-call and website leads will show up here.</p>
              </>
            ) : (
              <>
                <p className="font-medium text-gray-700">No website leads yet.</p>
                <p className="text-sm mt-1">Leads from your website&apos;s contact form show up here.</p>
              </>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {visible.map(lead => {
              const source = SOURCE_BADGE[lead.kind]
              const canDelete = Boolean(lead.websiteLeadId || lead.conversationId)
              return (
                <li key={lead.key} className="flex items-stretch">
                  <button
                    type="button"
                    onClick={() => handleRowClick(lead)}
                    className={cn(
                      'flex-1 min-w-0 text-left p-4 transition flex items-start gap-3',
                      lead.isPartial
                        ? 'border-l-4 border-l-red-500 bg-red-50/60 hover:bg-red-50'
                        : 'hover:bg-gray-50'
                    )}
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
                        {isGroup && lead.businessName && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                            {lead.businessName}
                          </span>
                        )}
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
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => openDelete(lead)}
                      className={cn(
                        'shrink-0 w-11 min-h-[44px] flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 transition',
                        lead.isPartial && 'bg-red-50/60'
                      )}
                      aria-label={`Delete lead ${lead.name}`}
                      title="Delete lead"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
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
                <Globe className={cn('h-5 w-5', detail.isPartial ? 'text-red-600' : 'text-blue-600')} />
                <h2 className="text-lg font-bold text-gray-900">
                  {detail.isPartial ? 'Partial lead - call now' : 'Website Lead'}
                </h2>
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
                  <a href={`tel:${detail.phone}`} className="text-blue-600 font-medium hover:underline">
                    {formatPhoneNumber(detail.phone)}
                  </a>
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

      {/* Delete confirm (both sources) */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 p-0 md:p-4"
          onClick={() => !deleting && setConfirmDelete(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-lead-title"
            className="bg-white rounded-t-2xl md:rounded-xl shadow-xl max-w-sm w-full p-5"
            onClick={e => e.stopPropagation()}
          >
            <h2 id="delete-lead-title" className="text-lg font-bold text-gray-900 break-words">
              Delete {confirmDelete.name}?
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {confirmDelete.kind === 'missed_call'
                ? 'This lead leaves your Leads page. The conversation stays in Conversations, and the lead comes back here if they text you again.'
                : 'This website lead leaves your Leads page.'}
            </p>
            {deleteError && (
              <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {deleteError}
              </p>
            )}
            <div className="flex justify-end gap-2 mt-5">
              <button
                type="button"
                autoFocus
                disabled={deleting}
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2.5 min-h-[44px] rounded-lg text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="px-4 py-2.5 min-h-[44px] rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
      {toast && (
        <div role="status" className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}
