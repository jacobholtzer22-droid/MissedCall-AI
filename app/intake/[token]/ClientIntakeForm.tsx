'use client'

// The client's intake form (CLIENT_INTAKE_LINK). Each answer saves when the
// box loses focus (PATCH /api/intake/<token>), so a half-done form is kept
// and the same link opens it again. Photos, videos and the logo go through
// the admin intake page's own Uploader and upload queue, pointed at the
// link's routes. Done records the answers for Jacob (an Ops HQ note) and
// sends nothing.

import { useCallback, useState } from 'react'
import type { Intake } from '@/lib/ops/intake'
import type { PublicIntake, Question } from '@/lib/ops/client-intake'
import { Uploader } from '@/app/admin/ops/intake/[engagementId]/Uploader'

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export function ClientIntakeForm({ token, engagementId, initial, questions }: { token: string; engagementId: string; initial: PublicIntake; questions: Question[] }) {
  const api = `/api/intake/${encodeURIComponent(token)}`
  const [answers, setAnswers] = useState<Record<string, string>>(initial.answers)
  const [saved, setSaved] = useState<Record<string, string>>(initial.answers)
  const [state, setState] = useState<Record<string, SaveState>>({})
  const [files, setFiles] = useState(initial.files)
  const [done, setDone] = useState<'no' | 'sending' | 'yes' | 'error'>('no')
  const [error, setError] = useState('')

  const save = useCallback(
    async (n: number) => {
      const key = String(n)
      const value = answers[key] ?? ''
      if ((saved[key] ?? '') === value) return
      setState((s) => ({ ...s, [key]: 'saving' }))
      try {
        const res = await fetch(api, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers: { [key]: value } }) })
        if (!res.ok) throw new Error(String((await res.json().catch(() => ({}))).error ?? res.status))
        setSaved((s) => ({ ...s, [key]: value }))
        setState((s) => ({ ...s, [key]: 'saved' }))
      } catch {
        setState((s) => ({ ...s, [key]: 'error' }))
      }
    },
    [answers, saved, api]
  )

  const onSaved = useCallback((i: Intake) => {
    setFiles(((i.assets ?? []) as { filename: string; kind: string }[]).map((a) => ({ filename: a.filename, kind: a.kind })))
  }, [])

  async function finish() {
    setDone('sending')
    setError('')
    try {
      // Anything typed but not yet saved goes first.
      const pending = Object.fromEntries(Object.entries(answers).filter(([k, v]) => (saved[k] ?? '') !== v))
      if (Object.keys(pending).length) {
        const res = await fetch(api, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers: pending }) })
        if (!res.ok) throw new Error('save')
        setSaved({ ...saved, ...pending })
      }
      const res = await fetch(`${api}/finish`, { method: 'POST' })
      if (!res.ok) throw new Error('finish')
      setDone('yes')
    } catch {
      setDone('error')
      setError("That didn't go through. Check your connection and press Done again.")
    }
  }

  const hey = initial.firstName ? `Hey ${initial.firstName},` : 'Hey,'
  const sections = Array.from(new Set(questions.map((q) => q.section)))
  const logo = files.some((f) => f.kind === 'logo')
  const photos = files.filter((f) => f.kind === 'photo' || f.kind === 'video').length

  if (done === 'yes') {
    return (
      <main className="min-h-screen bg-gray-950 px-4 py-16 text-gray-100">
        <div className="mx-auto max-w-xl space-y-3">
          <p className="text-sm text-gray-400">Jacob, Align and Acquire</p>
          <h1 className="text-2xl font-semibold">Got it, thank you.</h1>
          <p className="text-gray-300">
            I&apos;ll go through your answers and reach out if I need anything else. You can come back to this same link anytime to add more or change an answer.
          </p>
          <button type="button" onClick={() => setDone('no')} className="text-sm text-blue-400 underline">
            Back to my answers
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gray-950 px-4 py-10 text-gray-100">
      <div className="mx-auto max-w-2xl space-y-8">
        <header className="space-y-3">
          <p className="text-sm text-gray-400">Jacob, Align and Acquire</p>
          <h1 className="text-2xl font-semibold">Let&apos;s get {initial.businessName || 'your business'} set up</h1>
          <p className="text-gray-300">
            {hey} rough answers are totally fine, and if you&apos;re unsure on anything just say so and we&apos;ll knock it out on a quick call.
          </p>
          <p className="text-gray-300">
            If you&apos;re short on time, I need 1 through 14 and 17 through 19 first. Those are what I need to build the campaign. The rest can come after.
          </p>
          <p className="text-sm text-gray-400">Every answer saves on its own as you go. You can close this page and come back to the same link anytime.</p>
        </header>

        {sections.map((section) => (
          <section key={section} className="space-y-5">
            <h2 className="text-sm font-semibold tracking-wide text-gray-400">{section}</h2>
            {questions
              .filter((q) => q.section === section)
              .map((q) => {
                const key = String(q.n)
                const st = state[key] ?? 'idle'
                return (
                  <div key={q.n} className="space-y-2">
                    <label htmlFor={`q${q.n}`} className="block text-gray-100">
                      <span className="mr-1 font-semibold">{q.n}.</span>
                      {q.text}
                    </label>
                    {q.info ? null : (
                      <>
                        <textarea
                          id={`q${q.n}`}
                          rows={q.n === 2 || q.n === 27 ? 4 : 2}
                          maxLength={4000}
                          value={answers[key] ?? ''}
                          onChange={(e) => setAnswers((a) => ({ ...a, [key]: e.target.value }))}
                          onBlur={() => void save(q.n)}
                          className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-base text-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        />
                        <p className="h-4 text-xs text-gray-500" aria-live="polite">
                          {st === 'saving' ? 'Saving...' : st === 'saved' ? 'Saved' : st === 'error' ? "Not saved. Click out of the box to try again." : ''}
                        </p>
                      </>
                    )}
                    {q.n === 23 && (
                      <Uploader engagementId={engagementId} kind="logo" hasLogo={logo} onSaved={onSaved} apiBase={api} />
                    )}
                    {q.n === 24 && (
                      <>
                        <Uploader engagementId={engagementId} kind="photo" onSaved={onSaved} apiBase={api} />
                        {photos > 0 && <p className="text-sm text-gray-400">{photos} photo{photos === 1 ? '' : 's'} and videos on file so far. Thank you.</p>}
                      </>
                    )}
                  </div>
                )
              })}
          </section>
        ))}

        <footer className="space-y-3 border-t border-gray-800 pt-6">
          <p className="text-gray-300">No rush on all of it at once. When you&apos;re done for now, press Done so I know to take a look.</p>
          <button
            type="button"
            onClick={() => void finish()}
            disabled={done === 'sending'}
            className="min-h-[44px] rounded-lg bg-blue-600 px-5 font-medium text-white hover:bg-blue-500 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
          >
            {done === 'sending' ? 'Saving...' : 'Done'}
          </button>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <p className="text-sm text-gray-500">Thanks, looking forward to helping you out. Jacob</p>
        </footer>
      </div>
    </main>
  )
}
