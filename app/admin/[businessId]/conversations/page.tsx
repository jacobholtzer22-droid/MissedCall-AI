'use client'

import { useEffect, useState, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  getConversationBucket,
  BUCKET_LABELS,
  BUCKET_COLORS,
  type ConversationBucket,
} from '@/lib/conversation-buckets'

type MessageDir = { id: string; direction: string; content: string; createdAt: string }

interface Conversation {
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
  messages: MessageDir[]
}

type TabKey = 'all' | ConversationBucket

const TABS: { key: TabKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'cold', label: 'Cold' },
  { key: 'active', label: 'Active' },
  { key: 'stalled', label: 'Stalled' },
  { key: 'closed', label: 'Closed' },
]

function formatPhone(p: string) {
  const d = p.replace(/\D/g, '')
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
  if (d.length === 11 && d[0] === '1') return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`
  return p
}

function relTime(ts: string) {
  const diff = Date.now() - new Date(ts).getTime()
  const h = diff / 3600000
  if (h < 1) return `${Math.round(diff / 60000)}m ago`
  if (h < 24) return `${Math.round(h)}h ago`
  const d = Math.round(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(ts).toLocaleDateString()
}

export default function AdminConversationsPage() {
  const params = useParams()
  const router = useRouter()
  const businessId = params.businessId as string

  const [conversations, setConversations] = useState<Conversation[]>([])
  const [businessName, setBusinessName] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedConvo, setSelectedConvo] = useState<Conversation | null>(null)
  const [activeTab, setActiveTab] = useState<TabKey>('all')

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/admin/businesses/${businessId}/conversations`)
        if (res.status === 403) { router.push('/dashboard'); return }
        if (!res.ok) throw new Error('Failed to load')
        const data = await res.json()
        setConversations(data.conversations || [])
        setBusinessName(data.businessName || 'Unknown')
      } catch {
        setError('Failed to load conversations. Try again.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [businessId, router])

  const bucketed = useMemo(() => {
    return conversations.map(c => ({ ...c, bucket: getConversationBucket(c) }))
  }, [conversations])

  const tabCounts: Record<TabKey, number> = useMemo(() => {
    const counts = { all: bucketed.length, cold: 0, active: 0, stalled: 0, closed: 0 }
    for (const c of bucketed) counts[c.bucket]++
    return counts
  }, [bucketed])

  const visible = useMemo(() => {
    const items = activeTab === 'all'
      ? bucketed
      : bucketed.filter(c => c.bucket === activeTab)
    return [...items].sort(
      (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
    )
  }, [bucketed, activeTab])

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-900/50 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{businessName} — Conversations</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              {conversations.length} conversation{conversations.length !== 1 ? 's' : ''}
            </p>
          </div>
          <a href="/admin" className="text-sm text-gray-400 hover:text-white transition">
            ← Back to Admin
          </a>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-800 bg-gray-900/30 px-6">
        <div className="max-w-7xl mx-auto flex gap-1">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => { setActiveTab(t.key); setSelectedConvo(null) }}
              className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition ${
                activeTab === t.key
                  ? 'border-blue-500 text-white'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              {t.label}
              <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                activeTab === t.key ? 'bg-blue-500/20 text-blue-300' : 'bg-gray-800 text-gray-500'
              }`}>
                {tabCounts[t.key]}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 bg-gray-900 rounded-xl border border-gray-800 animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="bg-red-950/30 border border-red-500/20 rounded-xl p-6 text-center">
            <p className="text-red-400">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-3 text-sm text-red-400 underline"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
            {/* List */}
            <div className="md:col-span-2 space-y-2">
              {visible.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-8">
                  No {activeTab !== 'all' ? BUCKET_LABELS[activeTab as ConversationBucket].toLowerCase() : ''} conversations.
                </p>
              ) : (
                visible.map(convo => (
                  <button
                    key={convo.id}
                    onClick={() => setSelectedConvo(convo)}
                    className={`w-full text-left p-3.5 rounded-xl border transition ${
                      selectedConvo?.id === convo.id
                        ? 'bg-blue-600/10 border-blue-500/30'
                        : 'bg-gray-900 border-gray-800 hover:border-gray-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="font-medium text-sm text-white truncate">
                        {convo.callerName || formatPhone(convo.callerPhone)}
                      </span>
                      <span className="text-xs text-gray-500 shrink-0">{relTime(convo.lastMessageAt)}</span>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {activeTab === 'all' && (
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${BUCKET_COLORS[convo.bucket]}`}>
                          {BUCKET_LABELS[convo.bucket]}
                        </span>
                      )}
                      {convo.serviceRequested && (
                        <span className="text-xs text-gray-400 truncate">{convo.serviceRequested}</span>
                      )}
                    </div>

                    {/* Last message preview */}
                    {convo.messages.length > 0 && (
                      <p className="text-xs text-gray-500 mt-1 truncate">
                        {convo.messages[convo.messages.length - 1]?.content ?? ''}
                      </p>
                    )}
                    <p className="text-xs text-gray-600 mt-1">
                      {convo.messages.length} msg{convo.messages.length !== 1 ? 's' : ''}
                    </p>
                  </button>
                ))
              )}
            </div>

            {/* Thread */}
            <div className="md:col-span-3">
              {selectedConvo ? (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 sticky top-6">
                  <div className="mb-4 pb-4 border-b border-gray-800">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold">
                        {selectedConvo.callerName || formatPhone(selectedConvo.callerPhone)}
                      </h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        BUCKET_COLORS[getConversationBucket(selectedConvo)]
                      }`}>
                        {BUCKET_LABELS[getConversationBucket(selectedConvo)]}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-400">
                      <span className="font-mono">{selectedConvo.callerPhone}</span>
                      {selectedConvo.intent && <span>Intent: {selectedConvo.intent}</span>}
                      {selectedConvo.serviceRequested && <span>{selectedConvo.serviceRequested}</span>}
                    </div>
                    {selectedConvo.summary && (
                      <p className="text-xs text-gray-400 mt-2 italic">&ldquo;{selectedConvo.summary}&rdquo;</p>
                    )}
                    {(selectedConvo.customerEmail || selectedConvo.customerAddress || selectedConvo.customerTimeframe) && (
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500">
                        {selectedConvo.customerEmail && <span>📧 {selectedConvo.customerEmail}</span>}
                        {selectedConvo.customerAddress && <span>📍 {selectedConvo.customerAddress}</span>}
                        {selectedConvo.customerTimeframe && <span>🕐 {selectedConvo.customerTimeframe}</span>}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2.5 max-h-[560px] overflow-y-auto pr-1">
                    {selectedConvo.messages.map(msg => (
                      <div
                        key={msg.id}
                        className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[82%] rounded-2xl px-3.5 py-2 ${
                            msg.direction === 'outbound'
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-800 text-gray-200'
                          }`}
                        >
                          <p className="text-sm">{msg.content}</p>
                          <p className="text-[10px] opacity-50 mt-0.5">
                            {new Date(msg.createdAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
                  <p className="text-gray-500">Select a conversation to view messages</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
