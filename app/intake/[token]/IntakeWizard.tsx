'use client'

// The intake wizard (PORTAL_INTAKE_WIZARD), shared by the client portal
// (/onboarding/intake, apiBase /api/portal/intake) and the signed link
// (/intake/<token>, apiBase /api/intake/<token>). Answers save when a box loses
// focus (PATCH apiBase); the plan, legal details and the current step save to
// apiBase/wizard, so the client can close the page and come back where they
// left off. Files go through the admin intake page's own Uploader at apiBase.
// Done writes the Ops HQ "answers in" note and sends nothing.

import { useCallback, useState } from 'react'
import type { Intake } from '@/lib/ops/intake'
import type { Question } from '@/lib/ops/client-intake'
import { COPY, SERVICE_LABEL, questionsFor, type Plan, type Service, type StepKey, type WizardView } from '@/lib/ops/intake-wizard'
import { Uploader } from '@/app/admin/ops/intake/[engagementId]/Uploader'

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

const box = 'w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-base text-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500'
const primary = 'min-h-[44px] rounded-lg bg-blue-600 px-5 font-medium text-white hover:bg-blue-500 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300'
const secondary = 'min-h-[44px] rounded-lg border border-gray-700 px-5 text-gray-200 hover:bg-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300'
const SERVICES: Service[] = ['website', 'ads', 'gbp']

export function IntakeWizard({ apiBase, engagementId, initial, dashboardHref }: { apiBase: string; engagementId: string; initial: WizardView; dashboardHref?: string }) {
  const [view, setView] = useState<WizardView>(initial)
  const [answers, setAnswers] = useState<Record<string, string>>(initial.answers)
  const [saved, setSaved] = useState<Record<string, string>>(initial.answers)
  const [state, setState] = useState<Record<string, SaveState>>({})
  const [legal, setLegal] = useState(initial.legal)
  const [editPlan, setEditPlan] = useState<Plan>(initial.plan ?? { missedcall: false, website: false, ads: false, gbp: false })
  const [planOpen, setPlanOpen] = useState(!initial.plan || initial.planSource === 'client')
  const [files, setFiles] = useState(initial.files)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const wizard = useCallback(
    async (body: unknown) => {
      const res = await fetch(`${apiBase}/wizard`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(data.error ?? res.status))
      setView(data.view as WizardView)
      return data.view as WizardView
    },
    [apiBase]
  )

  const saveAnswer = useCallback(
    async (n: number) => {
      const key = String(n)
      const value = answers[key] ?? ''
      if ((saved[key] ?? '') === value) return
      setState((s) => ({ ...s, [key]: 'saving' }))
      try {
        const res = await fetch(apiBase, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers: { [key]: value } }) })
        if (!res.ok) throw new Error('save')
        setSaved((s) => ({ ...s, [key]: value }))
        setState((s) => ({ ...s, [key]: 'saved' }))
      } catch {
        setState((s) => ({ ...s, [key]: 'error' }))
      }
    },
    [answers, saved, apiBase]
  )

  async function savePending() {
    const pending = Object.fromEntries(Object.entries(answers).filter(([k, v]) => (saved[k] ?? '') !== v))
    if (!Object.keys(pending).length) return
    const res = await fetch(apiBase, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers: pending }) })
    if (!res.ok) throw new Error('save')
    setSaved((s) => ({ ...s, ...pending }))
  }

  async function go(step: StepKey, doneStep?: StepKey) {
    setBusy(true)
    setError('')
    try {
      await savePending()
      if (doneStep === 'legal') await wizard({ legal })
      await wizard({ step, ...(doneStep ? { done: doneStep } : {}) })
      window.scrollTo({ top: 0 })
    } catch {
      setError(COPY.doneError)
    } finally {
      setBusy(false)
    }
  }

  async function confirmPlan(useEdited: boolean) {
    setBusy(true)
    setError('')
    try {
      const v = useEdited ? await wizard({ plan: editPlan, confirm: true }) : await wizard({ confirm: true })
      const next = v.steps[1] ?? 'common'
      await wizard({ step: next, done: 'plan' })
      window.scrollTo({ top: 0 })
    } catch {
      setError(COPY.doneError)
    } finally {
      setBusy(false)
    }
  }

  async function finish() {
    setBusy(true)
    setError('')
    try {
      await savePending()
      await wizard({ step: view.step, done: view.step })
      const res = await fetch(`${apiBase}/finish`, { method: 'POST' })
      if (!res.ok) throw new Error('finish')
      setDone(true)
    } catch {
      setError(COPY.doneError)
    } finally {
      setBusy(false)
    }
  }

  const onSaved = useCallback((i: Intake) => {
    setFiles(((i.assets ?? []) as { filename: string; kind: string }[]).map((a) => ({ filename: a.filename, kind: a.kind })))
  }, [])

  const hey = view.firstName ? `Hey ${view.firstName},` : 'Hey,'
  const steps = view.steps
  const at = Math.max(0, steps.indexOf(view.step))
  const prev = steps[at - 1]
  const next = steps[at + 1]
  const last = !next

  if (done) {
    return (
      <Shell>
        <h1 className="text-2xl font-semibold">{COPY.thanksTitle}</h1>
        <p className="text-gray-300">{COPY.thanksBody}</p>
        <div className="flex flex-wrap gap-4">
          <button type="button" onClick={() => setDone(false)} className="text-sm text-blue-400 underline">
            {COPY.backToAnswers}
          </button>
          {dashboardHref && (
            <a href={dashboardHref} className="text-sm text-blue-400 underline">
              {COPY.toDashboard}
            </a>
          )}
        </div>
      </Shell>
    )
  }

  const question = (q: Question) => {
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
              onBlur={() => void saveAnswer(q.n)}
              className={box}
            />
            <p className="h-4 text-xs text-gray-500" aria-live="polite">
              {st === 'saving' ? COPY.saving : st === 'saved' ? COPY.saved : st === 'error' ? COPY.notSaved : ''}
            </p>
          </>
        )}
      </div>
    )
  }

  const bySection = (qs: Question[]) =>
    Array.from(new Set(qs.map((q) => q.section))).map((section) => (
      <section key={section} className="space-y-5">
        <h2 className="text-sm font-semibold tracking-wide text-gray-400">{section}</h2>
        {qs.filter((q) => q.section === section).map(question)}
      </section>
    ))

  const plan = view.plan
  let body: React.ReactNode = null
  if (view.step === 'plan') {
    const fromBoard = plan && view.planSource !== 'client' && !planOpen
    body = fromBoard ? (
      <div className="space-y-4">
        <p className="text-gray-300">{COPY.planBoard}</p>
        <ul className="list-disc space-y-1 pl-6 text-gray-100">
          {(Object.keys(SERVICE_LABEL) as Service[]).filter((s) => plan[s]).map((s) => (
            <li key={s}>{SERVICE_LABEL[s]}</li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-3">
          <button type="button" disabled={busy} onClick={() => void confirmPlan(false)} className={primary}>
            {COPY.planYes}
          </button>
          <button type="button" disabled={busy} onClick={() => setPlanOpen(true)} className={secondary}>
            {COPY.planNo}
          </button>
        </div>
      </div>
    ) : (
      <div className="space-y-6">
        <fieldset className="space-y-2">
          <legend className="text-gray-100">{COPY.planAskMissedCall}</legend>
          <div className="flex gap-3">
            {[true, false].map((v) => (
              <label key={String(v)} className={`${secondary} inline-flex cursor-pointer items-center gap-2 ${editPlan.missedcall === v ? 'border-blue-500' : ''}`}>
                <input type="radio" name="missedcall" checked={editPlan.missedcall === v} onChange={() => setEditPlan((p) => ({ ...p, missedcall: v }))} />
                {v ? COPY.yes : COPY.no}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="space-y-2">
          <legend className="text-gray-100">{COPY.planAskServices}</legend>
          {SERVICES.map((s) => (
            <label key={s} className="flex min-h-[44px] items-center gap-3 text-gray-100">
              <input type="checkbox" checked={editPlan[s]} onChange={(e) => setEditPlan((p) => ({ ...p, [s]: e.target.checked }))} />
              {SERVICE_LABEL[s]}
            </label>
          ))}
        </fieldset>
        <button type="button" disabled={busy} onClick={() => void confirmPlan(true)} className={primary}>
          {busy ? COPY.saving : COPY.next}
        </button>
      </div>
    )
  } else if (view.step === 'missedcall' || view.step === 'common') {
    body = <div className="space-y-8">{bySection(questionsFor(view.step, plan ?? undefined))}</div>
  } else if (view.step === 'legal') {
    const field = (k: 'legalName' | 'address' | 'zip', label: string, extra: Record<string, unknown> = {}) => (
      <div className="space-y-2">
        <label htmlFor={`legal-${k}`} className="block text-gray-100">
          {label}
        </label>
        <input
          id={`legal-${k}`}
          value={legal[k]}
          onChange={(e) => setLegal((l) => ({ ...l, [k]: e.target.value }))}
          onBlur={() => void wizard({ legal }).catch(() => setError(COPY.notSaved))}
          className={box}
          {...extra}
        />
      </div>
    )
    body = (
      <div className="space-y-5">
        <p className="text-gray-300">{COPY.legalIntro}</p>
        {field('legalName', COPY.legalName, { maxLength: 200, autoComplete: 'organization' })}
        {field('address', COPY.legalAddress, { maxLength: 300, autoComplete: 'street-address' })}
        {field('zip', COPY.legalZip, { maxLength: 10, inputMode: 'numeric', autoComplete: 'postal-code' })}
      </div>
    )
  } else if (view.step === 'files') {
    const qs = questionsFor('files', plan ?? undefined)
    const logo = files.some((f) => f.kind === 'logo')
    const photos = files.filter((f) => f.kind === 'photo' || f.kind === 'video').length
    body = (
      <div className="space-y-6">
        <p className="text-gray-300">{COPY.filesIntro}</p>
        {qs.find((q) => q.n === 23) && question(qs.find((q) => q.n === 23)!)}
        <Uploader engagementId={engagementId} kind="logo" hasLogo={logo} onSaved={onSaved} apiBase={apiBase} />
        {qs.find((q) => q.n === 24) && question(qs.find((q) => q.n === 24)!)}
        <Uploader engagementId={engagementId} kind="photo" onSaved={onSaved} apiBase={apiBase} />
        {photos > 0 && (
          <p className="text-sm text-gray-400">
            {photos} photo{photos === 1 ? '' : 's'} and videos on file so far. Thank you.
          </p>
        )}
      </div>
    )
  }
  // 'card' (STRIPE_CARD_AT_SIGNUP, piece 2) and 'adsbilling' (ADS_BILLING_INVITE, piece 3) are stubs: with their
  // flags off they are not in the step list; with them on they render nothing until those pieces land.

  return (
    <Shell>
      <header className="space-y-3">
        <h1 className="text-2xl font-semibold">Let&apos;s get {view.businessName || 'your business'} set up</h1>
        {view.step === 'plan' && <p className="text-gray-300">{hey} {COPY.intro}</p>}
        <p className="text-sm text-gray-400">{COPY.autosave}</p>
        <ol className="flex flex-wrap gap-2 text-xs text-gray-400" aria-label="Steps">
          {steps.map((s, i) => (
            <li key={s} className={`rounded-full border px-3 py-1 ${s === view.step ? 'border-blue-500 text-gray-100' : 'border-gray-800'}`} aria-current={s === view.step ? 'step' : undefined}>
              {i + 1}. {COPY.stepTitle[s]}
            </li>
          ))}
        </ol>
        <h2 className="pt-2 text-xl font-semibold">{COPY.stepTitle[view.step]}</h2>
      </header>

      {body}

      {view.step !== 'plan' && (
        <footer className="flex flex-wrap items-center gap-3 border-t border-gray-800 pt-6">
          {prev && (
            <button type="button" disabled={busy} onClick={() => void go(prev)} className={secondary}>
              {COPY.back}
            </button>
          )}
          {last ? (
            <button type="button" disabled={busy} onClick={() => void finish()} className={primary}>
              {busy ? COPY.saving : COPY.done}
            </button>
          ) : (
            <button type="button" disabled={busy} onClick={() => void go(next, view.step)} className={primary}>
              {busy ? COPY.saving : COPY.next}
            </button>
          )}
        </footer>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
      <p className="text-sm text-gray-500">{COPY.signoff}</p>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-gray-950 px-4 py-10 text-gray-100">
      <div className="mx-auto max-w-2xl space-y-8">
        <p className="text-sm text-gray-400">Jacob, Align and Acquire</p>
        {children}
      </div>
    </main>
  )
}
