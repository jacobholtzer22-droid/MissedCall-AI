'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import { ArrowLeft, Upload, X, ChevronUp, ChevronDown, Copy, Check, Code, Eye } from 'lucide-react'

type Tag = { id: string; name: string; color: string | null }
type Contact = { id: string; name: string | null; email: string | null; status: string }
type CampaignImage = { url: string; filename: string; order: number }

const RECIPIENT_OPTIONS = [
  { value: 'all', label: 'All contacts with email' },
  { value: 'tags', label: 'Contacts with specific tags' },
  { value: 'status', label: 'Contacts with specific status' },
  { value: 'manual', label: 'Select contacts manually' },
] as const

export function EmailComposeClient() {
  const [senderName, setSenderName] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [images, setImages] = useState<CampaignImage[]>([])
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [recipientType, setRecipientType] = useState<'all' | 'tags' | 'status' | 'manual'>('all')
  const [tagIds, setTagIds] = useState<string[]>([])
  const [statuses, setStatuses] = useState<string[]>([])
  const [manualContactIds, setManualContactIds] = useState<string[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [showPreview, setShowPreview] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editorMode, setEditorMode] = useState<'html' | 'visual'>('html')
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const previewIframeRef = useRef<HTMLIFrameElement>(null)

  const displaySenderName = senderName.trim() || 'Align and Acquire'
  const displaySubject = subject.trim() || '(No subject)'

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

  const uploadFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files)
    const imageFiles = fileArray.filter((f) =>
      ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'].includes(f.type)
    )
    if (imageFiles.length === 0) {
      setError('Only image files are allowed (png, jpg, jpeg, gif, webp)')
      return
    }
    setUploading(true)
    setError(null)
    try {
      const newImages: CampaignImage[] = []
      for (const file of imageFiles) {
        if (file.size > 5 * 1024 * 1024) {
          setError(`${file.name} exceeds 5MB limit`)
          continue
        }
        const formData = new FormData()
        formData.append('file', file)
        const res = await fetch('/api/campaigns/upload-image', { method: 'POST', body: formData })
        const data = await res.json()
        if (!res.ok) {
          setError(data.error || `Failed to upload ${file.name}`)
          continue
        }
        newImages.push({
          url: data.url,
          filename: data.filename,
          order: images.length + newImages.length,
        })
      }
      if (newImages.length > 0) {
        setImages((prev) => [...prev, ...newImages])
      }
    } catch {
      setError('Image upload failed')
    } finally {
      setUploading(false)
    }
  }, [images.length])

  function removeImage(index: number) {
    setImages((prev) => prev.filter((_, i) => i !== index).map((img, i) => ({ ...img, order: i })))
  }

  function moveImage(index: number, direction: 'up' | 'down') {
    setImages((prev) => {
      const next = [...prev]
      const swapIdx = direction === 'up' ? index - 1 : index + 1
      if (swapIdx < 0 || swapIdx >= next.length) return prev
      ;[next[index], next[swapIdx]] = [next[swapIdx], next[index]]
      return next.map((img, i) => ({ ...img, order: i }))
    })
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files.length > 0) uploadFiles(e.dataTransfer.files)
  }

  async function handleSend() {
    setError(null)
    if (!subject.trim()) {
      setError('Subject is required')
      return
    }
    setSending(true)
    try {
      const trimmedBody = body.trim()
      const isHtml = bodyContainsHtml(trimmedBody)
      const finalBody = isHtml
        ? trimmedBody
        : trimmedBody || '<p>No content.</p>'

      const res = await fetch('/api/dashboard/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderName: senderName.trim() || undefined,
          subject: subject.trim(),
          body: finalBody,
          bodyIsHtml: isHtml,
          images: images.length > 0 ? images : undefined,
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

  function bodyContainsHtml(text: string): boolean {
    return /<[a-z][\s\S]*?>/i.test(text)
  }

  function copyImageUrl(url: string) {
    navigator.clipboard.writeText(url)
    setCopiedUrl(url)
    setTimeout(() => setCopiedUrl(null), 2000)
  }

  function writeToIframe(iframe: HTMLIFrameElement | null, html: string) {
    if (!iframe) return
    const doc = iframe.contentDocument
    if (!doc) return
    doc.open()
    doc.write(html || '<p style="color:#999;font-family:sans-serif;">No content to preview</p>')
    doc.close()
  }

  useEffect(() => {
    if (editorMode === 'visual') {
      writeToIframe(iframeRef.current, body)
    }
  }, [editorMode, body])

  useEffect(() => {
    if (showPreview) {
      writeToIframe(previewIframeRef.current, body)
    }
  }, [showPreview, body])

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
          <label className="block text-sm font-medium text-gray-700 mb-1">Sender Display Name</label>
          <input
            type="text"
            value={senderName}
            onChange={(e) => setSenderName(e.target.value)}
            placeholder="e.g. Goosehead Insurance - Richard Smith"
            className="w-full px-3 py-3 min-h-[44px] border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-gray-900"
          />
          <p className="text-xs text-gray-500 mt-1">Defaults to &quot;Align and Acquire&quot; if left blank</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Subject Line *</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Email subject"
            className="w-full px-3 py-3 min-h-[44px] border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-gray-900"
          />
        </div>

        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
          <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Inbox Preview</p>
          <div className="flex items-baseline gap-2 text-sm">
            <span className="font-semibold text-gray-900 shrink-0">{displaySenderName}</span>
            <span className="text-gray-400">—</span>
            <span className="text-gray-600 truncate">{displaySubject}</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Upload Images</label>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition ${
              dragOver ? 'border-gray-900 bg-gray-50' : 'border-gray-300 hover:border-gray-400'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
              multiple
              className="hidden"
              onChange={(e) => { if (e.target.files) uploadFiles(e.target.files); e.target.value = '' }}
            />
            <Upload className="h-8 w-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-600">
              {uploading ? 'Uploading...' : 'Drag & drop images or click to browse'}
            </p>
            <p className="text-xs text-gray-400 mt-1">PNG, JPG, GIF, WebP — max 5MB each</p>
          </div>

          {images.length > 0 && (
            <div className="mt-3 space-y-2">
              {images.map((img, idx) => (
                <div key={img.url} className="flex items-center gap-3 rounded-lg border border-gray-200 p-2 bg-gray-50">
                  <img src={img.url} alt={img.filename} className="h-14 w-14 object-cover rounded" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-700 truncate">{img.filename}</p>
                    <p className="text-xs text-gray-400">Image {idx + 1} of {images.length}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => copyImageUrl(img.url)}
                      className="p-1.5 min-h-[36px] min-w-[36px] flex items-center justify-center rounded hover:bg-blue-100 text-blue-600 transition"
                      title="Copy image URL"
                    >
                      {copiedUrl === img.url ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => moveImage(idx, 'up')}
                      disabled={idx === 0}
                      className="p-1.5 min-h-[36px] min-w-[36px] flex items-center justify-center rounded hover:bg-gray-200 disabled:opacity-30 transition"
                      title="Move up"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveImage(idx, 'down')}
                      disabled={idx === images.length - 1}
                      className="p-1.5 min-h-[36px] min-w-[36px] flex items-center justify-center rounded hover:bg-gray-200 disabled:opacity-30 transition"
                      title="Move down"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeImage(idx)}
                      className="p-1.5 min-h-[36px] min-w-[36px] flex items-center justify-center rounded hover:bg-red-100 text-red-500 transition"
                      title="Remove"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
              <p className="text-xs text-gray-500">Use &quot;Copy Image URL&quot; to paste image URLs into your HTML template where you want them to appear.</p>
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-medium text-gray-700">Body</label>
            <div className="flex items-center rounded-lg border border-gray-200 bg-gray-50 p-0.5">
              <button
                type="button"
                onClick={() => setEditorMode('html')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition ${
                  editorMode === 'html'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Code className="h-3.5 w-3.5" />
                HTML
              </button>
              <button
                type="button"
                onClick={() => setEditorMode('visual')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition ${
                  editorMode === 'visual'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Eye className="h-3.5 w-3.5" />
                Visual
              </button>
            </div>
          </div>
          {editorMode === 'html' ? (
            <>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={'Paste your HTML email template here.\n\nYou can paste a full template from Mailchimp, Canva, or any email builder.\nOr write simple HTML like <p>Hello!</p>'}
                rows={16}
                className="w-full px-3 py-3 min-h-[44px] border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-gray-900 font-mono text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">
                Paste a full HTML email template or write simple HTML. Switch to &quot;Visual&quot; to preview.
              </p>
            </>
          ) : (
            <>
              <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                <iframe
                  ref={iframeRef}
                  title="Visual editor preview"
                  className="w-full border-0"
                  style={{ height: 400 }}
                  sandbox="allow-same-origin"
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Visual preview of your HTML. Switch to &quot;HTML&quot; mode to edit the source.
              </p>
            </>
          )}
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
          <p className="text-sm text-gray-500 mb-3">Subject: {subject || '(empty)'}</p>
          <div className="border border-gray-200 rounded-lg bg-gray-100 p-4 overflow-x-auto">
            <div className="mx-auto" style={{ width: 600, maxWidth: '100%' }}>
              <iframe
                ref={previewIframeRef}
                title="Email preview"
                className="w-full border-0 bg-white rounded"
                style={{ width: 600, minHeight: 400 }}
                sandbox="allow-same-origin"
                onLoad={() => {
                  const iframe = previewIframeRef.current
                  if (iframe?.contentDocument?.body) {
                    const h = iframe.contentDocument.body.scrollHeight
                    iframe.style.height = `${Math.max(h + 32, 400)}px`
                  }
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
