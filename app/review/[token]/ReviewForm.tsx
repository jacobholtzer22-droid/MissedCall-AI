'use client'

// The client's preview review (PREVIEW_FEEDBACK). One box per page; each saves
// when it loses focus. "Send my notes" drafts a change for Jacob in Ops HQ;
// "Looks good" records the approval. Neither publishes anything.

import { useCallback, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import type { PublicReview } from '@/lib/ops/preview-feedback'

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export function ReviewForm({ token, initial }: { token: string; initial: PublicReview }) {
  const api = `/api/review/${encodeURIComponent(token)}`
  const [notes, setNotes] = useState<Record<string, string>>(initial.notes)
  const [saved, setSaved] = useState<Record<string, string>>(initial.notes)
  const [state, setState] = useState<Record<string, SaveState>>({})
  const [done, setDone] = useState<'no' | 'busy' | 'notes' | 'approved'>(initial.approved ? 'approved' : 'no')
  const [error, setError] = useState('')

  const save = useCallback(
    async (key: string) => {
      const value = notes[key] ?? ''
      if ((saved[key] ?? '') === value) return
      setState((s) => ({ ...s, [key]: 'saving' }))
      try {
        const res = await fetch(api, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes: { [key]: value } }) })
        if (!res.ok) throw new Error(String(res.status))
        setSaved((s) => ({ ...s, [key]: value }))
        setState((s) => ({ ...s, [key]: 'saved' }))
      } catch {
        setState((s) => ({ ...s, [key]: 'error' }))
      }
    },
    [notes, saved, api]
  )

  async function flush() {
    const pending = Object.fromEntries(Object.entries(notes).filter(([k, v]) => (saved[k] ?? '') !== v))
    if (!Object.keys(pending).length) return
    const res = await fetch(api, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes: pending }) })
    if (!res.ok) throw new Error('save')
    setSaved({ ...saved, ...pending })
  }

  async function submit() {
    setDone('busy')
    setError('')
    try {
      await flush()
      const res = await fetch(`${api}/submit`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(data.error ?? ''))
      setDone('notes')
    } catch (err) {
      setDone('no')
      setError(err instanceof Error && err.message && err.message !== 'save' ? err.message : "That didn't go through. Check your connection and try again.")
    }
  }

  async function approve() {
    setDone('busy')
    setError('')
    try {
      const res = await fetch(`${api}/approve`, { method: 'POST' })
      if (!res.ok) throw new Error('approve')
      setDone('approved')
    } catch {
      setDone('no')
      setError("That didn't go through. Check your connection and try again.")
    }
  }

  const hey = initial.firstName ? `Hey ${initial.firstName},` : 'Hey,'

  if (done === 'notes' || done === 'approved') {
    return (
      <main className="min-h-screen bg-gray-950 px-4 py-16 text-gray-100">
        <div className="mx-auto max-w-xl space-y-3">
          <p className="text-sm text-gray-400">Jacob, Align and Acquire</p>
          <h1 className="text-2xl font-semibold">{done === 'notes' ? 'Got it, thank you.' : 'Thank you!'}</h1>
          <p className="text-gray-300">
            {done === 'notes'
              ? "I'll make these changes and send you a new preview to look at."
              : "I'll get it ready to go live and let you know when it's up."}
          </p>
          {done === 'notes' && (
            <button type="button" onClick={() => setDone('no')} className="text-sm text-blue-400 underline">
              Back to my notes
            </button>
          )}
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gray-950 px-4 py-10 text-gray-100">
      <div className="mx-auto max-w-2xl space-y-8">
        <header className="space-y-3">
          <p className="text-sm text-gray-400">Jacob, Align and Acquire</p>
          <h1 className="text-2xl font-semibold">Your new website is ready to look at</h1>
          <p className="text-gray-300">
            {hey} here&apos;s the preview of {initial.businessName || 'your new site'}. Open it, click around on your phone, and tell me anything you want changed. Each note saves on its own as you type it.
          </p>
          {initial.previewUrl ? (
            <a
              href={initial.previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-blue-600 px-5 font-medium text-white hover:bg-blue-500"
            >
              Open the preview <ExternalLink className="h-4 w-4" />
            </a>
          ) : (
            <p className="text-amber-300">The preview isn&apos;t ready yet. Jacob will text you when it is.</p>
          )}
        </header>

        <section className="space-y-5">
          {initial.pages.map((p) => {
            const st = state[p.key] ?? 'idle'
            return (
              <div key={p.key} className="space-y-2">
                <label htmlFor={`n-${p.key}`} className="block font-medium text-gray-100">
                  {p.label}
                </label>
                <textarea
                  id={`n-${p.key}`}
                  rows={2}
                  maxLength={4000}
                  placeholder="What should change here? Leave it blank if it looks right."
                  value={notes[p.key] ?? ''}
                  onChange={(e) => setNotes((n) => ({ ...n, [p.key]: e.target.value }))}
                  onBlur={() => void save(p.key)}
                  className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-base text-gray-100 placeholder:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                />
                <p className="h-4 text-xs text-gray-500" aria-live="polite">
                  {st === 'saving' ? 'Saving...' : st === 'saved' ? 'Saved' : st === 'error' ? 'Not saved. Click out of the box to try again.' : ''}
                </p>
              </div>
            )
          })}
        </section>

        <footer className="space-y-3 border-t border-gray-800 pt-6">
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void submit()}
              disabled={done === 'busy'}
              className="min-h-[44px] rounded-lg bg-blue-600 px-5 font-medium text-white hover:bg-blue-500 disabled:opacity-60"
            >
              Send my notes to Jacob
            </button>
            <button
              type="button"
              onClick={() => void approve()}
              disabled={done === 'busy'}
              className="min-h-[44px] rounded-lg border border-gray-700 bg-gray-800 px-5 font-medium text-gray-100 hover:bg-gray-700 disabled:opacity-60"
            >
              Looks good, no changes
            </button>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </footer>
      </div>
    </main>
  )
}
