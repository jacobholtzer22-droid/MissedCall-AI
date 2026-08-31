'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { X, ArrowLeft, Loader2 } from 'lucide-react'
import { validateUsMobile } from '@/lib/phone-utils'
import ProgressBar from './ProgressBar'
import { TRADES, NOT_AN_OWNER, formatPhoneInput, SEND_SMS_AT, GATE_DRAFT_KEY } from './constants'

// ─────────────────────────────────────────────────────────
// One question per screen.
//
// The lead is BANKED at the phone screen, not at the end: someone who gives a
// number and then abandons on "last name" is still a callable lead, and the
// owner hears about them in seconds. Later screens enrich the same row.
//
// Answers persist in sessionStorage so a refresh or an accidental back swipe
// does not cost the visitor their progress.
// ─────────────────────────────────────────────────────────

export type GateResult = {
  leadId: string
  name: string
  phone: string
  trade: string
  email: string
  qualified: boolean
}

type StepKey = 'trade' | 'phone' | 'firstName' | 'lastName' | 'company' | 'email'

const STEPS: StepKey[] = ['trade', 'phone', 'firstName', 'lastName', 'company', 'email']

const COPY: Record<StepKey, { headline: string; hint?: string }> = {
  trade: { headline: 'What kind of business do you run?' },
  phone: {
    headline: 'Where should I text the demo and the price?',
    hint: 'I text it straight to this number. Reply STOP any time.',
  },
  firstName: { headline: 'What is your first name?' },
  lastName: { headline: 'And your last name?' },
  company: { headline: 'What is your company called?' },
  email: { headline: 'Last one. What is your email?' },
}

const border = 'rgba(110,118,129,0.35)'
const inputCls =
  'w-full px-4 py-4 border-2 text-[17px] font-medium outline-none bg-transparent focus:border-[#EE6B1A]'
const inputStyle = { borderColor: border, color: '#F2F0EB' }

type Draft = Record<StepKey, string>
const EMPTY_DRAFT: Draft = { trade: '', phone: '', firstName: '', lastName: '', company: '', email: '' }

function validate(step: StepKey, value: string): string {
  const v = value.trim()
  switch (step) {
    case 'trade':
      return v ? '' : 'Pick the one that fits best.'
    case 'phone': {
      const check = validateUsMobile(v)
      return check.ok ? '' : check.reason
    }
    case 'firstName':
      return v.length >= 2 ? '' : 'Please enter your first name.'
    case 'lastName':
      return v.length >= 2 ? '' : 'Please enter your last name.'
    case 'company':
      return v.length >= 2 ? '' : 'Please enter your company name.'
    case 'email':
      // Deliberately a shape check, not a clever regex. Real validation is the
      // email arriving.
      return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? '' : 'That does not look like an email address.'
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
  /** Fired once, when the phone screen banks the lead. Parent fires the pixel. */
  onLeadBanked: (qualified: boolean) => void
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
        setIndex(saved._index)
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
    async (data: Draft, stage: 'phone' | 'update') => {
      const res = await fetch('/api/demo-lead/wizard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stage,
          trade: data.trade,
          phone: data.phone,
          firstName: data.firstName,
          lastName: data.lastName,
          company: data.company,
          email: data.email,
          landingPath: window.location.pathname + window.location.search,
          attribution,
          website: honeypot,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'Could not save that. Try again.')
      if (json?.leadId) leadIdRef.current = json.leadId
      return json as { leadId?: string; qualified?: boolean }
    },
    [attribution, honeypot]
  )

  async function advance(rawValue: string) {
    const value = step === 'phone' ? rawValue : rawValue.trim()
    const problem = validate(step, value)
    if (problem) {
      setError(problem)
      return
    }
    setError('')

    const next: Draft = { ...draft, [step]: value }
    setDraft(next)
    logStep(step)

    const isLast = index === STEPS.length - 1

    // Bank at the phone screen, then keep the same row updated.
    const shouldSave =
      step === 'phone' || (bankedRef.current && (step !== 'trade' || SEND_SMS_AT === 'complete'))

    if (shouldSave || (isLast && !bankedRef.current)) {
      setSubmitting(true)
      try {
        const result = await save(next, step === 'phone' ? 'phone' : 'update')
        if (step === 'phone' && !bankedRef.current) {
          bankedRef.current = true
          onLeadBanked(Boolean(result.qualified))
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save that. Try again.')
        setSubmitting(false)
        return
      } finally {
        setSubmitting(false)
      }
    }

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
          name: [next.firstName, next.lastName].filter(Boolean).join(' '),
          phone: next.phone,
          trade: next.trade,
          email: next.email,
          qualified: next.trade !== NOT_AN_OWNER,
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
          {index > 0 && !unlocked ? (
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

        <ProgressBar pct={unlocked ? 100 : pct} label={`${unlocked ? 100 : pct}% of the way to the demo`} min={50} />

        {/* Honeypot. Hidden from humans and from screen readers. */}
        <div aria-hidden="true" className="absolute w-px h-px overflow-hidden -left-[9999px]">
          <label htmlFor="gate-website">Website</label>
          <input id="gate-website" name="website" type="text" tabIndex={-1} autoComplete="off"
            value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
        </div>

        <div className="p-5 sm:p-7">
          {unlocked ? (
            <div className="py-6 text-center">
              <h2 className="text-[clamp(1.6rem,5.4vw,2.2rem)] font-black uppercase leading-[1.12] tracking-tight">
                Your demo&apos;s ready.
              </h2>
            </div>
          ) : (
            <>
              <h2 className="text-[clamp(1.4rem,4.6vw,1.9rem)] font-black uppercase leading-[1.15] tracking-tight mb-2">
                {COPY[step].headline}
              </h2>
              {COPY[step].hint && (
                <p className="text-[14px] leading-[1.6] mb-5" style={{ color: 'rgba(242,240,235,0.6)' }}>
                  {COPY[step].hint}
                </p>
              )}

              {step === 'trade' ? (
                <div className="grid gap-2.5 mt-4">
                  {TRADES.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => advance(t)}
                      className="w-full border-2 px-4 py-4 text-left text-[15px] font-semibold min-h-[56px] transition-colors focus:outline-none focus-visible:ring-2"
                      style={{ borderColor: border, color: t === NOT_AN_OWNER ? '#6E7681' : '#F2F0EB' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = '#EE6B1A'
                        e.currentTarget.style.background = 'rgba(238,107,26,0.08)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = border
                        e.currentTarget.style.background = 'transparent'
                      }}
                    >
                      {t}
                    </button>
                  ))}
                </div>
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
                    type={step === 'phone' ? 'tel' : step === 'email' ? 'email' : 'text'}
                    inputMode={step === 'phone' ? 'tel' : step === 'email' ? 'email' : 'text'}
                    autoComplete={
                      step === 'phone' ? 'tel'
                      : step === 'firstName' ? 'given-name'
                      : step === 'lastName' ? 'family-name'
                      : step === 'company' ? 'organization'
                      : 'email'
                    }
                    enterKeyHint={index === STEPS.length - 1 ? 'done' : 'next'}
                    placeholder={
                      step === 'phone' ? '(555) 123-4567'
                      : step === 'firstName' ? 'First name'
                      : step === 'lastName' ? 'Last name'
                      : step === 'company' ? 'Your business'
                      : 'you@company.com'
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
