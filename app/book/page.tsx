'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Calendar, Check, ArrowLeft, Clock, Loader2 } from 'lucide-react'
import { Logo } from '@/app/components/Logo'

// Step 4 — "Do you need help with anything else?" multi-select options.
const EXTRA_NEEDS_OPTIONS = [
  'Website',
  'Ads',
  'Spam call blocking',
  'Just the Missed-Call AI system',
] as const

// Selecting this alone (or nothing) means they only want the core product —
// no extra consultation services. Kept in sync with the API route's derivation.
const JUST_AI_OPTION = 'Just the Missed-Call AI system'

type Step =
  | 'qualify-business' // Step 1: do you run a service-based business?
  | 'disqualified' // dead-end for "No"
  | 'qualify-trade' // Step 2: what kind of service business?
  | 'qualify-misses' // Step 3: how many calls do you miss?
  | 'qualify-needs' // Step 4: need help with anything else?
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

export default function BookPage() {
  const [step, setStep] = useState<Step>('qualify-business')
  const [days, setDays] = useState<ApiDay[]>([])
  const [loadingSlots, setLoadingSlots] = useState(true)
  const [slotsError, setSlotsError] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<SelectedSlot | null>(null)

  // Pre-qualification answers (Steps 2–4)
  const [tradeType, setTradeType] = useState('')
  const [missedCalls, setMissedCalls] = useState('')
  const [extraNeeds, setExtraNeeds] = useState<string[]>([])

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    businessName: '',
    message: '',
    smsConsent: false,
  })
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  // Part 3: fire the Meta Pixel 'Schedule' conversion exactly once, only after a
  // booking is successfully created (step flips to 'confirmation'). One-shot guard
  // so it never fires on re-render — and never for disqualified visitors, who
  // never reach this state.
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
        if (!res.ok) {
          throw new Error('Failed to load availability')
        }
        const data = (await res.json()) as { days: ApiDay[] }
        if (cancelled) return
        setDays(data.days || [])
        const today = data.days.find((d) => d.isToday) ?? data.days[0]
        setSelectedDate(today?.date ?? null)
      } catch (err) {
        if (cancelled) return
        setSlotsError('Unable to load availability right now. Please try again in a moment.')
      } finally {
        if (!cancelled) {
          setLoadingSlots(false)
        }
      }
    }
    loadAvailability()
    return () => {
      cancelled = true
    }
  }, [])

  const timezoneLabel = useMemo(() => {
    return days[0]?.timezoneLabel ?? 'Eastern Time (ET)'
  }, [days])

  const daySlots = useMemo(() => {
    if (!selectedDate) return []
    const day = days.find((d) => d.date === selectedDate)
    return day?.slots ?? []
  }, [days, selectedDate])

  function handleSelectSlot(slot: { iso: string; display: string }) {
    const day = days.find((d) => d.date === selectedDate)
    if (!day) return
    setSelectedSlot({
      iso: slot.iso,
      dateLabel: day.label,
      timeLabel: slot.display,
    })
    setStep('form')
  }

  function handleFormChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const { name, type } = e.target
    setFormError('')
    if (type === 'checkbox' && name === 'smsConsent') {
      const target = e.target as HTMLInputElement
      setFormData((prev) => ({ ...prev, smsConsent: target.checked }))
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
    if (!selectedSlot) {
      setFormError('Please select a time slot first.')
      return
    }
    if (!formData.name.trim()) {
      setFormError('Please enter your name.')
      return
    }
    if (!formData.email.trim()) {
      setFormError('Please enter your email.')
      return
    }
    if (!formData.phone.trim()) {
      setFormError('Please enter your phone number.')
      return
    }
    if (!formData.businessName.trim()) {
      setFormError('Please enter your business name.')
      return
    }
    if (!formData.smsConsent) {
      setFormError('Please consent to SMS so we can send confirmations.')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/marketing-bookings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name.trim(),
          phone: formData.phone.trim(),
          email: formData.email.trim(),
          businessName: formData.businessName.trim(),
          // Pre-qualification answers (Steps 2–4) threaded to the booking.
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

  const cardWrapClass = 'relative'
  const cardGlowClass =
    'absolute inset-0 bg-gradient-to-r from-blue-600/20 to-purple-600/20 rounded-3xl blur-2xl'
  const cardClass =
    'relative bg-gray-900/90 backdrop-blur-sm border border-white/10 rounded-3xl p-6 md:p-8'

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="absolute inset-0 gradient-mesh" aria-hidden />
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl" />
      </div>

      <header className="relative z-10 border-b border-white/10 bg-gray-950/80 backdrop-blur-lg">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3">
              <Logo size="lg" className="shrink-0" />
              <span className="text-xl font-bold text-white">Align and Acquire</span>
            </Link>
            <Link
              href="/"
              className="text-gray-400 hover:text-white transition inline-flex items-center gap-2 text-sm"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to home
            </Link>
          </div>
        </div>
      </header>

      <main className="relative z-10 container mx-auto px-6 py-12 md:py-16 max-w-4xl">
        {/* Step 1: Do you run a service-based business? */}
        {step === 'qualify-business' && (
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-10">
              <h1 className="text-4xl md:text-5xl font-bold mb-3">Let&apos;s see if we&apos;re a fit</h1>
              <p className="text-gray-400 text-lg">A couple quick questions before we grab a time.</p>
            </div>
            <div className={cardWrapClass}>
              <div className={cardGlowClass} />
              <div className={cardClass}>
                <p className="text-xl md:text-2xl font-semibold mb-6 text-center">
                  Do you run a service-based business?
                </p>
                <div className="grid sm:grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => setStep('qualify-trade')}
                    className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-4 rounded-xl text-lg font-semibold hover:from-blue-500 hover:to-purple-500 transition-all"
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep('disqualified')}
                    className="w-full bg-white/5 border border-white/10 text-gray-200 py-4 rounded-xl text-lg font-semibold hover:bg-white/10 transition-all"
                  >
                    No
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Dead-end for non-service businesses — no calendar, no booking. */}
        {step === 'disqualified' && (
          <div className="text-center max-w-xl mx-auto">
            <h1 className="text-3xl md:text-4xl font-bold mb-4">
              Looks like we&apos;re not the right fit right now
            </h1>
            <p className="text-gray-300 text-lg mb-10">
              Our system is built specifically for service-based businesses. Thanks for checking us
              out — if that changes down the road, we&apos;d love to talk.
            </p>
            <Link
              href="/"
              className="cta-hover inline-flex items-center justify-center bg-white text-gray-900 px-8 py-4 rounded-xl text-lg font-semibold hover:bg-gray-100 transition"
            >
              Back to home
            </Link>
          </div>
        )}

        {/* Step 2: What kind of service business? */}
        {step === 'qualify-trade' && (
          <div className="max-w-2xl mx-auto">
            <button
              type="button"
              onClick={() => setStep('qualify-business')}
              className="text-gray-400 hover:text-white transition text-sm mb-6 inline-flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <div className={cardWrapClass}>
              <div className={cardGlowClass} />
              <div className={cardClass}>
                <label htmlFor="qualify-trade-input" className="block text-xl md:text-2xl font-semibold mb-6">
                  What kind of service business?
                </label>
                <input
                  id="qualify-trade-input"
                  type="text"
                  value={tradeType}
                  onChange={(e) => setTradeType(e.target.value)}
                  placeholder="e.g. Plumbing, HVAC, Landscaping, Auto Detailing"
                  autoFocus
                  className="w-full px-4 py-3 bg-gray-800 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                />
                <button
                  type="button"
                  onClick={() => setStep('qualify-misses')}
                  disabled={!tradeType.trim()}
                  className="mt-6 w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-4 rounded-xl text-lg font-semibold hover:from-blue-500 hover:to-purple-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: How many calls do you miss a week or month? */}
        {step === 'qualify-misses' && (
          <div className="max-w-2xl mx-auto">
            <button
              type="button"
              onClick={() => setStep('qualify-trade')}
              className="text-gray-400 hover:text-white transition text-sm mb-6 inline-flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <div className={cardWrapClass}>
              <div className={cardGlowClass} />
              <div className={cardClass}>
                <label htmlFor="qualify-misses-input" className="block text-xl md:text-2xl font-semibold mb-6">
                  Roughly how many calls do you miss a week or month?
                </label>
                <input
                  id="qualify-misses-input"
                  type="text"
                  value={missedCalls}
                  onChange={(e) => setMissedCalls(e.target.value)}
                  placeholder="e.g. 10–15 a week, not sure, a ton"
                  autoFocus
                  className="w-full px-4 py-3 bg-gray-800 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                />
                <button
                  type="button"
                  onClick={() => setStep('qualify-needs')}
                  disabled={!missedCalls.trim()}
                  className="mt-6 w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-4 rounded-xl text-lg font-semibold hover:from-blue-500 hover:to-purple-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Need help with anything else? (multi-select) */}
        {step === 'qualify-needs' && (
          <div className="max-w-2xl mx-auto">
            <button
              type="button"
              onClick={() => setStep('qualify-misses')}
              className="text-gray-400 hover:text-white transition text-sm mb-6 inline-flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <div className={cardWrapClass}>
              <div className={cardGlowClass} />
              <div className={cardClass}>
                <p className="block text-xl md:text-2xl font-semibold mb-6">
                  Do you need help with anything else?
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {EXTRA_NEEDS_OPTIONS.map((opt) => {
                    const isSelected = extraNeeds.includes(opt)
                    return (
                      <label
                        key={opt}
                        className={`group relative flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm font-medium transition
                          ${
                            isSelected
                              ? 'border-blue-400 bg-gradient-to-r from-blue-600/70 to-purple-600/70 text-white shadow-lg shadow-blue-500/30'
                              : 'border-white/10 bg-gray-800/70 text-gray-200 hover:border-blue-500/60 hover:bg-gray-800'
                          }`}
                      >
                        <span className="flex-1">{opt}</span>
                        <span
                          className={`flex h-5 w-5 items-center justify-center rounded-md border text-[10px] transition
                            ${
                              isSelected
                                ? 'border-transparent bg-white text-blue-600'
                                : 'border-white/30 bg-black/20 text-transparent group-hover:text-white/60'
                            }`}
                        >
                          <Check className="h-3 w-3" />
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
                  className="mt-6 w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-4 rounded-xl text-lg font-semibold hover:from-blue-500 hover:to-purple-500 transition-all"
                >
                  Continue to scheduling
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 'calendar' && (
          <>
            <button
              type="button"
              onClick={() => setStep('qualify-needs')}
              className="text-gray-400 hover:text-white transition text-sm mb-6 inline-flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <div className="text-center mb-10">
              <h1 className="text-4xl md:text-5xl font-bold mb-3">
                Let&apos;s Talk — Pick a Time That Works
              </h1>
              <p className="text-gray-400 text-lg max-w-2xl mx-auto">
                Book a free strategy call. No pitch, no pressure. Just a conversation about what your business needs.
              </p>
            </div>

            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-purple-600/20 rounded-3xl blur-2xl" />
              <div className="relative bg-gray-900/90 backdrop-blur-sm border border-white/10 rounded-3xl p-6 md:p-8">
                <div className="flex items-center justify-between gap-3 text-gray-400 mb-6">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    <span className="font-medium">Availability (Next 2 Weeks)</span>
                  </div>
                  <span className="text-xs md:text-sm font-medium text-blue-300">
                    Timezone: {timezoneLabel}
                  </span>
                </div>

                {loadingSlots ? (
                  <div className="flex flex-col items-center justify-center py-10 text-gray-400 gap-3">
                    <Loader2 className="h-6 w-6 animate-spin" />
                    <p className="text-sm">Loading available times…</p>
                  </div>
                ) : slotsError ? (
                  <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
                    {slotsError}
                  </div>
                ) : (
                  <>
                    <div className="flex gap-2 overflow-x-auto pb-3 mb-4 [-webkit-overflow-scrolling:touch]">
                      {days.map((day) => {
                        const isSelected = day.date === selectedDate
                        const hasSlots = day.slots.length > 0
                        return (
                          <button
                            key={day.date}
                            type="button"
                            onClick={() => setSelectedDate(day.date)}
                            className={[
                              'min-w-[110px] px-3 py-2 rounded-xl border text-left text-sm transition',
                              hasSlots
                                ? 'cursor-pointer'
                                : 'cursor-not-allowed opacity-50',
                              isSelected
                                ? 'border-blue-400 bg-blue-500/20 text-white shadow-lg shadow-blue-500/30'
                                : 'border-white/10 bg-white/5 text-gray-200 hover:border-blue-400/60 hover:bg-blue-500/10',
                              day.isToday ? 'ring-1 ring-blue-500/60' : '',
                            ].join(' ')}
                            disabled={!hasSlots}
                          >
                            <div className="font-semibold">
                              {day.isToday ? 'Today' : day.label.split(' ')[0]}
                            </div>
                            <div className="text-xs text-gray-400">
                              {day.isToday ? day.label : day.label.split(' ').slice(1).join(' ')}
                            </div>
                            <div className="mt-1 text-[11px] text-gray-500">
                              {hasSlots ? `${day.slots.length} slots` : 'No slots'}
                            </div>
                          </button>
                        )
                      })}
                    </div>

                    <div className="mt-4">
                      <p className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                        <Clock className="h-4 w-4 text-blue-400" />
                        Select a time
                      </p>
                      {daySlots.length === 0 ? (
                        <p className="text-sm text-gray-500">
                          No remaining availability for this day. Try another date.
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {daySlots.map((slot) => (
                            <button
                              key={slot.iso}
                              type="button"
                              onClick={() => handleSelectSlot(slot)}
                              className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-gray-200 hover:bg-blue-500/20 hover:border-blue-500/40 hover:text-white transition font-medium text-sm"
                            >
                              <Clock className="inline h-4 w-4 mr-1.5 -mt-0.5 opacity-70" />
                              {slot.display}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}

                <p className="text-gray-500 text-xs mt-6">
                  Calls are available from 8:00 AM – 4:00 PM Eastern Time, every day, with 30 minute slots and a short buffer between each call. You&apos;ll only see times that are actually open.
                </p>
              </div>
            </div>
          </>
        )}

        {step === 'form' && selectedSlot && (
          <>
            <button
              type="button"
              onClick={() => setStep('calendar')}
              className="text-gray-400 hover:text-white transition text-sm mb-6 inline-flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Change time
            </button>
            <div className="mb-8 p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-200">
              <span className="font-medium">Selected: </span>
              {selectedSlot.dateLabel} at {selectedSlot.timeLabel} ({timezoneLabel})
            </div>

            <div className="text-center mb-8">
              <h1 className="text-3xl md:text-4xl font-bold mb-2">Almost there — a few details</h1>
              <p className="text-gray-400">We&apos;ll send a confirmation to your email.</p>
            </div>

            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-purple-600/20 rounded-3xl blur-2xl" />
              <form
                onSubmit={handleFormSubmit}
                className="relative bg-gray-900/90 backdrop-blur-sm border border-white/10 rounded-3xl p-6 md:p-8"
              >
                <div className="grid sm:grid-cols-2 gap-5 mb-5">
                  <div>
                    <label htmlFor="book-name" className="block text-sm font-medium text-gray-300 mb-2">
                      Name <span className="text-red-400">*</span>
                    </label>
                    <input
                      id="book-name"
                      type="text"
                      name="name"
                      required
                      value={formData.name}
                      onChange={handleFormChange}
                      placeholder="Your name"
                      className="w-full px-4 py-3 bg-gray-800 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                    />
                  </div>
                  <div>
                    <label htmlFor="book-phone" className="block text-sm font-medium text-gray-300 mb-2">
                      Phone <span className="text-red-400">*</span>
                    </label>
                    <input
                      id="book-phone"
                      type="tel"
                      name="phone"
                      required
                      value={formData.phone}
                      onChange={handleFormChange}
                      placeholder="(555) 123-4567"
                      className="w-full px-4 py-3 bg-gray-800 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                    />
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-5 mb-5">
                  <div>
                    <label htmlFor="book-email" className="block text-sm font-medium text-gray-300 mb-2">
                      Email <span className="text-red-400">*</span>
                    </label>
                    <input
                      id="book-email"
                      type="email"
                      name="email"
                      required
                      value={formData.email}
                      onChange={handleFormChange}
                      placeholder="you@company.com"
                      className="w-full px-4 py-3 bg-gray-800 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                    />
                  </div>
                  <div>
                    <label htmlFor="book-business" className="block text-sm font-medium text-gray-300 mb-2">
                      Business Name <span className="text-red-400">*</span>
                    </label>
                    <input
                      id="book-business"
                      type="text"
                      name="businessName"
                      value={formData.businessName}
                      onChange={handleFormChange}
                      placeholder="Your business"
                      className="w-full px-4 py-3 bg-gray-800 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                    />
                  </div>
                </div>
                <div className="mb-6">
                  <label htmlFor="book-message" className="block text-sm font-medium text-gray-300 mb-2">
                    Anything else we should know? <span className="text-gray-500 text-xs">(optional)</span>
                  </label>
                  <textarea
                    id="book-message"
                    name="message"
                    rows={3}
                    value={formData.message}
                    onChange={handleFormChange}
                    placeholder="Anything you want us to know before we chat?"
                    className="w-full px-4 py-3 bg-gray-800 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition resize-none"
                  />
                </div>
                <div className="mb-6">
                  <label className="flex items-start gap-3 text-sm text-gray-300">
                    <input
                      type="checkbox"
                      name="smsConsent"
                      checked={formData.smsConsent}
                      onChange={handleFormChange}
                      className="mt-1 h-4 w-4 rounded border border-white/20 bg-gray-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
                    />
                    <span>
                      I consent to receive SMS messages from Align and Acquire. Reply STOP to opt out.
                    </span>
                  </label>
                </div>
                {formError && <p className="text-red-400 text-sm mb-4">{formError}</p>}
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-4 rounded-xl text-lg font-semibold hover:from-blue-500 hover:to-purple-500 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Booking your call…
                    </>
                  ) : (
                    <>
                      <Check className="h-5 w-5" />
                      Confirm My Call
                    </>
                  )}
                </button>
              </form>
            </div>
          </>
        )}

        {step === 'confirmation' && (
          <div className="text-center max-w-xl mx-auto">
            <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <Check className="h-10 w-10 text-green-400" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold mb-3">You&apos;re booked! ✓</h1>
            <p className="text-gray-300 text-lg mb-6">
              {selectedSlot && (
                <>
                  Your call is scheduled for{' '}
                  <span className="font-semibold">
                    {selectedSlot.dateLabel} at {selectedSlot.timeLabel} ({timezoneLabel})
                  </span>
                  .
                </>
              )}
            </p>
            <p className="text-gray-500 text-sm mb-10">
              Check your email for confirmation. Talk soon — Jacob.
            </p>
            <Link
              href="/"
              className="cta-hover inline-flex items-center justify-center bg-white text-gray-900 px-8 py-4 rounded-xl text-lg font-semibold hover:bg-gray-100 transition"
            >
              Back to home
            </Link>
          </div>
        )}
      </main>
    </div>
  )
}
