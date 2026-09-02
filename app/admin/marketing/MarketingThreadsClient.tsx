'use client'

import { useCallback, useEffect, useState } from 'react'

// Threads on the /book funnel number. Deliberately its own page rather than a
// tab in a client dashboard: this traffic belongs to no tenant, and mixing it
// into one would put Jacob's own leads in a client's inbox.

type Msg = {
  id: string
  direction: string
  content: string
  createdAt: string
  status: string | null
}

type Thread = {
  id: string
  phone: string
  status: string
  lastMessageAt: string
  optedOut: boolean
  firstName: string
  businessName: string
  trade: string
  arm: string | null
  messages: Msg[]
}

function when(iso: string): string {
  const d = new Date(iso)
  const mins = Math.round((Date.now() - d.getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function Bubble({ m }: { m: Msg }) {
  const inbound = m.direction === 'inbound'
  return (
    <div className={`flex ${inbound ? 'justify-start' : 'justify-end'} mb-2`}>
      <div
        className="max-w-[78%] px-3 py-2 rounded-lg text-[13.5px] leading-[1.5] whitespace-pre-wrap break-words"
        style={
          inbound
            ? { background: 'rgba(242,240,235,0.07)', color: '#F2F0EB' }
            : { background: '#EE6B1A', color: '#16181C' }
        }
      >
        {m.content}
        <div
          className="mt-1 font-mono text-[9px] uppercase tracking-wider"
          style={{ color: inbound ? '#6E7681' : 'rgba(22,24,28,0.6)' }}
        >
          {new Date(m.createdAt).toLocaleString()}
          {!inbound && m.status ? ` · ${m.status}` : ''}
        </div>
      </div>
    </div>
  )
}

export default function MarketingThreadsClient() {
  const [threads, setThreads] = useState<Thread[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/marketing-threads', { cache: 'no-store' })
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || 'Could not load threads.')
      const data = (await res.json()) as { threads: Thread[] }
      setThreads(data.threads)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load threads.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    // Cheap polling. These are low volume and Jacob leaves the tab open.
    const t = setInterval(() => void load(), 30_000)
    return () => clearInterval(t)
  }, [load])

  async function send(thread: Thread) {
    const text = draft.trim()
    if (!text || sending) return
    setSending(true)
    setSendError('')
    try {
      const res = await fetch('/api/admin/marketing-threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: thread.id, text }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setSendError(json?.error || 'Could not send.')
        return
      }
      setDraft('')
      // Optimistic append, then reconcile on the next poll.
      setThreads((prev) =>
        prev.map((t) => (t.id === thread.id ? { ...t, messages: [...t.messages, json.message as Msg] } : t))
      )
    } catch {
      setSendError('Could not send.')
    } finally {
      setSending(false)
    }
  }

  if (loading) return <div className="p-6 text-sm text-gray-500">Loading threads…</div>
  if (error) return <div className="p-6 text-sm text-orange-400">{error}</div>

  return (
    <div className="p-4 sm:p-6 max-w-3xl">
      <h1 className="text-2xl font-black uppercase tracking-tight mb-1">Marketing line</h1>
      <p className="text-sm text-gray-500 mb-6">
        Every text to and from the /book funnel number, newest first. Replies send from that same
        number, so they land in the thread the lead already has.
      </p>

      {threads.length === 0 ? (
        <p className="text-sm text-gray-500">No threads yet.</p>
      ) : (
        <div className="space-y-3">
          {threads.map((t) => {
            const open = openId === t.id
            const last = t.messages[t.messages.length - 1]
            const who = [t.firstName, t.businessName].filter(Boolean).join(' · ') || t.phone
            return (
              <div key={t.id} className="border border-gray-800 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => {
                    setOpenId(open ? null : t.id)
                    setDraft('')
                    setSendError('')
                  }}
                  className="w-full text-left px-4 py-3 hover:bg-gray-900/50"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-bold text-gray-100 text-[15px]">{who}</span>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-gray-500 shrink-0">
                      {when(t.lastMessageAt)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="font-mono text-[10px] text-gray-500">{t.phone}</span>
                    {t.arm && (
                      <span className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">
                        arm {t.arm}
                      </span>
                    )}
                    {t.trade && <span className="text-[11px] text-gray-500">{t.trade}</span>}
                    {t.optedOut && (
                      <span className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-red-950 text-red-300">
                        opted out
                      </span>
                    )}
                  </div>
                  {!open && last && (
                    <p className="mt-1.5 text-[13px] text-gray-400 truncate">
                      {last.direction === 'inbound' ? '← ' : '→ '}
                      {last.content}
                    </p>
                  )}
                </button>

                {open && (
                  <div className="px-4 pb-4 border-t border-gray-900 pt-3">
                    <div className="max-h-[340px] overflow-y-auto pr-1 mb-3">
                      {t.messages.map((m) => (
                        <Bubble key={m.id} m={m} />
                      ))}
                    </div>

                    {t.optedOut ? (
                      <p className="text-[12.5px] text-red-300">
                        This number sent STOP. Texting them again is not allowed, so the reply box is
                        disabled.
                      </p>
                    ) : (
                      <>
                        <textarea
                          value={draft}
                          onChange={(e) => {
                            setDraft(e.target.value)
                            setSendError('')
                          }}
                          rows={3}
                          placeholder="Reply as Jacob…"
                          className="w-full px-3 py-2 rounded border border-gray-700 bg-transparent text-[14px] text-gray-100 outline-none focus:border-orange-500"
                        />
                        <div className="flex items-center justify-between gap-3 mt-2">
                          <span className="font-mono text-[10px] text-gray-600">
                            {draft.length} chars · {Math.max(1, Math.ceil(draft.length / 153))} segment
                            {draft.length > 153 ? 's' : ''}
                          </span>
                          <button
                            type="button"
                            onClick={() => void send(t)}
                            disabled={sending || !draft.trim()}
                            className="px-4 py-2 rounded text-[13px] font-bold uppercase tracking-wide disabled:opacity-40"
                            style={{ background: '#EE6B1A', color: '#16181C' }}
                          >
                            {sending ? 'Sending…' : 'Send'}
                          </button>
                        </div>
                        {sendError && <p className="mt-2 text-[12.5px] text-orange-400">{sendError}</p>}
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
