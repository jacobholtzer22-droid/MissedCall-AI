'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Calendar, Check, ArrowLeft, Clock, Loader2, ArrowRight } from 'lucide-react'
import { Logo } from '@/app/components/Logo'
import { fbTrack, fbTrackCustom } from '@/lib/meta-pixel'
import { validateUsMobile } from '@/lib/phone-utils'
import BookTestimonials from '@/app/components/BookTestimonials'
import { parseAttribution, type Attribution } from '@/lib/attribution'

// ─────────────────────────────────────────────────────────
// Question options
// ─────────────────────────────────────────────────────────
const DISQUALIFY_OPTION = "I don't own a service business"

const TRADE_OPTIONS = [
  'Landscaping or lawn care',
  'Tree service',
  'HVAC',
  'Plumbing',
  'Electrical',
  'Junk removal or hauling',
  'Other home services',
  DISQUALIFY_OPTION,
] as const

const MISSED_CALL_OPTIONS = [
  '1 or 2',
  '3 to 10',
  'More than 10',
  'No idea, my phone never stops',
] as const

const WHO_ANSWERS_OPTIONS = [
  'Me, when I can',
  'It mostly goes to voicemail',
  'Office help or an answering service',
] as const

const EXTRA_NEEDS_OPTIONS = [
  'Website',
  'Ads',
  'Spam call blocking',
  'Just the Missed-Call AI system',
] as const

type Step =
  | 'landing'
  | 'trade'
  | 'missed'
  | 'answers'
  | 'contact'
  | 'calendar'
  | 'confirmation'
  | 'disqualified'

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
const STEPS: Step[] = ['trade', 'missed', 'answers', 'contact', 'calendar']
function stepNumber(s: Step) {
  const idx = STEPS.indexOf(s)
  return idx >= 0 ? idx + 1 : null
}

// Per-step analytics. Custom events on the pixel that is already loaded, so
// drop-off is measurable without adding another vendor.
const STEP_NAMES: Record<Step, string> = {
  landing: 'landing',
  trade: 'q1_business_type',
  missed: 'q2_missed_calls',
  answers: 'q3_who_answers',
  contact: 'contact',
  calendar: 'calendar',
  confirmation: 'confirmation',
  disqualified: 'disqualified',
}

const ATTRIBUTION_STORAGE_KEY = 'aa_book_attribution'

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
// Landing plus the decision to continue already count as progress, so the first
// question opens at 50%. Every step advances, none repeats a value, and the
// confirmation screen lands on 100%.
//
// These percentages are display only. STEPS / stepNumber above still drive the
// pixel step_number parameter and are deliberately left alone.
const STEP_PROGRESS: Partial<Record<Step, { pct: number; label: string }>> = {
  trade: { pct: 50, label: 'Your business' },
  missed: { pct: 62, label: 'Missed calls' },
  answers: { pct: 74, label: 'Who answers' },
  contact: { pct: 86, label: 'Your details' },
  calendar: { pct: 94, label: 'Pick a time' },
  confirmation: { pct: 100, label: 'Booked' },
}

function StepProgress({ current }: { current: Step }) {
  const entry = STEP_PROGRESS[current]
  if (!entry) return null
  const { pct, label } = entry
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.2em] mb-2" style={{ color: '#6E7681' }}>
        <span>{label}</span>
        <span style={{ color: '#EE6B1A' }}>{pct}%</span>
      </div>
      <div
        className="h-1 w-full"
        style={{ background: 'rgba(110,118,129,0.25)' }}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Progress: ${label}`}
      >
        <div
          className="h-1 transition-all duration-300"
          style={{ width: `${pct}%`, background: '#EE6B1A' }}
        />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Tap-to-answer option list
// ─────────────────────────────────────────────────────────
function ChoiceList({
  options,
  onChoose,
}: {
  options: readonly string[]
  onChoose: (value: string) => void
}) {
  return (
    <div className="grid gap-3">
      {options.map(option => (
        <button
          key={option}
          type="button"
          onClick={() => onChoose(option)}
          className="w-full border-2 px-5 py-4 text-left text-[15px] font-semibold transition-colors min-h-[56px] flex items-center justify-between gap-3"
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
          {option}
          <ArrowRight size={16} strokeWidth={2.5} style={{ color: '#EE6B1A' }} className="shrink-0" />
        </button>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────
export default function BookPage() {
  const [step, setStep] = useState<Step>('landing')
  const [days, setDays] = useState<ApiDay[]>([])
  const [loadingSlots, setLoadingSlots] = useState(true)
  const [slotsError, setSlotsError] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<SelectedSlot | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [bookingError, setBookingError] = useState('')

  // Answers
  const [tradeType, setTradeType] = useState('')
  const [missedCalls, setMissedCalls] = useState('')
  const [whoAnswers, setWhoAnswers] = useState('')
  const [extraNeeds, setExtraNeeds] = useState<string[]>([])

  const [formData, setFormData] = useState({
    firstName: '', phone: '', email: '', businessName: '', smsConsent: false,
  })
  const [contactSubmitting, setContactSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const [phoneError, setPhoneError] = useState('')
  const [partialLeadId, setPartialLeadId] = useState<string | null>(null)

  const scheduleFiredRef = useRef(false)
  const leadFiredRef = useRef(false)
  const attributionRef = useRef<Attribution>({})
  const viewedStepsRef = useRef<Set<Step>>(new Set())

  // ── Attribution: read utm_* and fbclid off the landing URL ────────────────
  // Held in a ref for the life of the funnel and mirrored into sessionStorage so
  // a refresh part way through does not lose the source.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const fromUrl = parseAttribution(window.location.search)
    if (Object.keys(fromUrl).length > 0) {
      attributionRef.current = fromUrl
      try {
        window.sessionStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(fromUrl))
      } catch {
        // Private mode or storage disabled. The ref still carries it this session.
      }
      return
    }
    try {
      const stored = window.sessionStorage.getItem(ATTRIBUTION_STORAGE_KEY)
      if (stored) attributionRef.current = JSON.parse(stored) as Attribution
    } catch {
      // Ignore unreadable storage.
    }
  }, [])

  // ── Per-step view events ──────────────────────────────────────────────────
  useEffect(() => {
    if (viewedStepsRef.current.has(step)) return
    viewedStepsRef.current.add(step)
    fbTrackCustom('FunnelStepView', {
      step_name: STEP_NAMES[step],
      step_number: stepNumber(step) ?? 0,
    })
  }, [step])

  const completeStep = useCallback((from: Step, answer?: string) => {
    fbTrackCustom('FunnelStepComplete', {
      step_name: STEP_NAMES[from],
      step_number: stepNumber(from) ?? 0,
      ...(answer ? { answer } : {}),
    })
  }, [])

  // ── Schedule event. Do not move or rename. ────────────────────────────────
  useEffect(() => {
    if (step !== 'confirmation') return
    if (scheduleFiredRef.current) return
    scheduleFiredRef.current = true
    fbTrack('Schedule')
  }, [step])

  // ── Availability. Prefetched on mount so the calendar step is instant. ────
  useEffect(() => {
    let cancelled = false
    async function loadAvailability() {
      try {
        setLoadingSlots(true)
        setSlotsError(null)
        const res = await fetch('/api/marketing-bookings', { method: 'GET' })
        if (!res.ok) throw new Error('Failed to load availability')
        const data = (await res.json()) as { days?: ApiDay[]; calendarUnavailable?: boolean }
        if (cancelled) return
        if (data.calendarUnavailable) {
          setDays([])
          setSlotsError(
            'I cannot read my calendar right now, so I am not showing times I might not be free for. Try again in a few minutes or email jacob@alignandacquire.com.'
          )
          return
        }
        const loaded = data.days || []
        setDays(loaded)
        const firstWithSlots = loaded.find(d => d.slots.length > 0) ?? loaded[0]
        setSelectedDate(firstWithSlots?.date ?? null)
      } catch {
        if (cancelled) return
        setSlotsError('Unable to load times right now. Please try again in a moment.')
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
    return days.find(d => d.date === selectedDate)?.slots ?? []
  }, [days, selectedDate])

  function dayHeadline(day: ApiDay, index: number): string {
    if (day.isToday) return 'Today'
    if (index === 1) return 'Tomorrow'
    return day.label.split(' ')[0]
  }

  function handleFormChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, type } = e.target
    if (name === 'phone') setPhoneError('')
    setFormError('')
    if (type === 'checkbox' && name === 'smsConsent') {
      setFormData(prev => ({ ...prev, smsConsent: e.target.checked }))
    } else {
      setFormData(prev => ({ ...prev, [name]: e.target.value }))
    }
  }

  function toggleExtraNeed(option: string) {
    setExtraNeeds(prev =>
      prev.includes(option) ? prev.filter(item => item !== option) : [...prev, option]
    )
  }

  function chooseTrade(value: string) {
    setTradeType(value)
    completeStep('trade', value)
    if (value === DISQUALIFY_OPTION) {
      fbTrackCustom('FunnelDisqualified', { reason: 'not_a_service_business' })
      setStep('disqualified')
      return
    }
    setStep('missed')
  }

  function chooseMissed(value: string) {
    setMissedCalls(value)
    completeStep('missed', value)
    setStep('answers')
  }

  function chooseWhoAnswers(value: string) {
    setWhoAnswers(value)
    completeStep('answers', value)
    setStep('contact')
  }

  // ── Contact step. Saves the partial lead, fires Lead, then shows times. ────
  async function handleContactSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    if (!formData.firstName.trim()) { setFormError('Please enter your first name.'); return }
    const phoneCheck = validateUsMobile(formData.phone)
    if (!phoneCheck.ok) { setPhoneError(phoneCheck.reason); setFormError(phoneCheck.reason); return }
    setPhoneError('')
    if (!formData.businessName.trim()) { setFormError('Please enter your business name.'); return }
    if (!formData.email.trim()) { setFormError('Please enter your email.'); return }
    if (!formData.smsConsent) { setFormError('Please check the box so I can text you the details.'); return }

    setContactSubmitting(true)
    try {
      // Capture the lead before the calendar renders. Anyone who stops here is
      // still a callable lead. A failure must never block the funnel.
      const res = await fetch('/api/marketing-bookings/partial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: formData.firstName.trim(),
          phone: phoneCheck.e164,
          email: formData.email.trim(),
          businessName: formData.businessName.trim(),
          smsConsent: formData.smsConsent,
          tradeType,
          missedCalls,
          whoAnswers,
          interests: extraNeeds,
          attribution: attributionRef.current,
        }),
      })
      if (res.ok) {
        const data = await res.json().catch(() => ({}))
        if (data?.leadId) setPartialLeadId(data.leadId as string)
      } else {
        console.error('[book] partial lead capture failed with status', res.status)
      }
    } catch (err) {
      console.error('[book] partial lead capture failed', err)
    } finally {
      setContactSubmitting(false)
    }

    if (!leadFiredRef.current) {
      leadFiredRef.current = true
      fbTrack('Lead')
    }
    completeStep('contact')
    setStep('calendar')
  }

  // ── Calendar step. Picking a slot books it. ───────────────────────────────
  async function handleSelectSlot(slot: { iso: string; display: string }) {
    if (submitting) return
    const day = days.find(d => d.date === selectedDate)
    if (!day) return

    // Already validated at the contact step; recompute so the canonical E.164
    // is what gets booked, and fall back to the raw value rather than blocking.
    const phoneCheckForBooking = validateUsMobile(formData.phone)
    const phoneForBooking = phoneCheckForBooking.ok ? phoneCheckForBooking.e164 : formData.phone.trim()

    setSubmitting(true)
    setBookingError('')
    try {
      const res = await fetch('/api/marketing-bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.firstName.trim(),
          phone: phoneForBooking,
          email: formData.email.trim(),
          businessName: formData.businessName.trim(),
          tradeType,
          missedCalls,
          whoAnswers,
          extraNeeds,
          smsConsent: formData.smsConsent,
          slotStart: slot.iso,
          partialLeadId,
          attribution: attributionRef.current,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Could not book that time.')
      }
      setSelectedSlot({ iso: slot.iso, dateLabel: day.label, timeLabel: slot.display })
      completeStep('calendar', slot.display)
      setStep('confirmation')
    } catch (err) {
      setBookingError(err instanceof Error ? err.message : 'Something went wrong. Please try another time.')
    } finally {
      setSubmitting(false)
    }
  }

  const showHeaderNav = step !== 'landing'

  return (
    <div className="min-h-dvh aa-grid-bg" style={{ background: '#16181C', color: '#F2F0EB' }}>

      {/* ── Header. No nav on the landing view. ─────────── */}
      <header className="border-b-2" style={{ borderColor: 'rgba(110,118,129,0.28)', background: 'rgba(22,24,28,0.95)' }}>
        <div className="mx-auto max-w-5xl px-5 sm:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo size="sm" />
            <div className="hidden sm:flex flex-col leading-none">
              <span className="text-[14px] font-extrabold tracking-tight" style={{ color: '#F2F0EB' }}>Align and Acquire</span>
              <span className="font-mono text-[9px] uppercase tracking-[0.22em] mt-0.5" style={{ color: '#6E7681' }}>Missed-call lead capture</span>
            </div>
          </div>
          {showHeaderNav && (
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
          )}
        </div>
      </header>

      {/* ── Hazard stripe ──────────────────────────────── */}
      <div className="aa-hazard" />

      <main className="mx-auto max-w-2xl px-5 sm:px-8 py-12 md:py-16">

        {/* ── Landing ──────────────────────────────────── */}
        {step === 'landing' && (
          <div>
            <div className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] mb-5">
              <span className="inline-block h-2.5 w-2.5" style={{ background: '#EE6B1A' }} />
              <span style={{ color: '#EE6B1A' }}>Free live demo</span>
            </div>
            <h1 className="text-[clamp(2.1rem,6.5vw,3.6rem)] font-black uppercase leading-[0.92] tracking-tight mb-5">
              Your missed calls, texted back in 8 seconds. Booked on your calendar.
            </h1>
            <p className="text-[17px] leading-relaxed mb-10" style={{ color: 'rgba(242,240,235,0.7)' }}>
              Watch it happen live on your own line.
            </p>
            <BookTestimonials />
            <button
              type="button"
              onClick={() => { completeStep('landing'); setStep('trade') }}
              className="aa-btn inline-flex items-center gap-2 px-8 py-4 text-[16px] font-bold uppercase tracking-wide w-full sm:w-auto justify-center"
              style={{ background: '#EE6B1A', color: '#16181C' }}
            >
              Show me <ArrowRight size={17} strokeWidth={2.5} />
            </button>
          </div>
        )}

        {/* ── Q1: business type ────────────────────────── */}
        {step === 'trade' && (
          <div>
            <BackBtn onClick={() => setStep('landing')} />
            <StepProgress current={step} />
            <h1 className="text-[clamp(1.9rem,5.5vw,3rem)] font-black uppercase leading-[0.94] tracking-tight mb-7">
              What kind of business do you run?
            </h1>
            <Card>
              <ChoiceList options={TRADE_OPTIONS} onChoose={chooseTrade} />
            </Card>
          </div>
        )}

        {/* ── Q2: missed calls ─────────────────────────── */}
        {step === 'missed' && (
          <div>
            <BackBtn onClick={() => setStep('trade')} />
            <StepProgress current={step} />
            <h1 className="text-[clamp(1.9rem,5.5vw,3rem)] font-black uppercase leading-[0.94] tracking-tight mb-7">
              How many calls do you miss in a typical week?
            </h1>
            <Card>
              <ChoiceList options={MISSED_CALL_OPTIONS} onChoose={chooseMissed} />
            </Card>
          </div>
        )}

        {/* ── Q3: who answers ──────────────────────────── */}
        {step === 'answers' && (
          <div>
            <BackBtn onClick={() => setStep('missed')} />
            <StepProgress current={step} />
            <h1 className="text-[clamp(1.9rem,5.5vw,3rem)] font-black uppercase leading-[0.94] tracking-tight mb-7">
              Who answers your phone right now?
            </h1>
            <Card>
              <ChoiceList options={WHO_ANSWERS_OPTIONS} onChoose={chooseWhoAnswers} />
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
              Looks like we are not the right fit right now.
            </h1>
            <p className="text-[15px] leading-relaxed max-w-md mx-auto mb-10" style={{ color: 'rgba(242,240,235,0.65)' }}>
              This system is built for service businesses that miss calls while they are on a job. Thanks for taking a look. If that changes, come back any time.
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

        {/* ── Contact, before the calendar ──────────────── */}
        {step === 'contact' && (
          <div>
            <BackBtn onClick={() => setStep('answers')} />
            <StepProgress current={step} />
            <div className="mb-8">
              <h1 className="text-[clamp(1.9rem,5.5vw,3rem)] font-black uppercase leading-[0.94] tracking-tight mb-3">
                Where should I text your demo details?
              </h1>
              <p className="text-[14px]" style={{ color: 'rgba(242,240,235,0.6)' }}>
                Then you pick a time on the next screen.
              </p>
            </div>

            <Card>
              <form onSubmit={handleContactSubmit}>
                <div className="grid sm:grid-cols-2 gap-5 mb-5">
                  <div>
                    <label htmlFor="book-first-name" className="block font-mono text-[11px] font-bold uppercase tracking-[0.2em] mb-2" style={{ color: '#6E7681' }}>
                      First name <span style={{ color: '#EE6B1A' }}>*</span>
                    </label>
                    <input id="book-first-name" type="text" name="firstName" required value={formData.firstName}
                      onChange={handleFormChange} placeholder="Your first name" autoComplete="given-name"
                      className={inputCls} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
                  </div>
                  <div>
                    <label htmlFor="book-phone" className="block font-mono text-[11px] font-bold uppercase tracking-[0.2em] mb-2" style={{ color: '#6E7681' }}>
                      Mobile <span style={{ color: '#EE6B1A' }}>*</span>
                    </label>
                    <input id="book-phone" type="tel" name="phone" required value={formData.phone}
                      inputMode="tel" autoComplete="tel" placeholder="(555) 123-4567"
                      onChange={handleFormChange}
                      aria-invalid={phoneError ? true : undefined}
                      aria-describedby={phoneError ? 'book-phone-error' : undefined}
                      className={inputCls}
                      style={phoneError ? { ...inputStyle, borderColor: '#EE6B1A' } : inputStyle}
                      onFocus={onFocus}
                      onBlur={(ev) => {
                        onBlur(ev)
                        const value = ev.currentTarget.value
                        if (!value.trim()) return
                        const check = validateUsMobile(value)
                        setPhoneError(check.ok ? '' : check.reason)
                      }} />
                    {phoneError && (
                      <p id="book-phone-error" className="mt-2 text-[12px] font-semibold" style={{ color: '#EE6B1A' }}>
                        {phoneError}
                      </p>
                    )}
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-5 mb-5">
                  <div>
                    <label htmlFor="book-business" className="block font-mono text-[11px] font-bold uppercase tracking-[0.2em] mb-2" style={{ color: '#6E7681' }}>
                      Business name <span style={{ color: '#EE6B1A' }}>*</span>
                    </label>
                    <input id="book-business" type="text" name="businessName" required value={formData.businessName}
                      onChange={handleFormChange} placeholder="Your business" autoComplete="organization"
                      className={inputCls} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
                  </div>
                  <div>
                    <label htmlFor="book-email" className="block font-mono text-[11px] font-bold uppercase tracking-[0.2em] mb-2" style={{ color: '#6E7681' }}>
                      Email <span style={{ color: '#EE6B1A' }}>*</span>
                    </label>
                    <input id="book-email" type="email" name="email" required value={formData.email}
                      onChange={handleFormChange} placeholder="you@company.com" autoComplete="email"
                      className={inputCls} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
                  </div>
                </div>

                {/* Optional interests. Was its own step, now folded in here. */}
                <div className="mb-5">
                  <span className="block font-mono text-[11px] font-bold uppercase tracking-[0.2em] mb-3" style={{ color: '#6E7681' }}>
                    What are you interested in? <span className="normal-case tracking-normal text-[10px]">(optional)</span>
                  </span>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {EXTRA_NEEDS_OPTIONS.map(opt => {
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
                  disabled={contactSubmitting}
                  className="aa-btn w-full py-4 text-[15px] font-bold uppercase tracking-wide flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: '#EE6B1A', color: '#16181C' }}
                >
                  {contactSubmitting ? (
                    <><Loader2 size={18} strokeWidth={2} className="animate-spin" />Saving</>
                  ) : (
                    <>See available times <ArrowRight size={16} strokeWidth={2.5} /></>
                  )}
                </button>
              </form>
            </Card>
          </div>
        )}

        {/* ── Calendar ─────────────────────────────────── */}
        {step === 'calendar' && (
          <div>
            <BackBtn onClick={() => setStep('contact')} />
            <StepProgress current={step} />
            <div className="mb-8">
              <h1 className="text-[clamp(1.8rem,5vw,2.9rem)] font-black uppercase leading-[0.94] tracking-tight mb-3">
                Pick a time. I&apos;ll call your line and you&apos;ll watch the text-back happen in 8 seconds.
              </h1>
              <p className="text-[14px]" style={{ color: 'rgba(242,240,235,0.6)' }}>
                Takes about 15 minutes. Pick today or tomorrow if you want to see it fast.
              </p>
            </div>

            <Card>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em]" style={{ color: '#6E7681' }}>
                  <Calendar size={14} strokeWidth={2.25} style={{ color: '#EE6B1A' }} />
                  Soonest times first
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
                  {/* Date row. Today and tomorrow are called out. */}
                  <div className="flex gap-2 overflow-x-auto pb-3 mb-6 [-webkit-overflow-scrolling:touch] [scrollbar-width:none]">
                    {days.map((day, index) => {
                      const isSelected = day.date === selectedDate
                      const hasSlots = day.slots.length > 0
                      const isSoon = index <= 1
                      return (
                        <button
                          key={day.date}
                          type="button"
                          onClick={() => setSelectedDate(day.date)}
                          disabled={!hasSlots}
                          className="min-w-[104px] px-3 py-3 border-2 text-left text-[12px] transition-colors shrink-0"
                          style={{
                            borderColor: isSelected ? '#EE6B1A' : isSoon && hasSlots ? 'rgba(238,107,26,0.5)' : 'rgba(110,118,129,0.35)',
                            background: isSelected ? 'rgba(238,107,26,0.1)' : isSoon && hasSlots ? 'rgba(238,107,26,0.04)' : 'transparent',
                            color: hasSlots ? (isSelected ? '#F2F0EB' : '#6E7681') : 'rgba(110,118,129,0.4)',
                            cursor: hasSlots ? 'pointer' : 'not-allowed',
                          }}
                        >
                          <div className="font-bold uppercase tracking-wide text-[11px]" style={{ color: isSoon && hasSlots ? '#EE6B1A' : undefined }}>
                            {dayHeadline(day, index)}
                          </div>
                          <div className="text-[11px] mt-0.5" style={{ color: '#6E7681' }}>
                            {day.label.split(' ').slice(1).join(' ')}
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
                      Tap a time to lock it in
                    </div>
                    {daySlots.length === 0 ? (
                      <p className="text-[13px]" style={{ color: '#6E7681' }}>
                        Nothing left on this day. Try another date.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {daySlots.map(slot => (
                          <button
                            key={slot.iso}
                            type="button"
                            disabled={submitting}
                            onClick={() => handleSelectSlot(slot)}
                            className="px-4 py-2.5 border-2 text-[13px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            style={{ borderColor: 'rgba(110,118,129,0.35)', color: '#F2F0EB', background: 'transparent' }}
                            onMouseEnter={e => {
                              if (submitting) return
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

                  {submitting && (
                    <p className="flex items-center gap-2 text-[13px] mt-6" style={{ color: '#EE6B1A' }}>
                      <Loader2 size={15} strokeWidth={2} className="animate-spin" />
                      Locking in your time
                    </p>
                  )}

                  {bookingError && (
                    <p className="text-[13px] font-semibold mt-6" style={{ color: '#EE6B1A' }}>{bookingError}</p>
                  )}

                  <p className="font-mono text-[10px] uppercase tracking-widest mt-8" style={{ color: 'rgba(110,118,129,0.55)' }}>
                    8:00 AM to 8:00 PM Eastern Time · 15-minute demo
                  </p>
                </>
              )}
            </Card>
          </div>
        )}

        {/* ── Confirmation ──────────────────────────────── */}
        {step === 'confirmation' && (
          <div className="text-center">
            <div className="text-left">
              <StepProgress current={step} />
            </div>
            <div className="inline-flex items-center justify-center h-16 w-16 border-2 mb-8 mx-auto" style={{ borderColor: '#EE6B1A' }}>
              <Check size={32} strokeWidth={2.5} style={{ color: '#EE6B1A' }} />
            </div>
            <div className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] mb-5">
              <span className="inline-block h-2.5 w-2.5" style={{ background: '#EE6B1A' }} />
              <span style={{ color: '#EE6B1A' }}>You&apos;re booked</span>
            </div>
            <h1 className="text-[clamp(2.2rem,6vw,3.8rem)] font-black uppercase leading-[0.92] tracking-tight mb-5">
              Locked in.
            </h1>
            {selectedSlot && (
              <div className="border-2 px-6 py-4 inline-block mb-8 text-[15px]" style={{ borderColor: 'rgba(238,107,26,0.45)', background: 'rgba(238,107,26,0.07)' }}>
                <span className="font-bold" style={{ color: '#F2F0EB' }}>
                  {selectedSlot.dateLabel} at {selectedSlot.timeLabel}
                </span>
                <span className="ml-2 text-[13px]" style={{ color: '#6E7681' }}>({timezoneLabel})</span>
              </div>
            )}

            <div className="border-2 p-6 text-left max-w-md mx-auto mb-8" style={{ borderColor: 'rgba(110,118,129,0.35)', background: 'rgba(242,240,235,0.03)' }}>
              <p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] mb-4" style={{ color: '#6E7681' }}>
                What happens on the call
              </p>
              <ol className="space-y-3 text-[14px] leading-relaxed" style={{ color: 'rgba(242,240,235,0.75)' }}>
                <li>1. I call your business line and let it ring out, like a customer would.</li>
                <li>2. You watch the text back land on my phone in 8 seconds.</li>
                <li>3. I show you what happens when that lead replies and books itself in.</li>
                <li>4. You ask whatever you want. If it is not a fit, no hard feelings.</li>
              </ol>
            </div>

            <p className="text-[14px] mb-10" style={{ color: 'rgba(242,240,235,0.55)' }}>
              You&apos;ll get a text from me confirming. Talk soon. Jacob.
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
