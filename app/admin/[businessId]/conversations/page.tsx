'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

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
  messages: {
    id: string
    direction: string
    content: string
    createdAt: string
  }[]
}

export default function AdminConversations() {
  const params = useParams()
  const router = useRouter()
  const businessId = params.businessId as string

  const [conversations, setConversations] = useState<Conversation[]>([])
  const [businessName, setBusinessName] = useState('')
  const [loading, setLoading] = useState(true)
  const [selectedConvo, setSelectedConvo] = useState<Conversation | null>(null)

  useEffect(() => {
    fetchConversations()
  }, [businessId])

  async function fetchConversations() {
    try {
      const res = await fetch(`/api/admin/businesses/${businessId}/conversations`)
      if (res.status === 403) {
        router.push('/dashboard')
        return
      }
      const data = await res.json()
      setConversations(data.conversations || [])
      setBusinessName(data.businessName || 'Unknown')
    } catch (err) {
      console.error('Failed to fetch conversations:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <p className="text-gray-400">Loading conversations...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="border-b border-gray-800 bg-gray-900/50 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{businessName} — Conversations</h1>
            <p className="text-sm text-gray-400 mt-1">
              {conversations.length} conversation{conversations.length !== 1 ? 's' : ''}
            </p>
          </div>
          <a
            href="/admin"
            className="text-sm text-gray-400 hover:text-white transition"
          >
            ← Back to Admin
          </a>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Conversation List */}
          <div className="space-y-3">
            {conversations.map(convo => (
              <button
                key={convo.id}
                onClick={() => setSelectedConvo(convo)}
                className={`w-full text-left p-4 rounded-xl border transition ${
                  selectedConvo?.id === convo.id
                    ? 'bg-blue-600/10 border-blue-500/30'
                    : 'bg-gray-900 border-gray-800 hover:border-gray-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium">
                    {convo.callerName || convo.callerPhone}
                  </span>
                  <ConvoStatusBadge status={convo.status} />
                </div>
                {convo.serviceRequested && (
                  <p className="text-sm text-gray-400">{convo.serviceRequested}</p>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  {new Date(convo.createdAt).toLocaleDateString()} ·{' '}
                  {convo.messages.length} messages
                </p>
              </button>
            ))}

            {conversations.length === 0 && (
              <p className="text-gray-500 text-center py-8">No conversations yet</p>
            )}
          </div>

          {/* Message Thread */}
          <div className="md:col-span-2">
            {selectedConvo ? (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <div className="mb-4 pb-4 border-b border-gray-800">
                  <h3 className="font-semibold text-lg">
                    {selectedConvo.callerName || selectedConvo.callerPhone}
                  </h3>
                  <div className="flex gap-4 mt-2 text-sm text-gray-400">
                    <span>📱 {selectedConvo.callerPhone}</span>
                    {selectedConvo.intent && <span>🎯 {selectedConvo.intent}</span>}
                    {selectedConvo.serviceRequested && (
                      <span>🔧 {selectedConvo.serviceRequested}</span>
                    )}
                  </div>
                  {selectedConvo.summary && (
                    <p className="text-sm text-gray-400 mt-2 italic">
                      &quot;{selectedConvo.summary}&quot;
                    </p>
                  )}
                </div>

                <div className="space-y-3 max-h-[600px] overflow-y-auto">
                  {selectedConvo.messages.map(msg => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                          msg.direction === 'outbound'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-800 text-gray-200'
                        }`}
                      >
                        <p className="text-sm">{msg.content}</p>
                        <p className="text-xs opacity-50 mt-1">
                          {new Date(msg.createdAt).toLocaleTimeString()}
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
      </div>
    </div>
  )
}

function ConvoStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: 'bg-green-500/10 text-green-400',
    appointment_booked: 'bg-blue-500/10 text-blue-400',
    completed: 'bg-gray-500/10 text-gray-400',
    no_response: 'bg-yellow-500/10 text-yellow-400',
  }
  const labels: Record<string, string> = {
    active: 'Active',
    appointment_booked: 'Quote Scheduled',
    completed: 'Done',
    no_response: 'No Reply',
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${styles[status] || styles.completed}`}>
      {labels[status] || status}
    </span>
  )
}
