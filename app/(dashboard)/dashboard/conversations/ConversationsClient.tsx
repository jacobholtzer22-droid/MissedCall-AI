'use client'

import { useEffect, useState, useMemo } from 'react'
import { ArrowLeft } from 'lucide-react'
import {
  getConversationBucket,
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

type BucketedConversation = Conversation & { bucket: ConversationBucket }

// Client-facing labels (internal bucket names never shown to clients)
const TAB_LABELS: Record<TabKey, string> = {
  all: 'All',
  cold: 'No Reply',
  active: 'In Progress',
  stalled: 'Went Quiet',
  closed: 'Closed',
}

const TABS: TabKey[] = ['all', 'cold', 'active', 'stalled', 'closed']

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

function ConvoCard({
  convo,
  isSelected,
  onSelect,
  activeTab,
}: {
  convo: BucketedConversation
  isSelected: boolean
  onSelect: (convo: BucketedConversation) => void
  activeTab: TabKey
}) {
  return (
    <button
      onClick={() => onSelect(convo)}
      className={`w-full text-left p-3.5 rounded-xl border transition ${
        isSelected
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
            {TAB_LABELS[convo.bucket]}
          </span>
        )}
        {convo.serviceRequested && (
          <span className="text-xs text-gray-400 truncate">{convo.serviceRequested}</span>
        )}
      </div>

      {convo.messages.length > 0 && (
        <p className="text-xs text-gray-500 mt-1 truncate">
          {convo.messages[convo.messages.length - 1]?.content ?? ''}
        </p>
      )}
      <p className="text-xs text-gray-600 mt-1">
        {convo.messages.length} msg{convo.messages.length !== 1 ? 's' : ''}
      </p>
    </button>
  )
}

function ThreadBody({ convo, scrollable }: { convo: Conversation; scrollable?: boolean }) {
  return (
    <>
      <div className="mb-4 pb-4 border-b border-gray-800">
        <div className="flex flex-wrap gap-3 text-xs text-gray-400">
          <span className="font-mono">{convo.callerPhone}</span>
          {convo.intent && <span>Intent: {convo.intent}</span>}
          {convo.serviceRequested && <span>{convo.serviceRequested}</span>}
        </div>
        {convo.summary && (
          <p className="text-xs text-gray-400 mt-2 italic">&ldquo;{convo.summary}&rdquo;</p>
        )}
        {(convo.customerEmail || convo.customerAddress || convo.customerTimeframe) && (
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500">
            {convo.customerEmail && <span>📧 {convo.customerEmail}</span>}
            {convo.customerAddress && <span>📍 {convo.customerAddress}</span>}
            {convo.customerTimeframe && <span>🕐 {convo.customerTimeframe}</span>}
          </div>
        )}
      </div>

      <div className={`space-y-2.5 ${scrollable ? 'max-h-[560px] overflow-y-auto pr-1' : ''}`}>
        {convo.messages.map(msg => (
          <div
            key={msg.id}
            className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`max-w-[82%] rounded-2xl px-3.5 py-2 ${
              msg.direction === 'outbound'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-200'
            }`}>
              <p className="text-sm">{msg.content}</p>
              <p className="text-[10px] opacity-50 mt-0.5">
                {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

function EmptyState({ activeTab }: { activeTab: TabKey }) {
  return (
    <p className="text-gray-500 text-sm text-center py-8">
      No {activeTab !== 'all' ? TAB_LABELS[activeTab].toLowerCase() : ''} conversations.
    </p>
  )
}

export function ConversationsClient() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedConvo, setSelectedConvo] = useState<Conversation | null>(null)
  const [activeTab, setActiveTab] = useState<TabKey>('all')
  const [mobileChatOpen, setMobileChatOpen] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch('/api/dashboard/conversations')
        if (!res.ok) throw new Error('Failed to load')
        const data = await res.json()
        setConversations(data.conversations || [])
      } catch {
        setError('Failed to load conversations.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const bucketed = useMemo(() => {
    return conversations.map(c => ({ ...c, bucket: getConversationBucket(c) }))
  }, [conversations])

  const tabCounts = useMemo(() => {
    const counts: Record<TabKey, number> = { all: bucketed.length, cold: 0, active: 0, stalled: 0, closed: 0 }
    for (const c of bucketed) counts[c.bucket]++
    return counts
  }, [bucketed])

  const visible = useMemo(() => {
    const items = activeTab === 'all' ? bucketed : bucketed.filter(c => c.bucket === activeTab)
    return [...items].sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime())
  }, [bucketed, activeTab])

  function handleSelectConvo(convo: BucketedConversation) {
    setSelectedConvo(convo)
    setMobileChatOpen(true)
  }

  function handleBackToList() {
    setMobileChatOpen(false)
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white -m-6 md:-m-8">

      {/* ── Tab bar — horizontally scrollable on mobile, no visible scrollbar ── */}
      <div className="border-b border-gray-800 bg-gray-900/30 px-2 sm:px-6">
        <div className="flex overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {TABS.map(key => (
            <button
              key={key}
              onClick={() => { setActiveTab(key); setSelectedConvo(null); setMobileChatOpen(false) }}
              className={`whitespace-nowrap flex-shrink-0 px-3 sm:px-4 py-3 text-sm font-medium border-b-2 -mb-px transition ${
                activeTab === key
                  ? 'border-blue-500 text-white'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              {TAB_LABELS[key]}
              <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                activeTab === key ? 'bg-blue-500/20 text-blue-300' : 'bg-gray-800 text-gray-500'
              }`}>
                {tabCounts[key]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Main content ── */}
      {loading ? (
        <div className="px-4 sm:px-6 py-6 space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 bg-gray-900 rounded-xl border border-gray-800 animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="px-4 sm:px-6 py-6">
          <div className="bg-red-950/30 border border-red-500/20 rounded-xl p-6 text-center">
            <p className="text-red-400">{error}</p>
            <button onClick={() => window.location.reload()} className="mt-3 text-sm text-red-400 underline">
              Retry
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* ── MOBILE: conversation list (hidden when thread is open) ── */}
          <div className={`md:hidden px-4 py-4 space-y-2 ${mobileChatOpen && selectedConvo ? 'hidden' : 'block'}`}>
            {visible.length === 0
              ? <EmptyState activeTab={activeTab} />
              : visible.map(convo => (
                  <ConvoCard
                    key={convo.id}
                    convo={convo}
                    isSelected={selectedConvo?.id === convo.id}
                    onSelect={handleSelectConvo}
                    activeTab={activeTab}
                  />
                ))
            }
          </div>

          {/* ── MOBILE: thread view (full-screen, shown when mobileChatOpen) ── */}
          {mobileChatOpen && selectedConvo && (
            <div className="md:hidden">
              {/* Header — back button + contact name + bucket badge */}
              <div className="px-2 py-2 border-b border-gray-800 bg-gray-900 flex items-center gap-2">
                <button
                  onClick={handleBackToList}
                  className="p-2 rounded-lg hover:bg-gray-800 min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0"
                  aria-label="Back to conversations"
                >
                  <ArrowLeft className="h-5 w-5 text-gray-400" />
                </button>
                <span className="font-semibold text-white truncate flex-1 text-sm">
                  {selectedConvo.callerName || formatPhone(selectedConvo.callerPhone)}
                </span>
                <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full ${
                  BUCKET_COLORS[getConversationBucket(selectedConvo)]
                }`}>
                  {TAB_LABELS[getConversationBucket(selectedConvo)]}
                </span>
              </div>
              {/* Thread content — no height cap, page scrolls naturally */}
              <div className="px-4 py-4">
                <ThreadBody convo={selectedConvo} scrollable={false} />
              </div>
            </div>
          )}

          {/* ── DESKTOP: side-by-side split pane (hidden on mobile) ── */}
          <div className="hidden md:block px-6 py-6">
            <div className="grid grid-cols-5 gap-6">
              {/* List */}
              <div className="col-span-2 space-y-2">
                {visible.length === 0
                  ? <EmptyState activeTab={activeTab} />
                  : visible.map(convo => (
                      <ConvoCard
                        key={convo.id}
                        convo={convo}
                        isSelected={selectedConvo?.id === convo.id}
                        onSelect={handleSelectConvo}
                        activeTab={activeTab}
                      />
                    ))
                }
              </div>

              {/* Thread */}
              <div className="col-span-3">
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
                          {TAB_LABELS[getConversationBucket(selectedConvo)]}
                        </span>
                      </div>
                    </div>
                    <ThreadBody convo={selectedConvo} scrollable={true} />
                  </div>
                ) : (
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
                    <p className="text-gray-500">Select a conversation to view messages</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
