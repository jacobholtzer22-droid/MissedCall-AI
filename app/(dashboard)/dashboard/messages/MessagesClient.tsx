'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Search, Plus, MessageCircle, Send, Users, Tag, Filter, ArrowLeft } from 'lucide-react'
import { formatRelativeTime, formatPhoneNumber } from '@/lib/utils'

type ConversationListItem = {
  conversationId: string
  contactId: string | null
  contactName: string | null
  contactPhone: string
  lastMessage: string | null
  lastMessageAt: string | null
  unreadCount: number
}

type MessageItem = {
  id: string
  body: string
  direction: 'inbound' | 'outbound'
  createdAt: string
  status: string | null
}

type RecipientFilter =
  | { type: 'all' }
  | { type: 'tags'; tagIds: string[] }
  | { type: 'status'; statuses: string[] }
  | { type: 'manual'; contactIds: string[] }

type ContactOption = {
  id: string
  name: string | null
  phoneNumber: string
  status: string | null
  tags: { id: string; name: string }[]
}

type CampaignPreview = {
  recipientCount: number
  sampleMessage: string
}

export function MessagesClient() {
  const [conversations, setConversations] = useState<ConversationListItem[]>([])
  const [conversationsLoading, setConversationsLoading] = useState(true)
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)
  const [selectedContactLabel, setSelectedContactLabel] = useState<string>('')
  const [messages, setMessages] = useState<MessageItem[]>([])
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [messageInput, setMessageInput] = useState('')
  const [sending, setSending] = useState(false)
  const [search, setSearch] = useState('')

  const [newMessageOpen, setNewMessageOpen] = useState(false)
  const [newMessagePhone, setNewMessagePhone] = useState('')
  const [newMessageContactSearch, setNewMessageContactSearch] = useState('')
  const [contacts, setContacts] = useState<ContactOption[]>([])
  const [contactsLoading, setContactsLoading] = useState(false)
  const [selectedContactIdForNew, setSelectedContactIdForNew] = useState<string | null>(null)

  const [campaignOpen, setCampaignOpen] = useState(false)
  const [campaignBody, setCampaignBody] = useState('')
  const [campaignFilter, setCampaignFilter] = useState<RecipientFilter>({ type: 'all' })
  const [campaignMergeFields, setCampaignMergeFields] = useState(true)
  const [campaignPreview, setCampaignPreview] = useState<CampaignPreview | null>(null)
  const [campaignSending, setCampaignSending] = useState(false)
  const [campaignProgress, setCampaignProgress] = useState<string | null>(null)
  const [campaignResult, setCampaignResult] = useState<{ sent: number; failed: number; skipped: number } | null>(null)
  const [mobileChatOpen, setMobileChatOpen] = useState(false)

  const filteredConversations = useMemo(() => {
    if (!search.trim()) return conversations
    const term = search.toLowerCase()
    return conversations.filter((c) => {
      const nameOrPhone =
        (c.contactName || '') +
        ' ' +
        formatPhoneNumber(c.contactPhone)
      return (
        nameOrPhone.toLowerCase().includes(term) ||
        (c.lastMessage || '').toLowerCase().includes(term)
      )
    })
  }, [conversations, search])

  const charCount = campaignBody.length
  const charLimit = 160

  const loadConversations = useCallback(async () => {
    setConversationsLoading(true)
    try {
      const res = await fetch('/api/dashboard/messages')
      if (!res.ok) throw new Error('Failed to load messages')
      const data = await res.json()
      setConversations(data.conversations ?? [])
      if (!selectedConversationId && data.conversations?.length) {
        const first = data.conversations[0]
        setSelectedConversationId(first.conversationId)
        setSelectedContactLabel(first.contactName || formatPhoneNumber(first.contactPhone))
      }
    } catch (err) {
      console.error(err)
    } finally {
      setConversationsLoading(false)
    }
  }, [selectedConversationId])

  useEffect(() => {
    loadConversations()
  }, [loadConversations])

  const loadMessages = useCallback(
    async (conversationId: string | null) => {
      if (!conversationId) return
      setMessagesLoading(true)
      try {
        const res = await fetch(`/api/dashboard/messages/${conversationId}`)
        if (!res.ok) throw new Error('Failed to load conversation')
        const data = await res.json()
        setMessages(data.messages ?? [])
      } catch (err) {
        console.error(err)
      } finally {
        setMessagesLoading(false)
      }
    },
    []
  )

  useEffect(() => {
    if (selectedConversationId) {
      loadMessages(selectedConversationId)
    }
  }, [selectedConversationId, loadMessages])

  async function handleSelectConversation(conv: ConversationListItem) {
    setSelectedConversationId(conv.conversationId)
    setSelectedContactLabel(conv.contactName || formatPhoneNumber(conv.contactPhone))
    setMobileChatOpen(true)
  }

  function handleBackToList() {
    setMobileChatOpen(false)
  }

  async function handleSendMessage() {
    const body = messageInput.trim()
    if (!body || !selectedConversationId) return
    setSending(true)
    try {
      const currentConv = conversations.find((c) => c.conversationId === selectedConversationId)
      const to = currentConv?.contactPhone
      if (!to) throw new Error('Missing recipient number')
      const res = await fetch('/api/dashboard/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, body, conversationId: selectedConversationId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send message')
      const newMsg: MessageItem = data.message
      setMessages((prev) => [...prev, newMsg])
      setMessageInput('')
      loadConversations()
    } catch (err) {
      console.error(err)
    } finally {
      setSending(false)
    }
  }

  function openNewMessage() {
    setNewMessageOpen(true)
    setNewMessagePhone('')
    setNewMessageContactSearch('')
    setSelectedContactIdForNew(null)
    if (!contacts.length) {
      void loadContacts()
    }
  }

  async function loadContacts() {
    setContactsLoading(true)
    try {
      const res = await fetch('/api/dashboard/messages/contacts')
      const data = await res.json()
      if (res.ok) {
        setContacts(data.contacts ?? [])
      }
    } catch (err) {
      console.error(err)
    } finally {
      setContactsLoading(false)
    }
  }

  const filteredContacts = useMemo(() => {
    if (!newMessageContactSearch.trim()) return contacts
    const term = newMessageContactSearch.toLowerCase()
    return contacts.filter((c) => {
      const label =
        (c.name || '') +
        ' ' +
        formatPhoneNumber(c.phoneNumber)
      return label.toLowerCase().includes(term)
    })
  }, [contacts, newMessageContactSearch])

  async function handleStartNewConversation() {
    const body = messageInput.trim()
    if (!body) return
    let to: string | undefined
    let contactId: string | null = null

    if (selectedContactIdForNew) {
      const c = contacts.find((x) => x.id === selectedContactIdForNew)
      if (!c) return
      to = c.phoneNumber
      contactId = c.id
    } else if (newMessagePhone.trim()) {
      to = newMessagePhone.trim()
    }

    if (!to) return

    setSending(true)
    try {
      const res = await fetch('/api/dashboard/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, body }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send message')
      const msg: MessageItem = data.message
      const convId: string = data.conversationId
      setNewMessageOpen(false)
      setSelectedConversationId(convId)
      setSelectedContactLabel(data.contactLabel || formatPhoneNumber(to))
      setMessages([msg])
      setMessageInput('')
      loadConversations()
    } catch (err) {
      console.error(err)
    } finally {
      setSending(false)
    }
  }

  function openCampaign() {
    setCampaignOpen(true)
    setCampaignBody('')
    setCampaignFilter({ type: 'all' })
    setCampaignMergeFields(true)
    setCampaignPreview(null)
    setCampaignResult(null)
    setCampaignProgress(null)
  }

  async function handlePreviewCampaign() {
    if (!campaignBody.trim()) return
    try {
      const res = await fetch('/api/dashboard/messages/campaign/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: campaignBody,
          recipientFilter: campaignFilter,
          mergeFields: campaignMergeFields,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to build preview')
      setCampaignPreview({
        recipientCount: data.recipientCount ?? 0,
        sampleMessage: data.sampleMessage ?? '',
      })
    } catch (err) {
      console.error(err)
    }
  }

  async function handleSendCampaign() {
    if (!campaignBody.trim()) return
    setCampaignSending(true)
    setCampaignProgress('Starting...')
    setCampaignResult(null)
    try {
      const res = await fetch('/api/dashboard/messages/campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: campaignBody,
          recipientFilter: campaignFilter,
          mergeFields: campaignMergeFields,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send campaign')
      setCampaignResult({ sent: data.sent ?? 0, failed: data.failed ?? 0, skipped: data.skipped ?? 0 })
      setCampaignProgress('Completed')
    } catch (err) {
      console.error(err)
      setCampaignProgress('Error')
    } finally {
      setCampaignSending(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Messages</h1>
          <p className="text-gray-500 mt-1">Central hub for two-way SMS with your customers</p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <button
            type="button"
            onClick={openCampaign}
            className="inline-flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition font-medium"
          >
            <MessageCircle className="h-4 w-4" />
            Send Campaign
          </button>
          <button
            type="button"
            onClick={openNewMessage}
            className="inline-flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition font-medium"
          >
            <Plus className="h-4 w-4" />
            New Message
          </button>
        </div>
      </div>

      {/* Two-panel layout: on mobile show list or chat (full-screen); on md+ show side-by-side */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col h-[calc(100vh-12rem)] md:h-[600px]">
        {/* Mobile: conversation list (hidden when chat is open) */}
        <div
          className={`w-full md:w-80 border-b md:border-b-0 md:border-r border-gray-200 flex flex-col ${
            mobileChatOpen && selectedConversationId ? 'hidden md:flex' : 'flex'
          }`}
        >
          <div className="p-3 border-b border-gray-100 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name or number..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-3 py-3 min-h-[44px] border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {conversationsLoading ? (
              <div className="py-8 text-center text-gray-500 text-sm">Loading conversations...</div>
            ) : filteredConversations.length === 0 ? (
              <div className="py-12 text-center text-gray-500 text-sm px-4">
                No conversations yet. Click <span className="font-medium text-gray-900">New Message</span> to start one.
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {filteredConversations.map((c) => (
                  <li key={c.conversationId}>
                    <button
                      type="button"
                      onClick={() => handleSelectConversation(c)}
                      className={`w-full text-left px-4 py-3 min-h-[44px] hover:bg-gray-50 flex items-start gap-3 ${
                        selectedConversationId === c.conversationId ? 'bg-gray-50' : ''
                      }`}
                    >
                      <div className="mt-1">
                        <span
                          className={`inline-block w-2 h-2 rounded-full ${
                            c.unreadCount > 0 ? 'bg-blue-500' : 'bg-gray-300'
                          }`}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium text-gray-900 truncate">
                            {c.contactName || formatPhoneNumber(c.contactPhone)}
                          </p>
                          <span className="text-xs text-gray-500">
                            {c.lastMessageAt ? formatRelativeTime(c.lastMessageAt) : ''}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 truncate mt-0.5">
                          {c.lastMessage || 'No messages yet'}
                        </p>
                        {c.unreadCount > 0 && (
                          <span className="inline-flex items-center mt-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-medium">
                            {c.unreadCount} new
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Right: conversation thread (on mobile full-screen when selected, with back) */}
        <div
          className={`flex-1 flex flex-col bg-gray-50 ${
            mobileChatOpen && selectedConversationId ? 'flex' : 'hidden md:flex'
          }`}
        >
          {selectedConversationId ? (
            <>
              <div className="px-4 py-3 border-b border-gray-200 bg-white flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleBackToList}
                  className="md:hidden p-2 -ml-2 rounded-lg hover:bg-gray-100 min-h-[44px] min-w-[44px] flex items-center justify-center"
                  aria-label="Back to conversations"
                >
                  <ArrowLeft className="h-5 w-5 text-gray-600" />
                </button>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">{selectedContactLabel}</p>
                  <p className="text-xs text-gray-500">Two-way SMS conversation</p>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                {messagesLoading ? (
                  <div className="py-8 text-center text-gray-500 text-sm">Loading messages...</div>
                ) : messages.length === 0 ? (
                  <div className="py-8 text-center text-gray-500 text-sm">No messages yet. Send the first message below.</div>
                ) : (
                  messages.map((m) => (
                    <div key={m.id} className={`flex ${m.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] sm:max-w-md rounded-2xl px-4 py-2 text-sm shadow-sm ${
                        m.direction === 'outbound'
                          ? 'bg-blue-600 text-white rounded-br-sm'
                          : 'bg-gray-200 text-gray-900 rounded-bl-sm'
                      }`}>
                        <p className="whitespace-pre-wrap break-words">{m.body}</p>
                        <div className={`mt-1 flex items-center justify-between text-[10px] ${
                          m.direction === 'outbound' ? 'text-blue-100' : 'text-gray-500'
                        }`}>
                          <span>{formatRelativeTime(m.createdAt)}</span>
                          {m.direction === 'outbound' && m.status && (
                            <span className="ml-2 capitalize">{m.status}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="border-t border-gray-200 bg-white px-4 py-3 shrink-0 sticky bottom-0 safe-area-pb">
                <div className="flex items-end gap-2">
                  <textarea
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    rows={2}
                    placeholder="Type a message..."
                    className="flex-1 resize-none border border-gray-200 rounded-lg px-3 py-3 min-h-[44px] text-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  />
                  <button
                    type="button"
                    onClick={selectedConversationId ? handleSendMessage : handleStartNewConversation}
                    disabled={sending || !messageInput.trim()}
                    className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] px-4 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-60 disabled:cursor-not-allowed transition"
                  >
                    <Send className="h-4 w-4 md:mr-1" />
                    <span className="hidden md:inline">Send</span>
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
              <MessageCircle className="h-10 w-10 text-gray-300 mb-3" />
              <h2 className="text-lg font-medium text-gray-900 mb-1">Select a conversation</h2>
              <p className="text-sm text-gray-500 mb-4">
                Choose a contact on the left to view the conversation, or start a new message.
              </p>
              <button
                type="button"
                onClick={openNewMessage}
                className="inline-flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition text-sm font-medium"
              >
                <Plus className="h-4 w-4" />
                New Message
              </button>
            </div>
          )}
        </div>
      </div>

      {/* New message modal - full-screen on mobile */}
      {newMessageOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-0 md:p-4">
          <div className="bg-white rounded-none md:rounded-xl shadow-xl max-w-lg w-full h-full md:h-auto md:max-h-[90vh] flex flex-col">
            <div className="px-4 md:px-6 py-4 border-b border-gray-200 flex items-center justify-between gap-3 shrink-0">
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold text-gray-900">New Message</h2>
                <p className="text-sm text-gray-500 truncate">Select an existing contact or enter a phone number</p>
              </div>
              <button
                type="button"
                onClick={() => setNewMessageOpen(false)}
                className="shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-100 md:min-h-0 md:min-w-0 md:text-gray-400 md:hover:text-gray-600"
                aria-label="Close"
              >
                <ArrowLeft className="h-5 w-5 md:hidden" />
                <span className="hidden md:inline text-sm">Esc</span>
              </button>
            </div>
            <div className="px-4 md:px-6 py-4 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Existing contact</label>
                <div className="relative">
                  <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search contacts by name or phone..."
                    value={newMessageContactSearch}
                    onChange={(e) => setNewMessageContactSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-3 min-h-[44px] border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  />
                </div>
                <div className="mt-2 max-h-40 overflow-y-auto border border-gray-100 rounded-lg">
                  {contactsLoading ? (
                    <div className="py-4 text-center text-gray-500 text-sm">Loading contacts...</div>
                  ) : filteredContacts.length === 0 ? (
                    <div className="py-4 text-center text-gray-500 text-sm">No contacts found.</div>
                  ) : (
                    <ul className="divide-y divide-gray-100 text-sm">
                      {filteredContacts.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedContactIdForNew(c.id)
                              setNewMessagePhone('')
                            }}
                            className={`w-full text-left px-3 py-3 min-h-[44px] hover:bg-gray-50 flex items-center justify-between ${
                              selectedContactIdForNew === c.id ? 'bg-gray-50' : ''
                            }`}
                          >
                            <div>
                              <p className="font-medium text-gray-900">
                                {c.name || formatPhoneNumber(c.phoneNumber)}
                              </p>
                              <p className="text-xs text-gray-500">
                                {c.name ? formatPhoneNumber(c.phoneNumber) : ''}
                              </p>
                            </div>
                            <div className="flex items-center gap-1">
                              {c.tags.slice(0, 2).map((t) => (
                                <span
                                  key={t.id}
                                  className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-[10px]"
                                >
                                  <Tag className="h-3 w-3 mr-1" />
                                  {t.name}
                                </span>
                              ))}
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-1">Or phone number</label>
                <input
                  type="tel"
                  placeholder="Enter phone number (e.g. +1...)"
                  value={newMessagePhone}
                  onChange={(e) => {
                    setNewMessagePhone(e.target.value)
                    setSelectedContactIdForNew(null)
                  }}
                  className="w-full px-3 py-3 min-h-[44px] border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
                <textarea
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  rows={3}
                  className="w-full resize-none border border-gray-200 rounded-lg px-3 py-3 min-h-[44px] text-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  placeholder="Type your message..."
                />
              </div>
            </div>
            <div className="px-4 md:px-6 py-4 border-t border-gray-200 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 shrink-0">
              <p className="text-xs text-gray-500">
                Messages send from your business&apos;s Telnyx number.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setNewMessageOpen(false)}
                  className="flex-1 sm:flex-none px-4 py-3 min-h-[44px] text-sm text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={sending || !messageInput.trim() || (!selectedContactIdForNew && !newMessagePhone.trim())}
                  onClick={handleStartNewConversation}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-3 min-h-[44px] bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <Send className="h-4 w-4" />
                  Send
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Campaign modal - full-screen on mobile */}
      {campaignOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-0 md:p-4">
          <div className="bg-white rounded-none md:rounded-xl shadow-xl max-w-2xl w-full h-full md:h-auto md:max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-4 md:px-6 py-4 border-b border-gray-200 flex items-center justify-between gap-3 shrink-0">
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold text-gray-900">Send SMS Campaign</h2>
                <p className="text-sm text-gray-500 line-clamp-2">
                  Broadcast a message to multiple contacts. We&apos;ll send in small batches to avoid rate limits.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCampaignOpen(false)}
                className="shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-100 md:min-h-0 md:min-w-0 md:text-gray-400 md:hover:text-gray-600"
                aria-label="Close"
              >
                <ArrowLeft className="h-5 w-5 md:hidden" />
                <span className="hidden md:inline text-sm">Esc</span>
              </button>
            </div>
            <div className="px-4 md:px-6 py-4 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
                <textarea
                  value={campaignBody}
                  onChange={(e) => setCampaignBody(e.target.value)}
                  rows={4}
                  className="w-full resize-none border border-gray-200 rounded-lg px-3 py-3 min-h-[44px] text-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  placeholder="Write your SMS campaign. Use {{name}} and {{business_name}} as merge fields."
                />
                <div className="mt-1 flex items-center justify-between text-xs">
                  <span className={charCount > charLimit ? 'text-red-600' : 'text-gray-500'}>
                    {charCount}/{charLimit} characters
                  </span>
                  <label className="inline-flex items-center gap-1 text-gray-600">
                    <input
                      type="checkbox"
                      checked={campaignMergeFields}
                      onChange={(e) => setCampaignMergeFields(e.target.checked)}
                      className="h-3 w-3 rounded border-gray-300 text-gray-900"
                    />
                    Enable merge fields
                  </label>
                </div>
              </div>

              <div className="border border-gray-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700 flex items-center gap-1">
                    <Filter className="h-4 w-4" />
                    Recipients
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setCampaignFilter({ type: 'all' })}
                    className={`px-3 py-2 min-h-[44px] md:min-h-0 rounded-full border ${
                      campaignFilter.type === 'all'
                        ? 'bg-gray-900 text-white border-gray-900'
                        : 'bg-gray-50 text-gray-700 border-gray-200'
                    }`}
                  >
                    All contacts
                  </button>
                  <button
                    type="button"
                    onClick={() => setCampaignFilter({ type: 'tags', tagIds: [] })}
                    className={`px-3 py-2 min-h-[44px] md:min-h-0 rounded-full border ${
                      campaignFilter.type === 'tags'
                        ? 'bg-gray-900 text-white border-gray-900'
                        : 'bg-gray-50 text-gray-700 border-gray-200'
                    }`}
                  >
                    With tags
                  </button>
                  <button
                    type="button"
                    onClick={() => setCampaignFilter({ type: 'status', statuses: [] })}
                    className={`px-3 py-2 min-h-[44px] md:min-h-0 rounded-full border ${
                      campaignFilter.type === 'status'
                        ? 'bg-gray-900 text-white border-gray-900'
                        : 'bg-gray-50 text-gray-700 border-gray-200'
                    }`}
                  >
                    By status
                  </button>
                  <button
                    type="button"
                    onClick={() => setCampaignFilter({ type: 'manual', contactIds: [] })}
                    className={`px-3 py-2 min-h-[44px] md:min-h-0 rounded-full border ${
                      campaignFilter.type === 'manual'
                        ? 'bg-gray-900 text-white border-gray-900'
                        : 'bg-gray-50 text-gray-700 border-gray-200'
                    }`}
                  >
                    Manual selection
                  </button>
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  Advanced filters (tags, status, manual selection) are configured via the API selection for now.
                </p>
              </div>

              <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                <p className="text-xs font-medium text-gray-700 mb-1">Preview</p>
                {campaignPreview ? (
                  <>
                    <p className="text-xs text-gray-600 mb-1">
                      {campaignPreview.recipientCount} recipients will receive this message:
                    </p>
                    <div className="mt-1 rounded-lg bg-white border border-gray-200 px-3 py-2 text-xs text-gray-800">
                      {campaignPreview.sampleMessage}
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-gray-500">
                    Click &quot;Preview&quot; to see a sample with merge fields filled in.
                  </p>
                )}
              </div>

              {campaignProgress && (
                <div className="text-xs text-gray-600">
                  Progress: <span className="font-medium">{campaignProgress}</span>
                </div>
              )}

              {campaignResult && (
                <div className="text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                  <p className="font-medium text-gray-900 mb-1">Results</p>
                  <p>Sent: {campaignResult.sent}</p>
                  <p>Failed: {campaignResult.failed}</p>
                  <p>Skipped (no phone): {campaignResult.skipped}</p>
                </div>
              )}
            </div>
            <div className="px-4 md:px-6 py-4 border-t border-gray-200 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 shrink-0">
              <p className="text-xs text-gray-500">
                Campaigns send via Telnyx in small batches of 10 every 2 seconds.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCampaignOpen(false)}
                  className="px-4 py-3 min-h-[44px] text-sm text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handlePreviewCampaign}
                  className="px-4 py-3 min-h-[44px] text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                  disabled={!campaignBody.trim()}
                >
                  Preview
                </button>
                <button
                  type="button"
                  disabled={campaignSending || !campaignBody.trim()}
                  onClick={handleSendCampaign}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-3 min-h-[44px] bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <Send className="h-4 w-4" />
                  Send Campaign
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}