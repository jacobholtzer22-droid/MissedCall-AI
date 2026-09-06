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
/**
 * Thrown by sendCode when the send did not fail so much as end differently:
 * the number cannot receive a text, or the resend cap is spent. Both need the
 * recovery UI rather than a red message, so they are distinguishable from a
 * genuine error by type instead of by string matching.
 */
class NotRoutableOrCapped extends Error {
  constructor(public readonly kind: 'not_routable' | 'resend_cap', message?: string) {
    super(message || 'That number cannot receive texts.')
    this.name = 'NotRoutableOrCapped'
  }
}

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
  // Recovery state for a number that cannot receive a text. verificationId is
  // what /api/otp/call needs; notRoutable puts the phone screen into its
  // "landline" shape rather than showing a red error and stopping.
  const [verificationId, setVerificationId] = useState<string | null>(null)
  const [notRoutable, setNotRoutable] = useState(false)
  const [lockedOut, setLockedOut] = useState(false)
  const [calling, setCalling] = useState(false)
  const [calledOk, setCalledOk] = useState(false)
  /** Terminal, friendly ending. Set once a needs_call lead has been written. */
  const [rescued, setRescued] = useState(false)
  const rescueSent = useRef(false)

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
      if (e.key === 'Escape') closeWizard()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- closeWizard is
  // redefined every render; depending on it would rebind the listener each time.
  }, [open, onClose, notRoutable, lockedOut, verified])

  // Starts at 50%; each completed screen adds an equal share of the rest, and
  // verification lands it on 100.
  const pct = verified ? 100 : Math.round(50 + (index / STEPS.length) * 50)

  /**
   * Every dead end lands here: the lead is written as needs_call, Jacob is
   * texted and emailed, and the visitor is told they will get a call instead of
   * being left on an error. Fires at most once per session.
   */
  const rescue = useCallback(
    async (reason: 'not_routable' | 'lockout' | 'expired' | 'resend_cap' | 'call_failed', d: Draft) => {
      if (rescueSent.current) return
      rescueSent.current = true
      try {
        await fetch('/api/gate-failed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reason,
            phone: d.phone,
            firstName: d.firstName,
            trade: d.trade,
            email: d.email,
          }),
          keepalive: true,
        })
      } catch {
        // The screen still says someone will call. Jacob may not know, which is
        // why the server logs this path loudly on its side.
      }
      setRescued(true)
    },
    []
  )

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
        // The resend cap is a dead end, not a bug: rescue rather than scold.
        if (res.status === 429) throw new NotRoutableOrCapped('resend_cap', json?.error)
        throw new Error(json?.error || 'Something went wrong on our end. Please try that again.')
      }
      // The number cannot receive a text. Not an error — a different route.
      if (json.notRoutable) {
        setVerificationId(json.verificationId as string)
        throw new NotRoutableOrCapped('not_routable', json?.error)
      }
      setVerificationId(json.verificationId as string)
    },
    [honeypot]
  )

  /**
   * "Call me with the code." Places a Telnyx voice call that reads a fresh code
   * out twice. Verification is unchanged afterwards — same box, same endpoint,
   * same row; only the delivery channel differs.
   */
  /**
   * Closing while stuck is the silent disappearance this whole change exists to
   * stop: they gave a trade, a name, a number and an email, and the code could
   * never arrive. Write the lead on the way out.
   */
  function closeWizard() {
    if ((notRoutable || lockedOut) && !verified && !rescueSent.current) {
      void rescue(lockedOut ? 'lockout' : 'not_routable', draft)
      return // keep the modal up so they see that someone will call
    }
    onClose()
  }

  async function callWithCode() {
    if (!verificationId || calling) return
    setCalling(true)
    setError('')
    try {
      const res = await fetch('/api/otp/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verificationId }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json?.ok) {
        // The call could not even be placed: that is a dead end, so rescue.
        await rescue('call_failed', draft)
        return
      }
      setCalledOk(true)
      setNotRoutable(false)
      setLockedOut(false)
      setCode('')
      submittedRef.current = false
      setIndex(STEPS.indexOf('otp'))
    } catch {
      await rescue('call_failed', draft)
    } finally {
      setCalling(false)
    }
  }

  async function advance(raw: string) {
    const value = step === 'phone' ? raw : raw.trim()
    const problem = validate(step, value)
    if (problem) return setError(problem)
    setError('')
    // Moving on from the phone screen with a different number retires the
    // landline offer; the new number gets checked on its own merits.
    if (step === 'phone' && value !== draft.phone) {
      setNotRoutable(false)
      setVerificationId(null)
    }

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

    // Persist what they have typed so far. Fire and forget: if this never
    // arrives the wizard carries on exactly as before, and if it does, a dead
    // end at the code step still has all four answers.
    void fetch('/api/gate-draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        step,
        trade: next.trade,
        firstName: next.firstName,
        phone: next.phone,
        email: next.email,
        landingPath: typeof window !== 'undefined' ? window.location.pathname + window.location.search : undefined,
      }),
      keepalive: true,
    }).catch(() => {})

    // The email screen is the last before the code, so the text goes out here.
    if (step === 'email') {
      setBusy(true)
      try {
        await sendCode(next.phone)
      } catch (err) {
        setBusy(false)
        if (err instanceof NotRoutableOrCapped) {
          if (err.kind === 'resend_cap') {
            // Nothing left to send. Straight to the rescue.
            void rescue('resend_cap', next)
            return
          }
          // Back to the phone screen, which is where a wrong number gets fixed
          // and where the offer to phone them belongs.
          setNotRoutable(true)
          setIndex(STEPS.indexOf('phone'))
          setError("That number can't receive texts. Enter a cell number, or tap Call me with the code.")
          return
        }
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
        // Out of tries, or the code died of old age. Offer the phone call
        // before giving up on someone who has already given us everything.
        if (json?.code === 'too_many_attempts' || json?.code === 'expired') {
          if (verificationId) setLockedOut(true)
          else await rescue(json.code === 'expired' ? 'expired' : 'lockout', draft)
        }
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
      onClick={closeWizard}
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
            onClick={closeWizard}
            aria-label="Close"
            className="-mr-2 grid h-11 w-11 place-items-center text-neutral-400"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {rescued ? (
          <div className="pb-6">
            <h2 className="mb-3 text-[21px] font-extrabold leading-[1.25]" style={{ color: 'var(--funnel-ink)' }}>
              I&apos;ll call you shortly.
            </h2>
            <p className="text-[16px] leading-[1.6] text-neutral-800">
              That code couldn&apos;t reach you, so I&apos;ve got your details and I&apos;ll ring you myself.
              Nothing else to do.
            </p>
          </div>
        ) : exited ? (
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

            {/* Landline recovery. Lives on the phone screen because that is
                where the wrong number is, and offers the two ways out the
                visitor actually has: a different number, or a phone call. */}
            {step === 'phone' && notRoutable && (
              <div className="mt-4 rounded-lg border p-3" style={{ borderColor: 'var(--funnel-border)' }}>
                <p className="mb-3 text-[14px] leading-[1.55] text-neutral-700">
                  Edit the number above to use a cell, or I can read the code out to you.
                </p>
                <button
                  type="button"
                  onClick={() => void callWithCode()}
                  disabled={calling || !verificationId}
                  className="min-h-[48px] w-full rounded-lg py-3 text-[16px] font-bold text-white disabled:opacity-50"
                  style={{ background: 'var(--funnel-banner)' }}
                >
                  {calling ? 'Calling you…' : 'Call me with the code'}
                </button>
              </div>
            )}

            {/* Out of tries. Same offer, before anyone is written off. */}
            {step === 'otp' && lockedOut && (
              <div className="mt-4 rounded-lg border p-3" style={{ borderColor: 'var(--funnel-border)' }}>
                <p className="mb-3 text-[14px] leading-[1.55] text-neutral-700">
                  Let me read the code out to you instead.
                </p>
                <button
                  type="button"
                  onClick={() => void callWithCode()}
                  disabled={calling || !verificationId}
                  className="min-h-[48px] w-full rounded-lg py-3 text-[16px] font-bold text-white disabled:opacity-50"
                  style={{ background: 'var(--funnel-banner)' }}
                >
                  {calling ? 'Calling you…' : 'Call me with the code'}
                </button>
                <button
                  type="button"
                  onClick={() => void rescue('lockout', draft)}
                  className="mt-2 min-h-[44px] w-full text-[14px] font-semibold text-neutral-500 underline underline-offset-4"
                >
                  Just have Jacob call me
                </button>
              </div>
            )}

            {step === 'otp' && calledOk && (
              <p className="mt-3 text-[14px] leading-[1.55] text-neutral-700">
                Calling you now — the code is read out twice. Enter it above.
              </p>
            )}

            {step === 'otp' && !lockedOut && (
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
