'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import FunnelProgressBar from './FunnelProgressBar'
import { FunnelButton } from './FunnelCard'
import { GATE_TRADES, isTerminalTrade, formatPhoneInput } from './constants'
import { validateUsMobile } from '@/lib/phone-utils'

// One question per screen, recovered from the pre-rebuild gate and trimmed to
// exactly the five screens this funnel asks for. Nothing is written until the
// code verifies: the earlier screens only fill state.

type StepKey = 'trade' | 'firstName' | 'phone' | 'email' | 'otp'
const STEPS: StepKey[] = ['trade', 'firstName', 'phone', 'email', 'otp']

const COPY: Record<StepKey, { headline: string; hint?: string }> = {
  trade: { headline: 'What do you do?' },
  firstName: { headline: 'What is your first name?' },
  phone: {
    headline: 'What is your cell number?',
    // Consent notice. Must stay: it is what makes the lead SMS a consented send.
    hint: "I'll text you a code so I know you're a real person.",
  },
  email: { headline: 'What is your email?' },
  otp: { headline: 'Enter the code I just texted you' },
}

type Draft = Record<Exclude<StepKey, 'otp'>, string>
const EMPTY: Draft = { trade: '', firstName: '', phone: '', email: '' }

const inputCls =
  'w-full rounded-lg border px-4 py-4 text-[17px] outline-none focus:border-neutral-900'

function validate(step: StepKey, v: string): string {
  const t = v.trim()
  switch (step) {
    case 'trade':
      return t ? '' : 'Pick the one that fits best.'
    case 'firstName':
      return t.length >= 2 ? '' : 'Please enter your first name.'
    case 'phone': {
      const check = validateUsMobile(t)
      return check.ok ? '' : check.reason
    }
    case 'email':
      return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(t) ? '' : 'That does not look like an email address.'
    case 'otp':
      return ''
  }
}

export default function WizardModal({
  open,
  onClose,
  onVerified,
}: {
  open: boolean
  onClose: () => void
  onVerified: (p: { watchUrl: string; trade: string; eventId: string; qualified: boolean }) => void
}) {
  const [index, setIndex] = useState(0)
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [exited, setExited] = useState(false)
  const [verified, setVerified] = useState(false)
  const [resends, setResends] = useState(0)
  const [honeypot, setHoneypot] = useState('')

  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null)
  const mountedAt = useRef(Date.now())
  const submittedRef = useRef(false)
  // Minted once per session; the server reuses it for CAPI so Meta dedupes.
  const eventIdRef = useRef(
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `lead-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  )

  const step = STEPS[index]

  /**
   * Fire-and-forget step logging. The arm and the visitor id are read from
   * cookies server-side, so nothing identifying is sent from here.
   */
  const logStep = useCallback((name: string, step?: string, metadata?: object) => {
    void fetch('/api/funnel-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, step, metadata }),
      keepalive: true,
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  useEffect(() => {
    if (!open || exited) return
    const t = setTimeout(() => inputRef.current?.focus(), 130)
    return () => clearTimeout(t)
  }, [open, index, exited])

  // Modal opens. The denominator for every screen below it: landing views that
  // never became an open are a headline problem, not a wizard problem.
  useEffect(() => {
    if (!open) return
    logStep('gate_opened', 'trade')
  }, [open, logStep])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Starts at 50%; each completed screen adds an equal share of the rest, and
  // verification lands it on 100.
  const pct = verified ? 100 : Math.round(50 + (index / STEPS.length) * 50)

  const sendCode = useCallback(
    async (phone: string) => {
      const res = await fetch('/api/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          hp_ref: honeypot,
          formElapsedMs: Date.now() - mountedAt.current,
        }),
      })
      const json = await res.json().catch(() => ({}))
      // A 200 with no verificationId is the bot branch. Hard failure, never a
      // silent pass.
      if (!res.ok || !json?.verificationId) {
        throw new Error(json?.error || 'Something went wrong on our end. Please try that again.')
      }
    },
    [honeypot]
  )

  async function advance(raw: string) {
    const value = step === 'phone' ? raw : raw.trim()
    const problem = validate(step, value)
    if (problem) return setError(problem)
    setError('')

    const next = { ...draft, [step]: value } as Draft
    setDraft(next)

    // Homeowners and browsers stop here: no OTP, no lead, no Lead event.
    if (step === 'trade' && isTerminalTrade(value)) {
      // The answer is logged so homeowner and just-looking can be separated in
      // the step table; it is a fixed menu choice, not typed input.
      logStep('gate_exit_not_a_fit', 'trade', { answer: value })
      setExited(true)
      return
    }

    // Screen cleared. Logged AFTER validation and after the disqualifying exit
    // above, so the count means "answered this screen and moved on" rather than
    // "typed something into it".
    logStep('gate_step_completed', step)

    // The email screen is the last before the code, so the text goes out here.
    if (step === 'email') {
      setBusy(true)
      try {
        await sendCode(next.phone)
      } catch (err) {
        setBusy(false)
        return setError(err instanceof Error ? err.message : 'Could not send a code.')
      }
      setBusy(false)
    }

    setIndex((i) => Math.min(i + 1, STEPS.length - 1))
  }

  async function verify(value: string) {
    const clean = value.replace(/\D/g, '')
    if (clean.length !== 6 || submittedRef.current) return
    submittedRef.current = true
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: draft.phone, code: clean }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json?.verificationId) {
        setError(json?.error || 'That code is not right.')
        setCode('')
        submittedRef.current = false
        return
      }

      // Verified. Lead, Lead event, SMS and owner email all hang off this.
      const save = await fetch('/api/demo-lead/wizard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stage: 'phone',
          verificationId: json.verificationId,
          eventId: eventIdRef.current,
          trade: draft.trade,
          firstName: draft.firstName,
          email: draft.email,
          phone: draft.phone,
          landingPath: window.location.pathname + window.location.search,
          hp_ref: honeypot,
        }),
      })
      const saved = await save.json().catch(() => ({}))
      if (!save.ok || !saved?.leadId) {
        setError(saved?.error || 'Could not save that. Try again.')
        submittedRef.current = false
        return
      }
      setVerified(true)
      // A beat so the bar is actually SEEN at 100 before the redirect. Without
      // it the state lands and the route changes in the same frame, so the
      // finish the whole bar was building toward never renders.
      await new Promise((r) => setTimeout(r, 650))
      onVerified({
        watchUrl: saved.watchUrl || '/book',
        trade: draft.trade,
        eventId: eventIdRef.current,
        qualified: Boolean(saved.qualified),
      })
    } catch {
      setError('Could not check that code. Try again.')
      submittedRef.current = false
    } finally {
      setBusy(false)
    }
  }

  async function resend() {
    if (resends >= 2 || busy) return
    setBusy(true)
    setError('')
    try {
      await sendCode(draft.phone)
      setResends((n) => n + 1)
      setCode('')
      submittedRef.current = false
      inputRef.current?.focus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send another code.')
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  const value = step === 'otp' ? code : draft[step as Exclude<StepKey, 'otp'>]

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Watch the demo"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-white p-6 sm:max-w-[440px] sm:rounded-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          {index > 0 && !exited && !verified ? (
            <button
              type="button"
              onClick={() => {
                setError('')
                setIndex((i) => Math.max(0, i - 1))
              }}
              className="-ml-1 min-h-[44px] text-[14px] font-semibold text-neutral-500"
            >
              ← Back
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 grid h-11 w-11 place-items-center text-neutral-400"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {exited ? (
          <p className="pb-6 text-[16px] leading-[1.6] text-neutral-800">
            Thanks. This is built for business owners, so it won&apos;t be a fit.
          </p>
        ) : (
          <>
            <FunnelProgressBar pct={pct} label={`${pct}% of the way to the demo`} />

            {/* Honeypot. Off-screen, hidden from screen readers, named so no
                autofill heuristic recognises it. */}
            <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
              <label htmlFor="hp_ref_wz">Leave this empty</label>
              <input id="hp_ref_wz" name="hp_ref" type="text" tabIndex={-1} autoComplete="off"
                value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
            </div>

            <h2 className="mb-5 text-[21px] font-extrabold leading-[1.25] tracking-tight" style={{ color: 'var(--funnel-ink)' }}>
              {COPY[step].headline}
            </h2>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (step === 'otp') void verify(code)
                else void advance(value)
              }}
            >
              {step === 'trade' ? (
                <select
                  ref={inputRef as React.RefObject<HTMLSelectElement>}
                  value={draft.trade}
                  onChange={(e) => {
                    setDraft((d) => ({ ...d, trade: e.target.value }))
                    setError('')
                  }}
                  aria-label="What do you do?"
                  className={`${inputCls} appearance-none bg-white`}
                  style={{ borderColor: error ? 'var(--funnel-banner)' : 'var(--funnel-border)' }}
                >
                  <option value="" disabled>
                    Select one
                  </option>
                  {GATE_TRADES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  ref={inputRef as React.RefObject<HTMLInputElement>}
                  value={value}
                  onChange={(e) => {
                    const raw = e.target.value
                    if (step === 'otp') {
                      const next = raw.replace(/\D/g, '').slice(0, 6)
                      setCode(next)
                      setError('')
                      // iOS drops all six at once; submitting on a complete code
                      // is what makes autofill feel instant.
                      if (next.length === 6) void verify(next)
                      return
                    }
                    setDraft((d) => ({ ...d, [step]: step === 'phone' ? formatPhoneInput(raw) : raw }))
                    setError('')
                  }}
                  type={step === 'phone' ? 'tel' : step === 'email' ? 'email' : 'text'}
                  inputMode={step === 'phone' ? 'tel' : step === 'email' ? 'email' : step === 'otp' ? 'numeric' : 'text'}
                  autoComplete={
                    step === 'phone' ? 'tel'
                    : step === 'email' ? 'email'
                    : step === 'firstName' ? 'given-name'
                    : 'one-time-code'
                  }
                  maxLength={step === 'otp' ? 6 : undefined}
                  enterKeyHint={step === 'otp' ? 'done' : 'next'}
                  aria-label={COPY[step].headline}
                  className={`${inputCls} ${step === 'otp' ? 'text-center text-[24px] font-bold tracking-[0.4em]' : ''}`}
                  style={{ borderColor: error ? 'var(--funnel-banner)' : 'var(--funnel-border)' }}
                />
              )}

              {COPY[step].hint && (
                <p className="mt-2.5 text-[13px] leading-[1.5] text-neutral-500">{COPY[step].hint}</p>
              )}
              {error && (
                <p className="mt-2.5 text-[13px] font-medium" style={{ color: 'var(--funnel-banner)' }}>
                  {error}
                </p>
              )}

              <div className="mt-5">
                <FunnelButton type="submit" disabled={busy}>
                  {busy ? 'One sec…' : step === 'otp' ? 'Unlock the Demo' : 'Next'}
                </FunnelButton>
              </div>
            </form>

            {step === 'otp' && (
              <button
                type="button"
                onClick={() => void resend()}
                disabled={busy || resends >= 2}
                className="mt-3 text-[14px] font-semibold underline underline-offset-4 disabled:opacity-40"
                style={{ color: 'var(--funnel-banner)' }}
              >
                Resend code
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
