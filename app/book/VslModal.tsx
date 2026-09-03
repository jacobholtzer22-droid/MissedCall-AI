'use client'

import { useEffect, useRef, useState } from 'react'
import { GATE_TRADES, isTerminalTrade, formatPhoneInput } from './constants'
import { validateUsMobile } from '@/lib/phone-utils'

// One modal, two steps, plus a dead end for people who tell us they are not a
// fit. White inside, like the page behind it.
//
// Nothing is written until the code verifies. The form submit only asks for a
// code — no lead, no Lead event, no SMS.

const ACCENT = '#EE6B1A'

type Field = 'trade' | 'firstName' | 'phone' | 'email'

const LABELS: Record<Field, string> = {
  trade: 'What do you do?',
  firstName: 'First name',
  phone: 'Cell number',
  email: 'Email',
}

const inputCls =
  'w-full rounded-lg border border-neutral-300 px-4 py-3.5 text-[16px] text-neutral-900 outline-none focus:border-neutral-900'

function validate(field: Field, v: string): string {
  const t = v.trim()
  switch (field) {
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
  }
}

export default function VslModal({
  open,
  onClose,
  onVerified,
}: {
  open: boolean
  onClose: () => void
  /** Fired with the watch URL the server issued. */
  onVerified: (payload: { watchUrl: string; trade: string; eventId: string; qualified: boolean }) => void
}) {
  const [step, setStep] = useState<'form' | 'otp' | 'not_a_fit'>('form')
  const [form, setForm] = useState<Record<Field, string>>({ trade: '', firstName: '', phone: '', email: '' })
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({})
  const [banner, setBanner] = useState('')
  const [busy, setBusy] = useState(false)
  const [code, setCode] = useState('')
  const [resends, setResends] = useState(0)
  const [honeypot, setHoneypot] = useState('')

  const otpRef = useRef<HTMLInputElement>(null)
  const mountedAt = useRef(Date.now())
  // Minted once. The server reuses it for the CAPI half so Meta dedupes the pair.
  const eventIdRef = useRef(
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `lead-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  )
  const submittedRef = useRef(false)

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  useEffect(() => {
    if (step === 'otp') setTimeout(() => otpRef.current?.focus(), 120)
  }, [step])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  async function requestCode() {
    const next: Partial<Record<Field, string>> = {}
    ;(Object.keys(form) as Field[]).forEach((f) => {
      const problem = validate(f, form[f])
      if (problem) next[f] = problem
    })
    setErrors(next)
    if (Object.keys(next).length) return

    // Homeowners and browsers stop here: no code, no lead, no Lead event.
    if (isTerminalTrade(form.trade)) {
      void fetch('/api/funnel-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'gate_exit_not_a_fit', step: 'trade', metadata: { answer: form.trade } }),
        keepalive: true,
      }).catch(() => {})
      setStep('not_a_fit')
      return
    }

    setBusy(true)
    setBanner('')
    try {
      const res = await fetch('/api/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: form.phone,
          hp_ref: honeypot,
          formElapsedMs: Date.now() - mountedAt.current,
        }),
      })
      const json = await res.json().catch(() => ({}))
      // A 200 with no verificationId is the bot branch. Treated as a hard
      // failure so nobody is walked through a flow that saves nothing.
      if (!res.ok || !json?.verificationId) {
        setBanner(json?.error || 'Something went wrong on our end. Please try that again.')
        return
      }
      setStep('otp')
    } catch {
      setBanner('Could not send a code. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function verify(value: string) {
    const clean = value.replace(/\D/g, '')
    if (clean.length !== 6 || submittedRef.current) return
    submittedRef.current = true
    setBusy(true)
    setBanner('')
    try {
      const res = await fetch('/api/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: form.phone, code: clean }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json?.verificationId) {
        setBanner(json?.error || 'That code is not right.')
        setCode('')
        submittedRef.current = false
        return
      }

      // Verified. THIS is where the lead is created and Lead fires.
      const save = await fetch('/api/demo-lead/wizard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stage: 'phone',
          verificationId: json.verificationId,
          eventId: eventIdRef.current,
          trade: form.trade,
          firstName: form.firstName,
          email: form.email,
          phone: form.phone,
          landingPath: window.location.pathname + window.location.search,
          hp_ref: honeypot,
        }),
      })
      const saved = await save.json().catch(() => ({}))
      if (!save.ok || !saved?.leadId) {
        setBanner(saved?.error || 'Could not save that. Try again.')
        submittedRef.current = false
        return
      }
      onVerified({
        watchUrl: saved.watchUrl || '/book',
        trade: form.trade,
        eventId: eventIdRef.current,
        qualified: Boolean(saved.qualified),
      })
    } catch {
      setBanner('Could not check that code. Try again.')
      submittedRef.current = false
    } finally {
      setBusy(false)
    }
  }

  async function resend() {
    if (resends >= 2 || busy) return
    setBusy(true)
    setBanner('')
    try {
      const res = await fetch('/api/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: form.phone }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) setBanner(json?.error || 'Could not send another code.')
      else {
        setResends((n) => n + 1)
        setCode('')
        submittedRef.current = false
        otpRef.current?.focus()
      }
    } finally {
      setBusy(false)
    }
  }

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
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 -mt-2 grid h-11 w-11 place-items-center text-neutral-400"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {step === 'not_a_fit' ? (
          <p className="pb-6 text-[16px] leading-[1.6] text-neutral-800">
            Thanks. This is built for business owners, so it won&apos;t be a fit.
          </p>
        ) : step === 'form' ? (
          <>
            <h2 className="mb-5 text-[22px] font-extrabold tracking-tight text-neutral-900">Watch the Demo</h2>

            {/* Honeypot. Off-screen and hidden from screen readers; named so no
                autofill heuristic recognises it. */}
            <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
              <label htmlFor="hp_ref_vsl">Leave this empty</label>
              <input id="hp_ref_vsl" name="hp_ref" type="text" tabIndex={-1} autoComplete="off"
                value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                void requestCode()
              }}
              className="space-y-4"
            >
              {(['trade', 'firstName', 'phone', 'email'] as Field[]).map((field) => (
                <div key={field}>
                  <label htmlFor={`vsl-${field}`} className="mb-1.5 block text-[13px] font-semibold text-neutral-700">
                    {LABELS[field]}
                  </label>
                  {field === 'trade' ? (
                    <select
                      id="vsl-trade"
                      value={form.trade}
                      onChange={(e) => {
                        setForm((f) => ({ ...f, trade: e.target.value }))
                        setErrors((x) => ({ ...x, trade: '' }))
                      }}
                      className={`${inputCls} appearance-none bg-white`}
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
                      id={`vsl-${field}`}
                      value={form[field]}
                      onChange={(e) => {
                        const raw = e.target.value
                        setForm((f) => ({ ...f, [field]: field === 'phone' ? formatPhoneInput(raw) : raw }))
                        setErrors((x) => ({ ...x, [field]: '' }))
                      }}
                      type={field === 'phone' ? 'tel' : field === 'email' ? 'email' : 'text'}
                      inputMode={field === 'phone' ? 'tel' : field === 'email' ? 'email' : 'text'}
                      autoComplete={field === 'phone' ? 'tel' : field === 'email' ? 'email' : 'given-name'}
                      className={inputCls}
                      style={errors[field] ? { borderColor: ACCENT } : undefined}
                    />
                  )}
                  {errors[field] && (
                    <p className="mt-1.5 text-[13px] font-medium" style={{ color: ACCENT }}>
                      {errors[field]}
                    </p>
                  )}
                </div>
              ))}

              {banner && (
                <p className="text-[13px] font-medium" style={{ color: ACCENT }}>
                  {banner}
                </p>
              )}

              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-lg py-4 text-[16px] font-bold text-white disabled:opacity-50"
                style={{ background: ACCENT }}
              >
                {busy ? 'One sec…' : 'Watch the Demo'}
              </button>
            </form>
            <p className="mt-3 text-[13px] leading-[1.5] text-neutral-500">
              I&apos;ll text you a code so I know you&apos;re a real person.
            </p>
          </>
        ) : (
          <>
            <h2 className="mb-5 text-[22px] font-extrabold tracking-tight text-neutral-900">
              Enter the code I just texted you
            </h2>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void verify(code)
              }}
            >
              <input
                ref={otpRef}
                value={code}
                onChange={(e) => {
                  const next = e.target.value.replace(/\D/g, '').slice(0, 6)
                  setCode(next)
                  setBanner('')
                  // iOS drops all six at once; submitting on a complete code is
                  // what makes autofill feel instant.
                  if (next.length === 6) void verify(next)
                }}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                aria-label="6-digit verification code"
                className={`${inputCls} text-center text-[24px] font-bold tracking-[0.4em]`}
              />
              {banner && (
                <p className="mt-2 text-[13px] font-medium" style={{ color: ACCENT }}>
                  {banner}
                </p>
              )}
              <button
                type="submit"
                disabled={busy}
                className="mt-4 w-full rounded-lg py-4 text-[16px] font-bold text-white disabled:opacity-50"
                style={{ background: ACCENT }}
              >
                {busy ? 'One sec…' : 'Unlock the Demo'}
              </button>
            </form>
            <button
              type="button"
              onClick={() => void resend()}
              disabled={busy || resends >= 2}
              className="mt-3 text-[14px] font-semibold underline underline-offset-4 disabled:opacity-40"
              style={{ color: ACCENT }}
            >
              Resend code
            </button>
          </>
        )}
      </div>
    </div>
  )
}
