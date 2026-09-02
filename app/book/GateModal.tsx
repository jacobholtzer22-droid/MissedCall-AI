'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { X, ArrowLeft, Loader2 } from 'lucide-react'
import { validateUsMobile } from '@/lib/phone-utils'
import ProgressBar from './ProgressBar'
import {
  GATE_TRADES, NOT_AN_OWNER, isTerminalTrade,
  formatPhoneInput, SEND_SMS_AT, GATE_DRAFT_KEY,
} from './constants'
import OtpScreen from './OtpScreen'

// ─────────────────────────────────────────────────────────
// One question per screen.
//
// The lead is BANKED as soon as the number is VERIFIED, not at the end:
// someone who verifies and then abandons on "last name" is still a callable
// lead, and the owner hears about them in seconds. Later screens enrich the
// same row.
//
// Verification sits between the phone screen and the bank on purpose. The bank
// fires the instant lead SMS and the "call now" owner email, so writing a lead
// for an unverified number would text a stranger and send Jacob to call them.
//
// Answers persist in sessionStorage so a refresh or an accidental back swipe
// does not cost the visitor their progress.
// ─────────────────────────────────────────────────────────

export type GateResult = {
  leadId: string
  name: string
  phone: string
  trade: string
  /** Passed on so the booking wizard never asks for it a second time. */
  company: string
  /** Always '' now: the gate no longer asks. The booking wizard asks instead. */
  email: string
  qualified: boolean
}

type StepKey = 'trade' | 'firstName' | 'company' | 'phone' | 'otp'

// Identity BEFORE the number, and the number last.
//
// The old order asked for the phone second, which meant the lead was banked
// against a row whose only identity was the number itself. Asking who they are
// first costs nothing (they are already committed by then) and means the lead
// is created complete: real name, real business, verified number, in one write.
//
// Last name and email are no longer asked here. The booking wizard already
// asks for an email when the prefill lacks one, so nothing downstream breaks.
const STEPS: StepKey[] = ['trade', 'firstName', 'company', 'phone', 'otp']

const COPY: Record<StepKey, { headline: string; hint?: string }> = {
  trade: { headline: 'What do you do?' },
  firstName: { headline: 'What is your first name?' },
  company: { headline: 'What is your company called?' },
  phone: {
    headline: 'Enter your number to unlock the demo',
    // Consent notice. Must stay above the input and must keep the STOP line:
    // this is what makes the lead-facing SMS a consented send.
    hint: "You'll get a quick text from Jacob. Reply STOP any time.",
  },
  // Rendered by OtpScreen, which owns its own copy. Present so the record is
  // exhaustive over StepKey.
  otp: { headline: 'Check your texts' },
}

const border = 'rgba(110,118,129,0.35)'
const inputCls =
  'w-full px-4 py-4 border-2 text-[17px] font-medium outline-none bg-transparent focus:border-[#EE6B1A]'
const inputStyle = { borderColor: border, color: '#F2F0EB' }

type Draft = Record<StepKey, string>
const EMPTY_DRAFT: Draft = { trade: '', firstName: '', company: '', phone: '', otp: '' }

function validate(step: StepKey, value: string): string {
  const v = value.trim()
  switch (step) {
    case 'trade':
      return v ? '' : 'Pick the one that fits best.'
    case 'phone': {
      const check = validateUsMobile(v)
      return check.ok ? '' : check.reason
    }
    case 'otp':
      // OtpScreen validates and submits its own code.
      return ''
    case 'firstName':
      return v.length >= 2 ? '' : 'Please enter your first name.'
    case 'company':
      return v.length >= 2 ? '' : 'Please enter your company name.'
  }
}

export default function GateModal({
  open,
  attribution,
  funnelVariant,
  onClose,
  onLeadBanked,
  onComplete,
  onStepCompleted,
}: {
  open: boolean
  attribution: Record<string, string>
  funnelVariant: string
  onClose: () => void
  /**
   * Fired once, at OTP success, when the lead is banked. The parent fires the
   * pixel — with the SAME eventId the server just used for CAPI, which is what
   * makes Meta count one conversion instead of two.
   */
  onLeadBanked: (payload: {
    qualified: boolean
    eventId: string
    trade: string
    businessName: string
  }) => void
  onComplete: (result: GateResult) => void
  onStepCompleted: (step: string) => void
}) {
  const [index, setIndex] = useState(0)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [unlocked, setUnlocked] = useState(false)
  const [honeypot, setHoneypot] = useState('')
  const leadIdRef = useRef('')
  const bankedRef = useRef(false)
  // Minted once per gate session. The pixel fires with it and the server sends
  // it to CAPI, which is the only reason Meta counts one conversion instead of
  // two. crypto.randomUUID is available in every browser that can run this app;
  // the fallback exists for older Safari rather than as a real code path.
  const eventIdRef = useRef<string>(
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `lead-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  )
  const [exited, setExited] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const step = STEPS[index]

  // ── Restore any in-progress answers ────────────────────────────────────────
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(GATE_DRAFT_KEY)
      if (!raw) return
      const saved = JSON.parse(raw) as Partial<Draft> & { _index?: number; _leadId?: string }
      setDraft((d) => ({ ...d, ...saved }))
      if (saved._leadId) {
        leadIdRef.current = saved._leadId
        bankedRef.current = true
      }
      if (typeof saved._index === 'number' && saved._index > 0 && saved._index < STEPS.length) {
        // Never restore onto the OTP screen unless the lead was already banked:
        // no code is in flight after a refresh, so the visitor would be staring
        // at an input for a text that is never coming. Send them back to the
        // phone screen, which re-sends on submit.
        const restored = STEPS[saved._index] === 'otp' && !saved._leadId ? 1 : saved._index
        setIndex(restored)
      }
    } catch {
      /* a corrupt draft must never block the gate */
    }
  }, [])

  const persist = useCallback((next: Draft, nextIndex: number) => {
    try {
      sessionStorage.setItem(
        GATE_DRAFT_KEY,
        JSON.stringify({ ...next, _index: nextIndex, _leadId: leadIdRef.current })
      )
    } catch {
      /* private mode, quota, whatever. Progress is a nice-to-have. */
    }
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
    if (!open || step === 'trade') return
    const t = setTimeout(() => inputRef.current?.focus(), 120)
    return () => clearTimeout(t)
  }, [open, step, index])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Starts at 50%, each screen adds an equal share of the remaining 50%, and the
  // final screen sits at 100%.
  const pct = useMemo(
    () => Math.round(50 + (index / (STEPS.length - 1)) * 50),
    [index]
  )

  const logStep = useCallback((name: StepKey) => {
    onStepCompleted(name)
    // Fire-and-forget. Analytics must never block the funnel.
    void fetch('/api/funnel-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'gate_step_completed', step: name }),
      keepalive: true,
    }).catch(() => {})
  }, [onStepCompleted])

  /** Create or enrich the lead. Called at the phone screen and after it. */
  const save = useCallback(
    async (data: Draft, stage: 'phone' | 'update', verificationId?: string) => {
      const res = await fetch('/api/demo-lead/wizard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stage,
          verificationId,
          trade: data.trade,
          phone: data.phone,
          firstName: data.firstName,
          company: data.company,
          // Minted client-side and reused by the server for the CAPI event, so
          // the pixel and the server event carry the SAME id and Meta dedupes
          // them into one conversion.
          eventId: eventIdRef.current,
          landingPath: window.location.pathname + window.location.search,
          attribution,
          hp_ref: honeypot,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'Could not save that. Try again.')
      // A 200 with no leadId means the server accepted the request but stored
      // nothing (the honeypot branch). Treat it as a hard failure: the old code
      // read it as success and walked people through the whole gate while
      // saving nothing and notifying nobody.
      if (!json?.leadId) {
        void fetch('/api/funnel-event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'honeypot_blocked', step: 'honeypot_blocked' }),
          keepalive: true,
        }).catch(() => {})
        throw new Error('Something went wrong on our end. Please try that again.')
      }
      leadIdRef.current = json.leadId
      return json as { leadId?: string; qualified?: boolean }
    },
    [attribution, honeypot]
  )

  /**
   * The number is verified. THIS is where the lead is created, the Meta Lead
   * event fires and the instant SMS goes out — all of it downstream of a real
   * handset, and all of it exactly once (bankedRef here, DB claims server-side).
   */
  async function handleOtpVerified(verificationId: string) {
    setSubmitting(true)
    setError('')
    try {
      const result = await save(draft, 'phone', verificationId)
      if (!bankedRef.current) {
        bankedRef.current = true
        onLeadBanked({
          qualified: Boolean(result.qualified),
          eventId: eventIdRef.current,
          trade: draft.trade,
          businessName: draft.company,
        })
      }
      logStep('otp')

      // OTP is the LAST screen since the gate was reordered, so advancing past
      // it walked index off the end of STEPS: STEPS[5] is undefined and the
      // render then read COPY[undefined].headline, which is the client-side
      // exception every arm A visitor hit right after verifying.
      //
      // Verification is the finish line now, so complete here instead of
      // advancing. Guarded on isLast rather than hardcoded, so putting a screen
      // after OTP later does the sensible thing instead of silently skipping it.
      const isLast = index === STEPS.length - 1
      if (!isLast) {
        const nextIndex = index + 1
        persist(draft, nextIndex)
        setIndex(nextIndex)
        return
      }

      persist(draft, index)
      setUnlocked(true)
      void fetch('/api/funnel-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'video_unlocked', step: 'complete' }),
        keepalive: true,
      }).catch(() => {})
      // Let the unlock line land before the video takes over.
      setTimeout(() => {
        try {
          sessionStorage.removeItem(GATE_DRAFT_KEY)
        } catch {
          /* ignore */
        }
        onComplete({
          leadId: leadIdRef.current,
          name: draft.firstName,
          phone: draft.phone,
          trade: draft.trade,
          company: draft.company,
          email: '',
          qualified: draft.trade !== NOT_AN_OWNER && !isTerminalTrade(draft.trade),
        })
      }, 900)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function advance(rawValue: string) {
    const value = step === 'phone' ? rawValue : rawValue.trim()
    const problem = validate(step, value)
    if (problem) {
      setError(problem)
      return
    }
    setError('')

    // Homeowners and browsers stop here. No OTP, no lead row, no Lead event —
    // texting a homeowner a code so they can watch a contractor sales demo
    // helps nobody, and counting them as leads would poison the optimisation
    // signal the ad account is trained on. The answer is still recorded, with
    // no PII, so the drop-off is visible in the funnel report.
    if (step === 'trade' && isTerminalTrade(value)) {
      setDraft((d) => ({ ...d, trade: value }))
      void fetch('/api/funnel-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'gate_exit_not_a_fit', step: 'trade', metadata: { answer: value } }),
        keepalive: true,
      }).catch(() => {})
      setExited(true)
      return
    }

    const next: Draft = { ...draft, [step]: value }
    setDraft(next)

    const isLast = index === STEPS.length - 1

    // The phone screen no longer writes anything. It requests a code and hands
    // over to OtpScreen; the lead is banked once that verifies.
    if (step === 'phone') {
      setSubmitting(true)
      try {
        const res = await fetch('/api/otp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: value }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) {
          setError(json?.error || 'Could not send a code. Try again.')
          return
        }
      } catch {
        setError('Could not send a code. Try again.')
        return
      } finally {
        setSubmitting(false)
      }
      logStep('phone')
      const nextIdx = index + 1
      persist(next, nextIdx)
      setIndex(nextIdx)
      return
    }

    // Later screens enrich the row banked at verification.
    const shouldSave =
      bankedRef.current && (step !== 'trade' || SEND_SMS_AT === 'complete')

    if (shouldSave || (isLast && !bankedRef.current)) {
      setSubmitting(true)
      try {
        await save(next, 'update')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save that. Try again.')
        setSubmitting(false)
        return
      } finally {
        setSubmitting(false)
      }
    }

    // Logged only AFTER any save succeeded. Logging first made the analytics
    // claim screens were completed when nothing had been written, which is
    // exactly what hid the honeypot bug.
    logStep(step)

    if (isLast) {
      persist(next, index)
      setUnlocked(true)
      void fetch('/api/funnel-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'video_unlocked', step: 'complete' }),
        keepalive: true,
      }).catch(() => {})
      // Let them read the unlock line before the video takes over.
      setTimeout(() => {
        try {
          sessionStorage.removeItem(GATE_DRAFT_KEY)
        } catch {
          /* ignore */
        }
        onComplete({
          leadId: leadIdRef.current,
          name: next.firstName,
          phone: next.phone,
          trade: next.trade,
          company: next.company,
          email: '',
          qualified: next.trade !== NOT_AN_OWNER && !isTerminalTrade(next.trade),
        })
      }, 900)
      return
    }

    const nextIndex = index + 1
    persist(next, nextIndex)
    setIndex(nextIndex)
  }

  function back() {
    setError('')
    if (index === 0) onClose()
    else setIndex((i) => i - 1)
  }

  if (!open) return null

  const value = draft[step]

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.72)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Unlock the demo video"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg border-2 max-h-[88dvh] overflow-y-auto motion-safe:animate-[aaFade_220ms_ease-out]"
        style={{ background: '#16181C', borderColor: border }}
      >
        <div className="flex items-center justify-between px-5 pt-3 sm:px-7">
          {index > 0 && !unlocked && !exited ? (
            <button
              type="button"
              onClick={back}
              className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] min-h-[44px]"
              style={{ color: '#6E7681' }}
            >
              <ArrowLeft size={14} strokeWidth={2.5} />
              Back
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid place-items-center min-h-[44px] min-w-[44px]"
            style={{ color: '#6E7681' }}
          >
            <X size={20} strokeWidth={2.5} />
          </button>
        </div>

        {!exited && (
          <ProgressBar pct={unlocked ? 100 : pct} label="Progress to your demo" min={50} />
        )}

        {/* Honeypot. Hidden from humans and from screen readers. */}
        {/* Honeypot. Renamed off "website": password managers and mobile
            contact autofill happily fill an off-screen field with that name,
            which silently blocked real people. hp_ref matches nothing an
            autofill heuristic looks for. */}
        <div aria-hidden="true" className="absolute w-px h-px overflow-hidden -left-[9999px]">
          <label htmlFor="hp_ref">Leave this empty</label>
          <input id="hp_ref" name="hp_ref" type="text" tabIndex={-1} autoComplete="off"
            value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
        </div>

        <div className="p-5 sm:p-7">
          {exited ? (
            <div className="py-6 text-center">
              <h2 className="text-[clamp(1.4rem,4.6vw,1.9rem)] font-black uppercase leading-[1.12] tracking-tight mb-3">
                Thanks for being straight with me.
              </h2>
              <p className="text-[15px] leading-[1.65] mb-6" style={{ color: 'rgba(242,240,235,0.7)' }}>
                This one is built for home service business owners, so I will not waste your time
                with the demo. If that changes, or you know an owner who is missing calls, you know
                where to find me.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="aa-btn w-full py-4 text-[16px] font-bold uppercase tracking-wide min-h-[56px]"
                style={{ background: '#EE6B1A', color: '#16181C' }}
              >
                Close
              </button>
            </div>
          ) : unlocked ? (
            <div className="py-6 text-center">
              <h2 className="text-[clamp(1.6rem,5.4vw,2.2rem)] font-black uppercase leading-[1.12] tracking-tight">
                Your demo&apos;s ready.
              </h2>
            </div>
          ) : (
            <>
              {step !== 'otp' && (
                <>
                  <h2 className="text-[clamp(1.4rem,4.6vw,1.9rem)] font-black uppercase leading-[1.15] tracking-tight mb-2">
                    {COPY[step].headline}
                  </h2>
                  {COPY[step].hint && (
                    <p className="text-[14px] leading-[1.6] mb-5" style={{ color: 'rgba(242,240,235,0.6)' }}>
                      {COPY[step].hint}
                    </p>
                  )}
                </>
              )}

              {step === 'otp' ? (
                <OtpScreen
                  phone={draft.phone}
                  onVerified={handleOtpVerified}
                  onBack={() => {
                    setError('')
                    setIndex(1)
                  }}
                />
              ) : step === 'trade' ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    void advance(draft.trade)
                  }}
                >
                  <select
                    value={draft.trade}
                    onChange={(e) => {
                      setDraft((d) => ({ ...d, trade: e.target.value }))
                      setError('')
                    }}
                    aria-label="What do you do?"
                    aria-invalid={error ? true : undefined}
                    className={`${inputCls} appearance-none cursor-pointer`}
                    style={error ? { ...inputStyle, borderColor: '#EE6B1A' } : inputStyle}
                  >
                    <option value="" disabled style={{ background: '#16181C' }}>
                      Pick the one that fits best
                    </option>
                    {GATE_TRADES.map((t) => (
                      <option key={t} value={t} style={{ background: '#16181C', color: '#F2F0EB' }}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="aa-btn mt-5 w-full py-4 text-[16px] font-bold uppercase tracking-wide flex items-center justify-center gap-2 disabled:opacity-50 min-h-[56px]"
                    style={{ background: '#EE6B1A', color: '#16181C' }}
                  >
                    {submitting ? (<><Loader2 size={18} className="motion-safe:animate-spin" /> One sec</>) : 'Next'}
                  </button>
                </form>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    void advance(value)
                  }}
                >
                  <input
                    ref={inputRef}
                    value={value}
                    onChange={(e) => {
                      const raw = e.target.value
                      setDraft((d) => ({ ...d, [step]: step === 'phone' ? formatPhoneInput(raw) : raw }))
                      setError('')
                    }}
                    type={step === 'phone' ? 'tel' : 'text'}
                    inputMode={step === 'phone' ? 'tel' : 'text'}
                    autoComplete={
                      step === 'phone' ? 'tel'
                      : step === 'firstName' ? 'given-name'
                      : 'organization'
                    }
                    enterKeyHint={index === STEPS.length - 1 ? 'done' : 'next'}
                    placeholder={
                      step === 'phone' ? '(555) 123-4567'
                      : step === 'firstName' ? 'First name'
                      : 'Your business'
                    }
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? 'gate-error' : undefined}
                    className={inputCls}
                    style={error ? { ...inputStyle, borderColor: '#EE6B1A' } : inputStyle}
                  />
                  {error && (
                    <p id="gate-error" className="mt-2 text-[13px] font-semibold leading-[1.5]" style={{ color: '#EE6B1A' }}>
                      {error}
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={submitting}
                    className="aa-btn mt-5 w-full py-4 text-[16px] font-bold uppercase tracking-wide flex items-center justify-center gap-2 disabled:opacity-50 min-h-[56px]"
                    style={{ background: '#EE6B1A', color: '#16181C' }}
                  >
                    {submitting ? (<><Loader2 size={18} className="motion-safe:animate-spin" /> One sec</>) : 'Next'}
                  </button>
                </form>
              )}

              {step === 'otp' && error && (
                <p className="mt-3 text-[13px] font-semibold leading-[1.5]" style={{ color: '#EE6B1A' }}>{error}</p>
              )}

              {step === 'trade' && error && (
                <p className="mt-3 text-[13px] font-semibold leading-[1.5]" style={{ color: '#EE6B1A' }}>{error}</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
