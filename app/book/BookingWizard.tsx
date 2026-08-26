'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { X, ArrowLeft, Loader2, Check, Calendar } from 'lucide-react'
import { validateUsMobile } from '@/lib/phone-utils'
import type { Attribution } from '@/lib/attribution'
import type { CouponState } from '@/lib/coupon'
import { CouponApplied } from './CouponBanner'
import ProgressBar from './ProgressBar'
import {
  TRADES,
  NOT_AN_OWNER,
  MISSES_PER_WEEK,
  WHO_ANSWERS,
  formatPhoneInput,
} from './constants'

// ─────────────────────────────────────────────────────────
// Slot-first booking wizard. The visitor picks a time on the page, then this
// asks one question per screen.
//
// Questions already answered are SKIPPED, never asked twice. A `gate` visitor
// arrives with trade, name and phone already captured and starts at email.
//
// In `nogate` there is no gate modal, so this is where a lead first becomes
// known. The moment trade + name + phone are all present it writes the lead
// server-side and the owner is notified immediately, because someone who gave
// their number and then abandoned is still a callable lead.
// ─────────────────────────────────────────────────────────

export type WizardPrefill = { trade?: string; name?: string; phone?: string; email?: string }
export type ChosenSlot = { iso: string; display: string; dateLabel: string }

type StepKey = 'trade' | 'name' | 'phone' | 'email' | 'company' | 'misses' | 'who' | 'confirm'

const BORDER = 'rgba(110,118,129,0.35)'
const inputCls =
  'w-full px-4 py-4 border-2 text-[16px] font-medium outline-none bg-transparent focus:border-[#EE6B1A]'
const inputStyle = { borderColor: BORDER, color: '#F2F0EB' }

function Choice({ value, onPick }: { value: string; onPick: (v: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPick(value)}
      className="w-full border-2 px-4 py-4 text-left text-[15px] font-semibold min-h-[56px] transition-colors focus:outline-none focus-visible:ring-2"
      style={{ borderColor: BORDER, color: '#F2F0EB' }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = '#EE6B1A'
        e.currentTarget.style.background = 'rgba(238,107,26,0.08)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = BORDER
        e.currentTarget.style.background = 'transparent'
      }}
    >
      {value}
    </button>
  )
}

export default function BookingWizard({
  open,
  slot,
  prefill,
  attribution,
  onClose,
  onBooked,
  onSlotTaken,
  onLeadCaptured,
  needsLeadWrite,
  coupon,
}: {
  open: boolean
  slot: ChosenSlot | null
  prefill: WizardPrefill
  attribution: Attribution
  onClose: () => void
  onBooked: (r: { dateLabel: string; timeLabel: string; meetLink: string | null; couponLine: string | null }) => void
  onSlotTaken: () => void
  onLeadCaptured: (qualified: boolean) => void
  /** true in `nogate`: the lead has not been written yet, this wizard must do it. */
  needsLeadWrite: boolean
  coupon: CouponState
}) {
  const [trade, setTrade] = useState(prefill.trade ?? '')
  const [name, setName] = useState(prefill.name ?? '')
  const [phone, setPhone] = useState(prefill.phone ?? '')
  const [email, setEmail] = useState(prefill.email ?? '')
  const [company, setCompany] = useState('')
  const [misses, setMisses] = useState('')
  const [who, setWho] = useState('')
  const [honeypot, setHoneypot] = useState('')

  const [stepIndex, setStepIndex] = useState(0)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const leadWritten = useRef(false)
  const firstInput = useRef<HTMLInputElement>(null)

  // Only ask what is missing. Recomputed from the prefill, not from live state,
  // so typing a name does not make the name screen vanish under you.
  const steps = useMemo<StepKey[]>(() => {
    const s: StepKey[] = []
    if (!prefill.trade) s.push('trade')
    if (!prefill.name) s.push('name')
    if (!prefill.phone) s.push('phone')
    if (!prefill.email) s.push('email')
    s.push('company', 'misses', 'who', 'confirm')
    return s
  }, [prefill.trade, prefill.name, prefill.phone, prefill.email])

  useEffect(() => {
    if (open) {
      setStepIndex(0)
      setError('')
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  const step = steps[stepIndex]

  useEffect(() => {
    if (!open) return
    if (step === 'name' || step === 'phone' || step === 'email' || step === 'company') {
      const t = setTimeout(() => firstInput.current?.focus(), 120)
      return () => clearTimeout(t)
    }
  }, [open, step])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !slot) return null
  // Narrowed once so the closures below do not each need a null check.
  const chosenSlot: ChosenSlot = slot

  function next() {
    setError('')
    setStepIndex((i) => Math.min(i + 1, steps.length - 1))
  }
  function back() {
    setError('')
    if (stepIndex === 0) onClose()
    else setStepIndex((i) => i - 1)
  }

  /**
   * `nogate` only. Fires as soon as trade + name + phone exist, which is the
   * unified Lead definition, and gets the owner notified while the visitor is
   * still on the page.
   */
  async function writeLeadIfReady(nextTrade: string, nextName: string, nextPhone: string) {
    if (!needsLeadWrite || leadWritten.current) return
    if (!nextTrade || !nextName) return
    const check = validateUsMobile(nextPhone)
    if (!check.ok) return
    leadWritten.current = true
    try {
      const res = await fetch('/api/demo-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: nextName.trim(),
          phone: check.e164,
          trade: nextTrade,
          landingPath: window.location.pathname + window.location.search,
          attribution,
          website: honeypot,
        }),
      })
      if (!res.ok) {
        leadWritten.current = false
        return
      }
      onLeadCaptured(nextTrade !== NOT_AN_OWNER)
    } catch {
      // Never block the booking on lead bookkeeping. It retries on the next step.
      leadWritten.current = false
    }
  }

  async function submit() {
    setError('')
    setSubmitting(true)
    try {
      const res = await fetch('/api/demo-book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          slotStart: chosenSlot.iso,
          missesPerWeek: misses,
          whoAnswers: who,
          companyName: company.trim(),
          name: name.trim(),
          phone,
          trade,
          attribution,
          website: honeypot,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 409) {
        // Taken while they were answering. Keep every answer, send them back to
        // the picker so the only thing they redo is the time.
        onSlotTaken()
        return
      }
      if (!res.ok) {
        setError(data?.error || 'Could not book that time.')
        return
      }
      onBooked({
        dateLabel: data?.appointment?.dateLabel ?? chosenSlot.dateLabel,
        timeLabel: data?.appointment?.timeLabel ?? chosenSlot.display,
        meetLink: data?.appointment?.meetLink ?? null,
        couponLine: data?.appointment?.couponLine ?? null,
      })
    } catch {
      setError('Network hiccup. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const LABELS: Record<StepKey, string> = {
    trade: 'Your business',
    name: 'Your name',
    phone: 'Your cell',
    email: 'Your email',
    company: 'Company',
    misses: 'Missed calls',
    who: 'Who answers',
    confirm: 'Confirm',
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.72)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Book your demo call"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg border-2 max-h-[88dvh] overflow-y-auto motion-safe:animate-[aaFade_220ms_ease-out]"
        style={{ background: '#16181C', borderColor: BORDER }}
      >
        <div className="flex items-center justify-between px-5 pt-4 sm:px-7">
          <button
            type="button"
            onClick={back}
            className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] min-h-[44px]"
            style={{ color: '#6E7681' }}
          >
            <ArrowLeft size={14} strokeWidth={2.5} />
            Back
          </button>
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

        {/* Starts at 50%: picking a time already counted as real progress. */}
        <ProgressBar pct={50 + (stepIndex / Math.max(1, steps.length - 1)) * 50} label={LABELS[step]} min={50} />

        {/* Chosen time stays visible the whole way through. */}
        <div className="mx-5 sm:mx-7 mt-4 border-2 px-4 py-3 flex items-center gap-2.5"
          style={{ borderColor: 'rgba(238,107,26,0.4)', background: 'rgba(238,107,26,0.07)' }}>
          <Calendar size={15} strokeWidth={2.25} style={{ color: '#EE6B1A' }} />
          <span className="text-[13px] font-semibold leading-[1.5]" style={{ color: '#F2F0EB' }}>
            {slot.dateLabel} at {slot.display}
          </span>
        </div>

        {/* Honeypot */}
        <div aria-hidden="true" className="absolute w-px h-px overflow-hidden -left-[9999px]">
          <label htmlFor="wz-website">Website</label>
          <input id="wz-website" name="website" type="text" tabIndex={-1} autoComplete="off"
            value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
        </div>

        <div className="p-5 sm:p-7">
          {step === 'trade' && (
            <>
              <h2 className="text-[clamp(1.4rem,4.6vw,1.9rem)] font-black uppercase leading-[1.15] tracking-tight mb-5">
                What kind of business do you run?
              </h2>
              <div className="grid gap-2.5">
                {TRADES.map((t) => (
                  <Choice key={t} value={t} onPick={(v) => { setTrade(v); void writeLeadIfReady(v, name, phone); next() }} />
                ))}
              </div>
            </>
          )}

          {step === 'name' && (
            <>
              <h2 className="text-[clamp(1.4rem,4.6vw,1.9rem)] font-black uppercase leading-[1.15] tracking-tight mb-5">
                What is your first name?
              </h2>
              <input ref={firstInput} type="text" autoComplete="given-name" value={name}
                onChange={(e) => setName(e.target.value)} placeholder="Your first name"
                className={inputCls} style={inputStyle} />
              <button type="button" disabled={!name.trim()}
                onClick={() => { void writeLeadIfReady(trade, name, phone); next() }}
                className="aa-btn mt-5 w-full py-4 text-[16px] font-bold uppercase tracking-wide disabled:opacity-40 min-h-[56px]"
                style={{ background: '#EE6B1A', color: '#16181C' }}>
                Next
              </button>
            </>
          )}

          {step === 'phone' && (
            <>
              <h2 className="text-[clamp(1.4rem,4.6vw,1.9rem)] font-black uppercase leading-[1.15] tracking-tight mb-2">
                Best cell to reach you?
              </h2>
              <p className="text-[14px] leading-[1.6] mb-5" style={{ color: 'rgba(242,240,235,0.6)' }}>
                I text the confirmation here. Reply STOP any time.
              </p>
              <input ref={firstInput} type="tel" inputMode="tel" autoComplete="tel" value={phone}
                onChange={(e) => { setPhone(formatPhoneInput(e.target.value)); setError('') }}
                placeholder="(555) 123-4567" className={inputCls} style={inputStyle} />
              <button type="button"
                onClick={() => {
                  const c = validateUsMobile(phone)
                  if (!c.ok) return setError(c.reason)
                  void writeLeadIfReady(trade, name, phone)
                  next()
                }}
                className="aa-btn mt-5 w-full py-4 text-[16px] font-bold uppercase tracking-wide min-h-[56px]"
                style={{ background: '#EE6B1A', color: '#16181C' }}>
                Next
              </button>
            </>
          )}

          {step === 'email' && (
            <>
              <h2 className="text-[clamp(1.4rem,4.6vw,1.9rem)] font-black uppercase leading-[1.15] tracking-tight mb-5">
                Where should the invite go?
              </h2>
              <input ref={firstInput} type="email" autoComplete="email" value={email}
                onChange={(e) => { setEmail(e.target.value); setError('') }}
                placeholder="you@company.com" className={inputCls} style={inputStyle} />
              <button type="button"
                onClick={() => {
                  if (!email.trim() || !email.includes('@')) return setError('Please enter a valid email.')
                  next()
                }}
                className="aa-btn mt-5 w-full py-4 text-[16px] font-bold uppercase tracking-wide min-h-[56px]"
                style={{ background: '#EE6B1A', color: '#16181C' }}>
                Next
              </button>
            </>
          )}

          {step === 'company' && (
            <>
              <h2 className="text-[clamp(1.4rem,4.6vw,1.9rem)] font-black uppercase leading-[1.15] tracking-tight mb-2">
                Company name?
              </h2>
              <p className="text-[14px] leading-[1.6] mb-5" style={{ color: 'rgba(242,240,235,0.6)' }}>
                Optional. Skip it if you want.
              </p>
              <input ref={firstInput} type="text" autoComplete="organization" value={company}
                onChange={(e) => setCompany(e.target.value)} placeholder="Your business"
                className={inputCls} style={inputStyle} />
              <button type="button" onClick={next}
                className="aa-btn mt-5 w-full py-4 text-[16px] font-bold uppercase tracking-wide min-h-[56px]"
                style={{ background: '#EE6B1A', color: '#16181C' }}>
                {company.trim() ? 'Next' : 'Skip'}
              </button>
            </>
          )}

          {step === 'misses' && (
            <>
              <h2 className="text-[clamp(1.4rem,4.6vw,1.9rem)] font-black uppercase leading-[1.15] tracking-tight mb-5">
                How many calls do you miss in a typical week?
              </h2>
              <div className="grid gap-2.5">
                {MISSES_PER_WEEK.map((m) => (
                  <Choice key={m} value={m} onPick={(v) => { setMisses(v); next() }} />
                ))}
              </div>
            </>
          )}

          {step === 'who' && (
            <>
              <h2 className="text-[clamp(1.4rem,4.6vw,1.9rem)] font-black uppercase leading-[1.15] tracking-tight mb-5">
                Who answers your phone right now?
              </h2>
              <div className="grid gap-2.5">
                {WHO_ANSWERS.map((w) => (
                  <Choice key={w} value={w} onPick={(v) => { setWho(v); next() }} />
                ))}
              </div>
            </>
          )}

          {step === 'confirm' && (
            <>
              <h2 className="text-[clamp(1.4rem,4.6vw,1.9rem)] font-black uppercase leading-[1.15] tracking-tight mb-5">
                Look right?
              </h2>
              <CouponApplied state={coupon} />
              <dl className="border-2" style={{ borderColor: BORDER }}>
                {[
                  ['Time', `${slot.dateLabel} at ${slot.display}`],
                  ['Name', name],
                  ['Cell', phone],
                  ['Email', email],
                  ...(company.trim() ? [['Company', company.trim()]] : []),
                  ['Business', trade],
                  ...(misses ? [['Missed calls', misses]] : []),
                  ...(who ? [['Answers now', who]] : []),
                ].map(([k, v]) => (
                  <div key={k} className="flex items-baseline justify-between gap-4 px-4 py-3">
                    <dt className="font-mono text-[10px] uppercase tracking-[0.16em] shrink-0" style={{ color: '#6E7681' }}>{k}</dt>
                    <dd className="text-[14px] leading-[1.5] text-right" style={{ color: '#F2F0EB' }}>{v}</dd>
                  </div>
                ))}
              </dl>
              {error && <p className="mt-4 text-[13px] font-semibold leading-[1.5]" style={{ color: '#EE6B1A' }}>{error}</p>}
              <button type="button" onClick={submit} disabled={submitting}
                className="aa-btn mt-5 w-full py-4 text-[16px] font-bold uppercase tracking-wide flex items-center justify-center gap-2 disabled:opacity-50 min-h-[56px]"
                style={{ background: '#EE6B1A', color: '#16181C' }}>
                {submitting ? (<><Loader2 size={18} className="motion-safe:animate-spin" /> Booking</>) : (<><Check size={18} strokeWidth={2.5} /> Book it</>)}
              </button>
            </>
          )}

          {step !== 'confirm' && error && (
            <p className="mt-4 text-[13px] font-semibold leading-[1.5]" style={{ color: '#EE6B1A' }}>{error}</p>
          )}
        </div>
      </div>
    </div>
  )
}
