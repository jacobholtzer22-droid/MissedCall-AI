'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Calendar, Check, ArrowLeft, Clock, Loader2, ArrowRight } from 'lucide-react'
import { Logo } from '@/app/components/Logo'

// ─────────────────────────────────────────────────────────
// Constants — unchanged from original
// ─────────────────────────────────────────────────────────
const EXTRA_NEEDS_OPTIONS = [
  'Website',
  'Ads',
  'Spam call blocking',
  'Just the Missed-Call AI system',
] as const

const JUST_AI_OPTION = 'Just the Missed-Call AI system'

type Step =
  | 'qualify-business'
  | 'disqualified'
  | 'qualify-trade'
  | 'qualify-misses'
  | 'qualify-needs'
  | 'calendar'
  | 'form'
  | 'confirmation'

type ApiDay = {
  date: string
  isToday: boolean
  label: string
  timezoneLabel: string
  slots: { iso: string; display: string }[]
}

type SelectedSlot = {
  iso: string
  dateLabel: string
  timeLabel: string
}

// ─────────────────────────────────────────────────────────
// Step progress config
// ─────────────────────────────────────────────────────────
const STEPS: Step[] = ['qualify-business', 'qualify-trade', 'qualify-misses', 'qualify-needs', 'calendar', 'form']
function stepNumber(s: Step) {
  const idx = STEPS.indexOf(s)
  return idx >= 0 ? idx + 1 : null
}

// ─────────────────────────────────────────────────────────
// Shared style tokens
// ─────────────────────────────────────────────────────────
const inputCls = 'w-full px-4 py-3.5 border-2 text-[15px] font-medium outline-none transition-colors bg-transparent'
const inputStyle = { borderColor: 'rgba(110,118,129,0.4)', color: '#F2F0EB' }

function onFocus(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
  e.currentTarget.style.borderColor = '#EE6B1A'
}
function onBlur(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
  e.currentTarget.style.borderColor = 'rgba(110,118,129,0.4)'
}

// ─────────────────────────────────────────────────────────
// Back button
// ─────────────────────────────────────────────────────────
function BackBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] mb-8 transition-colors"
      style={{ color: '#6E7681' }}
      onMouseEnter={e => (e.currentTarget.style.color = '#EE6B1A')}
      onMouseLeave={e => (e.currentTarget.style.color = '#6E7681')}
    >
      <ArrowLeft size={14} strokeWidth={2.5} />
      Back
    </button>
  )
}

// ─────────────────────────────────────────────────────────
// Card wrapper
// ─────────────────────────────────────────────────────────
function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-2 p-7 sm:p-9" style={{ borderColor: 'rgba(110,118,129,0.35)', background: 'rgba(242,240,235,0.03)' }}>
      {children}
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Progress indicator
// ─────────────────────────────────────────────────────────
function StepProgress({ current }: { current: Step }) {
  const num = stepNumber(current)
  if (!num) return null
  const total = STEPS.length
  const pct = Math.round((num / total) * 100)
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.2em] mb-2" style={{ color: '#6E7681' }}>
        <span>Step {num} of {total}</span>
        <span style={{ color: '#EE6B1A' }}>{pct}%</span>
      </div>
      <div className="h-1 w-full" style={{ background: 'rgba(110,118,129,0.25)' }}>
        <div
          className="h-1 transition-all duration-300"
          style={{ width: `${pct}%`, background: '#EE6B1A' }}
        />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────
export default function BookPage() {
  const [step, setStep] = useState<Step>('qualify-business')
  const [days, setDays] = useState<ApiDay[]>([])
  const [loadingSlots, setLoadingSlots] = useState(true)
  const [slotsError, setSlotsError] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<SelectedSlot | null>(null)

  const [tradeType, setTradeType] = useState('')
  const [missedCalls, setMissedCalls] = useState('')
  const [extraNeeds, setExtraNeeds] = useState<string[]>([])

  const [formData, setFormData] = useState({
    name: '', phone: '', email: '', businessName: '', message: '', smsConsent: false,
  })
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  const scheduleFiredRef = useRef(false)
  useEffect(() => {
    if (step !== 'confirmation') return
    if (scheduleFiredRef.current) return
    scheduleFiredRef.current = true
    if (typeof window !== 'undefined' && (window as any).fbq) {
      (window as any).fbq('track', 'Schedule')
    }
  }, [step])

  useEffect(() => {
    let cancelled = false
    async function loadAvailability() {
      try {
        setLoadingSlots(true)
        setSlotsError(null)
        const res = await fetch('/api/marketing-bookings', { method: 'GET' })
        if (!res.ok) throw new Error('Failed to load availability')
        const data = (await res.json()) as { days: ApiDay[] }
        if (cancelled) return
        setDays(data.days || [])
        const today = data.days.find((d) => d.isToday) ?? data.days[0]
        setSelectedDate(today?.date ?? null)
      } catch {
        if (cancelled) return
        setSlotsError('Unable to load availability right now. Please try again in a moment.')
      } finally {
        if (!cancelled) setLoadingSlots(false)
      }
    }
    loadAvailability()
    return () => { cancelled = true }
  }, [])

  const timezoneLabel = useMemo(() => days[0]?.timezoneLabel ?? 'Eastern Time (ET)', [days])
  const daySlots = useMemo(() => {
    if (!selectedDate) return []
    return days.find((d) => d.date === selectedDate)?.slots ?? []
  }, [days, selectedDate])

  function handleSelectSlot(slot: { iso: string; display: string }) {
    const day = days.find((d) => d.date === selectedDate)
    if (!day) return
    setSelectedSlot({ iso: slot.iso, dateLabel: day.label, timeLabel: slot.display })
    setStep('form')
  }

  function handleFormChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const { name, type } = e.target
    setFormError('')
    if (type === 'checkbox' && name === 'smsConsent') {
      setFormData((prev) => ({ ...prev, smsConsent: (e.target as HTMLInputElement).checked }))
    } else {
      setFormData((prev) => ({ ...prev, [name]: e.target.value }))
    }
  }

  function toggleExtraNeed(option: (typeof EXTRA_NEEDS_OPTIONS)[number]) {
    setExtraNeeds((prev) =>
      prev.includes(option) ? prev.filter((item) => item !== option) : [...prev, option]
    )
  }

  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    if (!selectedSlot) { setFormError('Please select a time slot first.'); return }
    if (!formData.name.trim()) { setFormError('Please enter your name.'); return }
    if (!formData.email.trim()) { setFormError('Please enter your email.'); return }
    if (!formData.phone.trim()) { setFormError('Please enter your phone number.'); return }
    if (!formData.businessName.trim()) { setFormError('Please enter your business name.'); return }
    if (!formData.smsConsent) { setFormError('Please consent to SMS so we can send confirmations.'); return }
    setSubmitting(true)
    try {
      const res = await fetch('/api/marketing-bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name.trim(),
          phone: formData.phone.trim(),
          email: formData.email.trim(),
          businessName: formData.businessName.trim(),
          tradeType: tradeType.trim() || undefined,
          missedCalls: missedCalls.trim() || undefined,
          extraNeeds,
          notes: formData.message.trim() || undefined,
          smsConsent: formData.smsConsent,
          slotStart: selectedSlot.iso,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to book call')
      }
      setStep('confirmation')
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-dvh aa-grid-bg" style={{ background: '#16181C', color: '#F2F0EB' }}>

      {/* ── Header ─────────────────────────────────────── */}
      <header className="border-b-2" style={{ borderColor: 'rgba(110,118,129,0.28)', background: 'rgba(22,24,28,0.95)' }}>
        <div className="mx-auto max-w-5xl px-5 sm:px-8 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <Logo size="sm" />
            <div className="hidden sm:flex flex-col leading-none">
              <span className="text-[14px] font-extrabold tracking-tight" style={{ color: '#F2F0EB' }}>Align and Acquire</span>
              <span className="font-mono text-[9px] uppercase tracking-[0.22em] mt-0.5" style={{ color: '#6E7681' }}>Missed-call lead capture</span>
            </div>
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] transition-colors"
            style={{ color: '#6E7681' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#EE6B1A')}
            onMouseLeave={e => (e.currentTarget.style.color = '#6E7681')}
          >
            <ArrowLeft size={13} strokeWidth={2.5} />
            Back to site
          </Link>
        </div>
      </header>

      {/* ── Hazard stripe ──────────────────────────────── */}
      <div className="aa-hazard" />

      <main className="mx-auto max-w-2xl px-5 sm:px-8 py-12 md:py-16">

        {/* ── Step 1: Service business? ────────────────── */}
        {step === 'qualify-business' && (
          <div>
            <StepProgress current={step} />
            <div className="mb-8">
              <div className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] mb-4">
                <span className="inline-block h-2.5 w-2.5" style={{ background: '#EE6B1A' }} />
                <span style={{ color: '#EE6B1A' }}>Let's see if we're a fit</span>
              </div>
              <h1 className="text-[clamp(2rem,6vw,3.2rem)] font-black uppercase leading-[0.92] tracking-tight mb-3">
                Do you run a<br />service-based business?
              </h1>
              <p className="text-[15px]" style={{ color: 'rgba(242,240,235,0.6)' }}>
                A couple quick questions before we grab a time.
              </p>
            </div>
            <Card>
              <div className="grid sm:grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setStep('qualify-trade')}
                  className="aa-btn w-full py-4 text-[15px] font-bold uppercase tracking-wide"
                  style={{ background: '#EE6B1A', color: '#16181C' }}
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => setStep('disqualified')}
                  className="aa-btn-ghost w-full border-2 py-4 text-[15px] font-bold uppercase tracking-wide"
                  style={{ borderColor: 'rgba(110,118,129,0.4)', color: '#6E7681' }}
                >
                  No
                </button>
              </div>
            </Card>
          </div>
        )}

        {/* ── Disqualified ─────────────────────────────── */}
        {step === 'disqualified' && (
          <div className="text-center">
            <div className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] mb-6">
              <span className="inline-block h-2.5 w-2.5" style={{ background: '#6E7681' }} />
              <span style={{ color: '#6E7681' }}>Not a match right now</span>
            </div>
            <h1 className="text-[clamp(2rem,6vw,3rem)] font-black uppercase leading-[0.92] tracking-tight mb-5">
              Looks like we&apos;re not<br />the right fit right now.
            </h1>
            <p className="text-[15px] leading-relaxed max-w-md mx-auto mb-10" style={{ color: 'rgba(242,240,235,0.65)' }}>
              Our system is built specifically for service-based businesses. Thanks for checking us out. If that changes down the road, we&apos;d love to talk.
            </p>
            <Link
              href="/"
              className="aa-btn inline-flex items-center gap-2 px-7 py-4 text-[15px] font-bold uppercase tracking-wide"
              style={{ background: '#EE6B1A', color: '#16181C' }}
            >
              Back to home <ArrowRight size={16} strokeWidth={2.5} />
            </Link>
          </div>
        )}

        {/* ── Step 2: What kind of business? ───────────── */}
        {step === 'qualify-trade' && (
          <div>
            <BackBtn onClick={() => setStep('qualify-business')} />
            <StepProgress current={step} />
            <div className="mb-8">
              <h1 className="text-[clamp(2rem,6vw,3.2rem)] font-black uppercase leading-[0.92] tracking-tight mb-3">
                What kind of<br />service business?
              </h1>
            </div>
            <Card>
              <label htmlFor="qualify-trade-input" className="block font-mono text-[11px] font-bold uppercase tracking-[0.2em] mb-3" style={{ color: '#6E7681' }}>
                Business type
              </label>
              <input
                id="qualify-trade-input"
                type="text"
                value={tradeType}
                onChange={(e) => setTradeType(e.target.value)}
                placeholder="e.g. Plumbing, HVAC, Landscaping, Auto Detailing"
                autoFocus
                className={inputCls}
                style={inputStyle}
                onFocus={onFocus}
                onBlur={onBlur}
              />
              <button
                type="button"
                onClick={() => setStep('qualify-misses')}
                disabled={!tradeType.trim()}
                className="aa-btn mt-6 w-full py-4 text-[15px] font-bold uppercase tracking-wide disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: '#EE6B1A', color: '#16181C' }}
              >
                Next
              </button>
            </Card>
          </div>
        )}

        {/* ── Step 3: How many missed calls? ───────────── */}
        {step === 'qualify-misses' && (
          <div>
            <BackBtn onClick={() => setStep('qualify-trade')} />
            <StepProgress current={step} />
            <div className="mb-8">
              <h1 className="text-[clamp(2rem,6vw,3.2rem)] font-black uppercase leading-[0.92] tracking-tight mb-3">
                How many calls do<br />you miss a week?
              </h1>
            </div>
            <Card>
              <label htmlFor="qualify-misses-input" className="block font-mono text-[11px] font-bold uppercase tracking-[0.2em] mb-3" style={{ color: '#6E7681' }}>
                Rough estimate is fine
              </label>
              <input
                id="qualify-misses-input"
                type="text"
                value={missedCalls}
                onChange={(e) => setMissedCalls(e.target.value)}
                placeholder="e.g. 10–15 a week, not sure, a ton"
                autoFocus
                className={inputCls}
                style={inputStyle}
                onFocus={onFocus}
                onBlur={onBlur}
              />
              <button
                type="button"
                onClick={() => setStep('qualify-needs')}
                disabled={!missedCalls.trim()}
                className="aa-btn mt-6 w-full py-4 text-[15px] font-bold uppercase tracking-wide disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: '#EE6B1A', color: '#16181C' }}
              >
                Next
              </button>
            </Card>
          </div>
        )}

        {/* ── Step 4: Anything else? ────────────────────── */}
        {step === 'qualify-needs' && (
          <div>
            <BackBtn onClick={() => setStep('qualify-misses')} />
            <StepProgress current={step} />
            <div className="mb-8">
              <h1 className="text-[clamp(2rem,6vw,3.2rem)] font-black uppercase leading-[0.92] tracking-tight mb-3">
                Need help with<br />anything else?
              </h1>
              <p className="text-[14px]" style={{ color: 'rgba(242,240,235,0.55)' }}>Select all that apply. Skip if not sure.</p>
            </div>
            <Card>
              <div className="grid gap-3 sm:grid-cols-2">
                {EXTRA_NEEDS_OPTIONS.map((opt) => {
                  const isSelected = extraNeeds.includes(opt)
                  return (
                    <label
                      key={opt}
                      className="group relative flex cursor-pointer items-center justify-between gap-3 border-2 px-4 py-3.5 transition-colors min-h-[44px]"
                      style={{
                        borderColor: isSelected ? '#EE6B1A' : 'rgba(110,118,129,0.35)',
                        background: isSelected ? 'rgba(238,107,26,0.08)' : 'transparent',
                      }}
                    >
                      <span className="text-[14px] font-semibold" style={{ color: isSelected ? '#F2F0EB' : '#6E7681' }}>{opt}</span>
                      <span
                        className="grid h-5 w-5 shrink-0 place-items-center border-2 transition-colors"
                        style={{
                          borderColor: isSelected ? '#EE6B1A' : 'rgba(110,118,129,0.4)',
                          background: isSelected ? '#EE6B1A' : 'transparent',
                        }}
                      >
                        {isSelected && <Check size={12} strokeWidth={3} style={{ color: '#16181C' }} />}
                      </span>
                      <input
                        type="checkbox"
                        name="extraNeeds"
                        value={opt}
                        checked={isSelected}
                        onChange={() => toggleExtraNeed(opt)}
                        className="sr-only"
                      />
                    </label>
                  )
                })}
              </div>
              <button
                type="button"
                onClick={() => setStep('calendar')}
                className="aa-btn mt-6 w-full py-4 text-[15px] font-bold uppercase tracking-wide"
                style={{ background: '#EE6B1A', color: '#16181C' }}
              >
                Continue to scheduling
              </button>
            </Card>
          </div>
        )}

        {/* ── Calendar ─────────────────────────────────── */}
        {step === 'calendar' && (
          <div>
            <BackBtn onClick={() => setStep('qualify-needs')} />
            <div className="mb-8">
              <div className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] mb-4">
                <span className="inline-block h-2.5 w-2.5" style={{ background: '#EE6B1A' }} />
                <span style={{ color: '#EE6B1A' }}>Pick a time</span>
              </div>
              <h1 className="text-[clamp(2rem,6vw,3.2rem)] font-black uppercase leading-[0.92] tracking-tight mb-3">
                Let&apos;s talk. Pick<br />a time that works.
              </h1>
              <p className="text-[14px]" style={{ color: 'rgba(242,240,235,0.6)' }}>
                Free strategy call. No pitch, no pressure. Just a conversation about what your business needs.
              </p>
            </div>

            <Card>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em]" style={{ color: '#6E7681' }}>
                  <Calendar size={14} strokeWidth={2.25} style={{ color: '#EE6B1A' }} />
                  Availability — next 2 weeks
                </div>
                <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: '#6E7681' }}>
                  {timezoneLabel}
                </span>
              </div>

              {loadingSlots ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3" style={{ color: '#6E7681' }}>
                  <Loader2 size={20} strokeWidth={2} className="animate-spin" style={{ color: '#EE6B1A' }} />
                  <p className="font-mono text-[11px] uppercase tracking-widest">Loading available times</p>
                </div>
              ) : slotsError ? (
                <div className="border-2 p-4 text-[13px]" style={{ borderColor: 'rgba(238,107,26,0.4)', background: 'rgba(238,107,26,0.07)', color: '#EE6B1A' }}>
                  {slotsError}
                </div>
              ) : (
                <>
                  {/* Date row */}
                  <div className="flex gap-2 overflow-x-auto pb-3 mb-6 [-webkit-overflow-scrolling:touch] [scrollbar-width:none]">
                    {days.map((day) => {
                      const isSelected = day.date === selectedDate
                      const hasSlots = day.slots.length > 0
                      return (
                        <button
                          key={day.date}
                          type="button"
                          onClick={() => setSelectedDate(day.date)}
                          disabled={!hasSlots}
                          className="min-w-[100px] px-3 py-3 border-2 text-left text-[12px] transition-colors shrink-0"
                          style={{
                            borderColor: isSelected ? '#EE6B1A' : 'rgba(110,118,129,0.35)',
                            background: isSelected ? 'rgba(238,107,26,0.1)' : 'transparent',
                            color: hasSlots ? (isSelected ? '#F2F0EB' : '#6E7681') : 'rgba(110,118,129,0.4)',
                            cursor: hasSlots ? 'pointer' : 'not-allowed',
                            outline: day.isToday ? '1px solid rgba(238,107,26,0.4)' : 'none',
                          }}
                        >
                          <div className="font-bold uppercase tracking-wide text-[11px]">
                            {day.isToday ? 'Today' : day.label.split(' ')[0]}
                          </div>
                          <div className="text-[11px] mt-0.5" style={{ color: '#6E7681' }}>
                            {day.isToday ? day.label : day.label.split(' ').slice(1).join(' ')}
                          </div>
                          <div className="mt-1.5 font-mono text-[10px] uppercase tracking-widest" style={{ color: hasSlots ? '#EE6B1A' : 'rgba(110,118,129,0.4)' }}>
                            {hasSlots ? `${day.slots.length} open` : 'Full'}
                          </div>
                        </button>
                      )
                    })}
                  </div>

                  {/* Time slots */}
                  <div>
                    <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] mb-3" style={{ color: '#6E7681' }}>
                      <Clock size={13} strokeWidth={2.25} style={{ color: '#EE6B1A' }} />
                      Select a time
                    </div>
                    {daySlots.length === 0 ? (
                      <p className="text-[13px]" style={{ color: '#6E7681' }}>
                        No remaining availability for this day. Try another date.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {daySlots.map((slot) => (
                          <button
                            key={slot.iso}
                            type="button"
                            onClick={() => handleSelectSlot(slot)}
                            className="px-4 py-2.5 border-2 text-[13px] font-semibold transition-colors"
                            style={{ borderColor: 'rgba(110,118,129,0.35)', color: '#F2F0EB', background: 'transparent' }}
                            onMouseEnter={e => {
                              e.currentTarget.style.borderColor = '#EE6B1A'
                              e.currentTarget.style.background = 'rgba(238,107,26,0.08)'
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.borderColor = 'rgba(110,118,129,0.35)'
                              e.currentTarget.style.background = 'transparent'
                            }}
                          >
                            <Clock size={13} strokeWidth={2.25} className="inline mr-1.5 -mt-0.5" style={{ color: '#EE6B1A' }} />
                            {slot.display}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <p className="font-mono text-[10px] uppercase tracking-widest mt-8" style={{ color: 'rgba(110,118,129,0.55)' }}>
                    Calls available 8:00 AM – 4:00 PM Eastern Time · 30-minute slots
                  </p>
                </>
              )}
            </Card>
          </div>
        )}

        {/* ── Form ─────────────────────────────────────── */}
        {step === 'form' && selectedSlot && (
          <div>
            <BackBtn onClick={() => setStep('calendar')} />

            {/* Selected time banner */}
            <div className="border-2 px-5 py-3.5 mb-8 flex items-center gap-3" style={{ borderColor: 'rgba(238,107,26,0.45)', background: 'rgba(238,107,26,0.07)' }}>
              <Calendar size={16} strokeWidth={2.25} style={{ color: '#EE6B1A' }} />
              <span className="text-[13px] font-semibold" style={{ color: '#F2F0EB' }}>
                {selectedSlot.dateLabel} at {selectedSlot.timeLabel}
                <span className="ml-2 font-normal" style={{ color: '#6E7681' }}>({timezoneLabel})</span>
              </span>
            </div>

            <div className="mb-8">
              <div className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] mb-4">
                <span className="inline-block h-2.5 w-2.5" style={{ background: '#EE6B1A' }} />
                <span style={{ color: '#EE6B1A' }}>Almost there</span>
              </div>
              <h1 className="text-[clamp(2rem,6vw,3rem)] font-black uppercase leading-[0.92] tracking-tight mb-2">
                A few quick details.
              </h1>
              <p className="text-[14px]" style={{ color: 'rgba(242,240,235,0.6)' }}>We&apos;ll send a confirmation to your email.</p>
            </div>

            <Card>
              <form onSubmit={handleFormSubmit}>
                <div className="grid sm:grid-cols-2 gap-5 mb-5">
                  <div>
                    <label htmlFor="book-name" className="block font-mono text-[11px] font-bold uppercase tracking-[0.2em] mb-2" style={{ color: '#6E7681' }}>
                      Name <span style={{ color: '#EE6B1A' }}>*</span>
                    </label>
                    <input id="book-name" type="text" name="name" required value={formData.name}
                      onChange={handleFormChange} placeholder="Your name"
                      className={inputCls} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
                  </div>
                  <div>
                    <label htmlFor="book-phone" className="block font-mono text-[11px] font-bold uppercase tracking-[0.2em] mb-2" style={{ color: '#6E7681' }}>
                      Phone <span style={{ color: '#EE6B1A' }}>*</span>
                    </label>
                    <input id="book-phone" type="tel" name="phone" required value={formData.phone}
                      onChange={handleFormChange} placeholder="(555) 123-4567"
                      className={inputCls} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-5 mb-5">
                  <div>
                    <label htmlFor="book-email" className="block font-mono text-[11px] font-bold uppercase tracking-[0.2em] mb-2" style={{ color: '#6E7681' }}>
                      Email <span style={{ color: '#EE6B1A' }}>*</span>
                    </label>
                    <input id="book-email" type="email" name="email" required value={formData.email}
                      onChange={handleFormChange} placeholder="you@company.com"
                      className={inputCls} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
                  </div>
                  <div>
                    <label htmlFor="book-business" className="block font-mono text-[11px] font-bold uppercase tracking-[0.2em] mb-2" style={{ color: '#6E7681' }}>
                      Business name <span style={{ color: '#EE6B1A' }}>*</span>
                    </label>
                    <input id="book-business" type="text" name="businessName" required value={formData.businessName}
                      onChange={handleFormChange} placeholder="Your business"
                      className={inputCls} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
                  </div>
                </div>
                <div className="mb-5">
                  <label htmlFor="book-message" className="block font-mono text-[11px] font-bold uppercase tracking-[0.2em] mb-2" style={{ color: '#6E7681' }}>
                    Anything we should know? <span className="normal-case tracking-normal text-[10px]">(optional)</span>
                  </label>
                  <textarea
                    id="book-message" name="message" rows={3} value={formData.message}
                    onChange={handleFormChange} placeholder="Anything you want us to know before we chat?"
                    className={`${inputCls} resize-none`} style={inputStyle}
                    onFocus={onFocus as any} onBlur={onBlur as any}
                  />
                </div>
                <div className="mb-5">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox" name="smsConsent" checked={formData.smsConsent}
                      onChange={handleFormChange}
                      className="mt-1 h-5 w-5 shrink-0" style={{ accentColor: '#EE6B1A' }}
                    />
                    <span className="text-[12px] leading-relaxed" style={{ color: '#6E7681' }}>
                      I consent to receive SMS messages from Align and Acquire. Reply STOP to opt out.
                    </span>
                  </label>
                </div>
                {formError && (
                  <p className="text-[13px] font-semibold mb-4" style={{ color: '#EE6B1A' }}>{formError}</p>
                )}
                <button
                  type="submit"
                  disabled={submitting}
                  className="aa-btn w-full py-4 text-[15px] font-bold uppercase tracking-wide flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: '#EE6B1A', color: '#16181C' }}
                >
                  {submitting ? (
                    <>
                      <Loader2 size={18} strokeWidth={2} className="animate-spin" />
                      Booking your call
                    </>
                  ) : (
                    <>
                      <Check size={18} strokeWidth={2.5} />
                      Confirm my call
                    </>
                  )}
                </button>
              </form>
            </Card>
          </div>
        )}

        {/* ── Confirmation ──────────────────────────────── */}
        {step === 'confirmation' && (
          <div className="text-center">
            <div className="inline-flex items-center justify-center h-16 w-16 border-2 mb-8 mx-auto" style={{ borderColor: '#EE6B1A' }}>
              <Check size={32} strokeWidth={2.5} style={{ color: '#EE6B1A' }} />
            </div>
            <div className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] mb-5">
              <span className="inline-block h-2.5 w-2.5" style={{ background: '#EE6B1A' }} />
              <span style={{ color: '#EE6B1A' }}>You&apos;re booked</span>
            </div>
            <h1 className="text-[clamp(2.2rem,6vw,3.8rem)] font-black uppercase leading-[0.92] tracking-tight mb-5">
              Call confirmed.
            </h1>
            {selectedSlot && (
              <div className="border-2 px-6 py-4 inline-block mb-6 text-[15px]" style={{ borderColor: 'rgba(238,107,26,0.45)', background: 'rgba(238,107,26,0.07)' }}>
                <span className="font-bold" style={{ color: '#F2F0EB' }}>
                  {selectedSlot.dateLabel} at {selectedSlot.timeLabel}
                </span>
                <span className="ml-2 text-[13px]" style={{ color: '#6E7681' }}>({timezoneLabel})</span>
              </div>
            )}
            <p className="text-[14px] mb-10" style={{ color: 'rgba(242,240,235,0.55)' }}>
              Check your email for confirmation. Talk soon. Jacob.
            </p>
            <Link
              href="/"
              className="aa-btn inline-flex items-center gap-2 px-7 py-4 text-[15px] font-bold uppercase tracking-wide"
              style={{ background: '#EE6B1A', color: '#16181C' }}
            >
              Back to home <ArrowRight size={16} strokeWidth={2.5} />
            </Link>
          </div>
        )}

      </main>
    </div>
  )
}
