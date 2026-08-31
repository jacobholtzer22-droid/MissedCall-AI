'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { Logo } from '@/app/components/Logo'
import GoogleReviewsCard from '@/app/components/GoogleReviewsCard'
import BrettTestimonial from './BrettTestimonial'
import OtpScreen from './OtpScreen'
import { validateUsMobile } from '@/lib/phone-utils'
import { parseAttribution, type Attribution } from '@/lib/attribution'
import type { Variant } from '@/lib/variant'
import type { FunnelVariant } from '@/lib/funnel-variant'
import { trackStandard, setPixelVariant, setPixelFunnelVariant } from './pixel'
import { formatPhoneInput } from './constants'
import type { InitialGate } from './BookFunnelClient'

// ─────────────────────────────────────────────────────────
// ARM B — form first.
//
// Same URL, same assignment cookie, same lead pipeline as arm A. The bet is
// different: arm A makes you earn the video screen by screen, arm B states the
// offer in plain language and asks once.
//
// The video is NOT here. It is the reward on /book/thanks, so submitting is the
// only way to reach it — which keeps the thing being tested (structure) clean
// rather than turning arm B into "the page where the video is free".
// ─────────────────────────────────────────────────────────

const BORDER = 'rgba(110,118,129,0.35)'
const CARD = 'rgba(242,240,235,0.03)'
const ATTRIBUTION_KEY = 'aa_book_attribution'

/** Drop the file here. Falls back to the cropped testimonial shot until it exists. */
const HANDSHAKE = '/images/jacob-brett-handshake.jpg'
const HANDSHAKE_FALLBACK = '/images/testimonial-master-gardener.jpg'

const inputCls =
  'w-full px-4 py-4 border-2 text-[16px] font-medium outline-none bg-transparent focus:border-[#EE6B1A]'
const inputStyle = { borderColor: BORDER, color: '#F2F0EB' }

type Field = 'fullName' | 'businessName' | 'phone' | 'email'
type Form = Record<Field, string>
const EMPTY: Form = { fullName: '', businessName: '', phone: '', email: '' }

const LABELS: Record<Field, string> = {
  fullName: 'Your name',
  businessName: 'Business name',
  phone: 'Mobile number',
  email: 'Email',
}

const PLACEHOLDERS: Record<Field, string> = {
  fullName: 'First and last',
  businessName: 'Your business',
  phone: '(555) 123-4567',
  email: 'you@company.com',
}

const AUTOCOMPLETE: Record<Field, string> = {
  fullName: 'name',
  businessName: 'organization',
  phone: 'tel',
  email: 'email',
}

/** Same rules the wizard uses, so both arms reject the same things. */
function validateField(field: Field, value: string): string {
  const v = value.trim()
  switch (field) {
    case 'fullName':
      return v.length >= 2 ? '' : 'Please enter your name.'
    case 'businessName':
      return v.length >= 2 ? '' : 'Please enter your business name.'
    case 'phone': {
      const check = validateUsMobile(v)
      return check.ok ? '' : check.reason
    }
    case 'email':
      return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? '' : 'That does not look like an email address.'
  }
}

export default function FormFirstClient({
  initialGate,
  variant,
  funnelVariant,
}: {
  initialGate: InitialGate
  variant: Variant
  funnelVariant: FunnelVariant
}) {
  const router = useRouter()
  const [form, setForm] = useState<Form>(() => ({
    ...EMPTY,
    ...(initialGate
      ? { fullName: initialGate.name, phone: initialGate.phone, email: initialGate.email, businessName: initialGate.company }
      : {}),
  }))
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const [stage, setStage] = useState<'form' | 'otp'>('form')
  const [honeypot, setHoneypot] = useState('')

  // The hero photo is not in the repo yet, so it 404s until it is dropped in.
  //
  // onError alone is NOT enough: the request fails while the server-rendered
  // HTML is painting, which is before React hydrates and attaches the handler,
  // so the event is already gone by the time anything is listening. The effect
  // below re-checks after mount (complete && naturalWidth === 0 is a load that
  // failed) and swaps in the cropped photo that already ships. Verified in a
  // real browser — a curl of the HTML cannot see this class of bug at all.
  const [photoSrc, setPhotoSrc] = useState(HANDSHAKE)
  const photoRef = useRef<HTMLImageElement>(null)
  useEffect(() => {
    const img = photoRef.current
    if (img && img.complete && img.naturalWidth === 0) setPhotoSrc(HANDSHAKE_FALLBACK)
  }, [])

  const attributionRef = useRef<Attribution>({})
  const viewFired = useRef(false)
  const leadFired = useRef(false)
  // Timing check. A human cannot read the offer and fill four fields in under
  // a couple of seconds; scripted posts routinely do it in milliseconds.
  const mountedAt = useRef<number>(Date.now())

  useEffect(() => {
    setPixelVariant(variant)
    setPixelFunnelVariant(funnelVariant)
  }, [variant, funnelVariant])

  useEffect(() => {
    if (viewFired.current) return
    viewFired.current = true
    let attribution: Attribution = {}
    try {
      const fromUrl = parseAttribution(window.location.search)
      const stored = sessionStorage.getItem(ATTRIBUTION_KEY)
      attribution = Object.keys(fromUrl).length ? fromUrl : stored ? JSON.parse(stored) : {}
      if (Object.keys(fromUrl).length) sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(fromUrl))
    } catch {
      attribution = {}
    }
    attributionRef.current = attribution
    trackStandard('ViewContent', { content_name: 'book_funnel_form_first' })
    // Denominator for /api/admin/funnel-ab. The pixel cannot be queried back.
    void fetch('/api/funnel-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'landing_view', step: 'landing' }),
      keepalive: true,
    }).catch(() => {})
  }, [])

  const setField = useCallback((field: Field, raw: string) => {
    setForm((f) => ({ ...f, [field]: field === 'phone' ? formatPhoneInput(raw) : raw }))
    setErrors((e) => ({ ...e, [field]: '' }))
    setFormError('')
  }, [])

  async function submit() {
    const next: Partial<Record<Field, string>> = {}
    ;(Object.keys(EMPTY) as Field[]).forEach((f) => {
      const problem = validateField(f, form[f])
      if (problem) next[f] = problem
    })
    setErrors(next)
    if (Object.keys(next).length) return

    setBusy(true)
    setFormError('')
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
      // failure rather than success, the same way the gate does: the opposite
      // once walked people through a whole funnel while saving nothing.
      if (!res.ok || !json?.verificationId) {
        setFormError(json?.error || 'Something went wrong on our end. Please try that again.')
        setBusy(false)
        return
      }
      void fetch('/api/funnel-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'form_submitted', step: 'form' }),
        keepalive: true,
      }).catch(() => {})
      setStage('otp')
    } catch {
      setFormError('Could not send a code. Try again.')
    } finally {
      setBusy(false)
    }
  }

  /** Verified. Write the lead, fire Lead once, then hand them the video. */
  async function handleVerified(verificationId: string) {
    setBusy(true)
    setFormError('')
    try {
      const res = await fetch('/api/demo-lead/wizard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stage: 'form',
          verificationId,
          fullName: form.fullName,
          businessName: form.businessName,
          phone: form.phone,
          email: form.email,
          landingPath: window.location.pathname + window.location.search,
          attribution: attributionRef.current,
          hp_ref: honeypot,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json?.leadId) {
        setFormError(json?.error || 'Could not save that. Try again.')
        setStage('form')
        setBusy(false)
        return
      }
      if (!leadFired.current) {
        leadFired.current = true
        trackStandard('Lead', { content_name: 'form_first' })
      }
      router.push('/book/thanks')
    } catch {
      setFormError('Could not save that. Try again.')
      setStage('form')
      setBusy(false)
    }
  }

  return (
    <div className="min-h-dvh aa-grid-bg" style={{ background: '#16181C', color: '#F2F0EB' }}>
      <header className="border-b-2" style={{ borderColor: 'rgba(110,118,129,0.28)', background: 'rgba(22,24,28,0.95)' }}>
        <div className="mx-auto max-w-4xl px-5 sm:px-8 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <Logo size="sm" />
            <span className="hidden sm:block text-[14px] font-extrabold tracking-tight">Align and Acquire</span>
          </Link>
          <Link href="/" className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em]" style={{ color: '#6E7681' }}>
            <ArrowLeft size={13} strokeWidth={2.5} />
            Back to site
          </Link>
        </div>
      </header>
      <div className="aa-hazard" />

      {/* max-w-6xl and a two-column hero: the old single stacked column pushed
          the offer and the form below the fold on a 1440x900 desktop, which is
          the whole point of a form-first arm. */}
      <main className="mx-auto max-w-6xl px-5 sm:px-8 py-5 md:py-8">
        {/* ── Hero: copy left, photo right ─────────────── */}
        <section className="mb-4 lg:mb-6 lg:grid lg:grid-cols-[1.05fr_0.95fr] lg:gap-10 lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] mb-2">
              <span className="inline-block h-2.5 w-2.5" style={{ background: '#EE6B1A' }} />
              <span style={{ color: '#EE6B1A' }}>Free live demo</span>
            </div>
            <h1 className="text-[clamp(1.65rem,5vw,2.9rem)] font-black uppercase leading-[1.06] tracking-tight mb-3">
              I Don&apos;t Sell Leads. I Catch Yours.
            </h1>
            <p className="text-[clamp(1rem,2.2vw,1.15rem)] leading-[1.55] mb-5" style={{ color: 'rgba(242,240,235,0.78)' }}>
              For $250 a month I build your website and catch the calls you&apos;re already missing.
            </p>

            {/* The offer, unboxed. It used to be a bordered card inside a page
                of bordered cards; as plain bulleted lines it reads in one pass
                and costs about 90px less height. */}
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] mb-3" style={{ color: '#6E7681' }}>
              Here&apos;s the whole deal.
            </p>
            <ul className="space-y-2.5 mb-0">
              {[
                'A website built for you, free with the system, built to convert and get found on Google and AI search.',
                'A missed call system on your line: miss a call, the caller gets a text back in 8 seconds, the AI answers their questions and books the job on your calendar.',
              ].map((line) => (
                <li key={line} className="flex gap-3">
                  <span className="mt-[8px] h-2 w-2 shrink-0" style={{ background: '#EE6B1A' }} aria-hidden="true" />
                  <span className="text-[15px] leading-[1.55]" style={{ color: 'rgba(242,240,235,0.82)' }}>{line}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Photo: no border box, cropped toward the handshake rather than the
              sky, and height-capped so it stops dominating the fold. */}
          <div className="mt-4 lg:mt-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={photoRef}
              src={photoSrc}
              alt="Jacob shaking hands with Brett of Master Gardener LLC"
              className="w-full rounded-xl object-cover max-h-[180px] lg:max-h-[420px]"
              style={{ objectPosition: 'center 42%' }}
              onError={() => setPhotoSrc(HANDSHAKE_FALLBACK)}
            />
          </div>
        </section>

        {/* ── Lead form: the only bordered card on the page ─ */}
        <section id="form" className="mb-7 scroll-mt-6 border-2 p-4 sm:p-5" style={{ borderColor: BORDER, background: CARD }}>
          {stage === 'otp' ? (
            <div className="max-w-md">
              <OtpScreen
                phone={form.phone}
                onVerified={handleVerified}
                onBack={() => {
                  setStage('form')
                  setFormError('')
                }}
              />
              {formError && (
                <p className="mt-3 text-[13px] font-semibold leading-[1.5]" style={{ color: '#EE6B1A' }}>{formError}</p>
              )}
            </div>
          ) : (
            <>
              <h2 className="text-[clamp(1.05rem,3vw,1.5rem)] font-black uppercase leading-[1.15] tracking-tight mb-1.5">
                See it running on a real business
              </h2>
              <p className="text-[13.5px] leading-[1.55] mb-4" style={{ color: 'rgba(242,240,235,0.6)' }}>
                Fill this in and I&apos;ll text you a code to confirm your number. You&apos;ll get a quick
                text from Jacob. Reply STOP any time.
              </p>

              {/* Honeypot. Off-screen, hidden from screen readers, and named so
                  that no autofill heuristic recognises it. "website" was the old
                  name and password managers filled it, blocking real people. */}
              <div aria-hidden="true" className="absolute w-px h-px overflow-hidden -left-[9999px]">
                <label htmlFor="hp_ref_b">Leave this empty</label>
                <input id="hp_ref_b" name="hp_ref" type="text" tabIndex={-1} autoComplete="off"
                  value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  void submit()
                }}
              >
                {/* Two per row on desktop, stacked on mobile. Four stacked
                    full-width inputs made the card taller than the hero. */}
                <div className="grid gap-3 sm:grid-cols-2">
                  {(Object.keys(EMPTY) as Field[]).map((field) => (
                    <div key={field}>
                      <label
                        htmlFor={`ff-${field}`}
                        className="block font-mono text-[10px] font-bold uppercase tracking-[0.18em] mb-1.5"
                        style={{ color: '#6E7681' }}
                      >
                        {LABELS[field]}
                      </label>
                      <input
                        id={`ff-${field}`}
                        value={form[field]}
                        onChange={(e) => setField(field, e.target.value)}
                        type={field === 'phone' ? 'tel' : field === 'email' ? 'email' : 'text'}
                        inputMode={field === 'phone' ? 'tel' : field === 'email' ? 'email' : 'text'}
                        autoComplete={AUTOCOMPLETE[field]}
                        placeholder={PLACEHOLDERS[field]}
                        aria-invalid={errors[field] ? true : undefined}
                        aria-describedby={errors[field] ? `ff-${field}-error` : undefined}
                        className={inputCls}
                        style={errors[field] ? { ...inputStyle, borderColor: '#EE6B1A' } : inputStyle}
                      />
                      {errors[field] && (
                        <p id={`ff-${field}-error`} className="mt-1.5 text-[12.5px] font-semibold leading-[1.45]" style={{ color: '#EE6B1A' }}>
                          {errors[field]}
                        </p>
                      )}
                    </div>
                  ))}
                </div>

                {formError && (
                  <p className="mt-3 text-[13px] font-semibold leading-[1.5]" style={{ color: '#EE6B1A' }}>{formError}</p>
                )}

                <button
                  type="submit"
                  disabled={busy}
                  className="aa-btn mt-4 w-full py-3.5 text-[16px] font-bold uppercase tracking-wide flex items-center justify-center gap-2 disabled:opacity-50 min-h-[54px]"
                  style={{ background: '#EE6B1A', color: '#16181C' }}
                >
                  {busy ? (<><Loader2 size={18} className="motion-safe:animate-spin" /> One sec</>) : 'Show me the demo'}
                </button>
              </form>
            </>
          )}
        </section>

        {/* ── Proof, tightened ─────────────────────────── */}
        <div className="mb-4">
          <BrettTestimonial bare />
        </div>
        <GoogleReviewsCard />
      </main>
    </div>
  )
}
