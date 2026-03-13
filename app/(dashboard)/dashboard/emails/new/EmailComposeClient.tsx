'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

type Tag = { id: string; name: string; color: string | null }
type Contact = { id: string; name: string | null; email: string | null; status: string }

const RECIPIENT_OPTIONS = [
  { value: 'all', label: 'All contacts with email' },
  { value: 'tags', label: 'Contacts with specific tags' },
  { value: 'status', label: 'Contacts with specific status' },
  { value: 'manual', label: 'Select contacts manually' },
] as const

export function EmailComposeClient() {
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [recipientType, setRecipientType] = useState<'all' | 'tags' | 'status' | 'manual'>('all')
  const [tagIds, setTagIds] = useState<string[]>([])
  const [statuses, setStatuses] = useState<string[]>([])
  const [manualContactIds, setManualContactIds] = useState<string[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [showPreview, setShowPreview] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/dashboard/tags')
      .then((r) => r.json())
      .then((data) => setTags(data.tags ?? []))
      .catch(() => {})
  }, [])
  useEffect(() => {
    fetch('/api/dashboard/contacts')
      .then((r) => r.json())
      .then((data) => setContacts(data.contacts ?? []))
      .catch(() => {})
  }, [])

  const contactsWithEmail = contacts.filter((c) => c.email)

  function buildSelection() {
    if (recipientType === 'all') return { type: 'all' as const }
    if (recipientType === 'tags') return { type: 'tags' as const, tagIds }
    if (recipientType === 'status') return { type: 'status' as const, statuses }
    return { type: 'manual' as const, contactIds: manualContactIds }
  }

  async function handleSend() {
    setError(null)
    if (!subject.trim()) {
      setError('Subject is required')
      return
    }
    setSending(true)
    try {
      const res = await fetch('/api/dashboard/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: subject.trim(),
          body: body.trim() || '<p>No content.</p>',
          recipientSelection: buildSelection(),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send')
      window.location.href = '/dashboard/emails'
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send campaign')
    } finally {
      setSending(false)
    }
  }

  function toggleTag(id: string) {
    setTagIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }
  function toggleStatus(s: string) {
    setStatuses((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))
  }
  function toggleContact(id: string) {
    setManualContactIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  return (
    <div className="space-y-6 w-full max-w-3xl">
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/emails"
          className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-gray-100 rounded-lg transition"
        >
          <ArrowLeft className="h-5 w-5 text-gray-500" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-gray-900">New Campaign</h1>
          <p className="text-gray-500 text-sm mt-0.5">Compose and send an email to your contacts</p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Subject *</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Email subject"
            className="w-full px-3 py-3 min-h-[44px] border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-gray-900"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Body</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your email content here. You can use simple HTML like <p>, <strong>, <a>."
            rows={12}
            className="w-full px-3 py-3 min-h-[44px] border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-gray-900 font-mono text-sm"
          />
          <p className="text-xs text-gray-500 mt-1">Simple HTML is supported (e.g. &lt;p&gt;, &lt;strong&gt;, &lt;a href="..."&gt;)</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6 space-y-4">
        <h2 className="font-semibold text-gray-900">Recipients</h2>
        <div className="space-y-3 w-full">
          {RECIPIENT_OPTIONS.map(({ value, label }) => (
            <label key={value} className="flex items-center gap-3 min-h-[44px] cursor-pointer">
              <input
                type="radio"
                name="recipientType"
                checked={recipientType === value}
                onChange={() => setRecipientType(value as typeof recipientType)}
                className="rounded border-gray-300 text-gray-900 w-5 h-5"
              />
              <span className="text-sm text-gray-700">{label}</span>
            </label>
          ))}
        </div>
        {recipientType === 'tags' && (
          <div className="pl-6 pt-2 flex flex-wrap gap-2">
            {tags.map((t) => (
              <label key={t.id} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={tagIds.includes(t.id)}
                  onChange={() => toggleTag(t.id)}
                  className="rounded border-gray-300 text-gray-900"
                />
                <span className="text-sm">{t.name}</span>
              </label>
            ))}
            {tags.length === 0 && <p className="text-sm text-gray-500">No tags yet. Create tags in Contacts.</p>}
          </div>
        )}
        {recipientType === 'status' && (
          <div className="pl-6 pt-2 flex flex-wrap gap-2">
            {['new', 'contacted', 'quoted', 'booked', 'completed', 'lost'].map((s) => (
              <label key={s} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={statuses.includes(s)}
                  onChange={() => toggleStatus(s)}
                  className="rounded border-gray-300 text-gray-900"
                />
                <span className="text-sm capitalize">{s}</span>
              </label>
            ))}
          </div>
        )}
        {recipientType === 'manual' && (
          <div className="pl-6 pt-2 max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-3 space-y-1">
            {contactsWithEmail.map((c) => (
              <label key={c.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={manualContactIds.includes(c.id)}
                  onChange={() => toggleContact(c.id)}
                  className="rounded border-gray-300 text-gray-900"
                />
                <span className="text-sm truncate">{c.name || c.email || c.id}</span>
                <span className="text-xs text-gray-500 truncate">{c.email}</span>
              </label>
            ))}
            {contactsWithEmail.length === 0 && <p className="text-sm text-gray-500">No contacts with email.</p>}
          </div>
        )}
      </div>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <button
          type="button"
          onClick={() => setShowPreview((p) => !p)}
          className="px-4 py-3 min-h-[44px] border border-gray-200 rounded-lg hover:bg-gray-50 font-medium"
        >
          {showPreview ? 'Hide preview' : 'Preview'}
        </button>
        <button
          type="button"
          onClick={handleSend}
          disabled={sending}
          className="px-4 py-3 min-h-[44px] bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 font-medium"
        >
          {sending ? 'Sending...' : 'Send campaign'}
        </button>
      </div>

      {showPreview && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-2">Preview</h3>
          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
            <p className="text-sm text-gray-500 mb-2">Subject: {subject || '(empty)'}</p>
            <div
              className="prose prose-sm max-w-none text-gray-700"
              dangerouslySetInnerHTML={{
                __html: body.trim() || '<p class="text-gray-500">(No body)</p>',
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
