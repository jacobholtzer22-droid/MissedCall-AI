'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, ChevronDown, Play, Calendar, Clock, Check, Loader2 } from 'lucide-react'
import { Logo } from '@/app/components/Logo'
import GoogleReviewsCard from '@/app/components/GoogleReviewsCard'
import { getDemoVideoUrl, getDemoPosterUrl } from '@/lib/demo-video'
import { parseAttribution, type Attribution } from '@/lib/attribution'
import type { Variant } from '@/lib/variant'
import type { CouponState } from '@/lib/coupon'
import { trackStandard, trackCustomEvent, setPixelVariant } from './pixel'
import GateModal, { type GateResult } from './GateModal'
import BookingWizard, { type ChosenSlot, type WizardPrefill } from './BookingWizard'
import BrettTestimonial from './BrettTestimonial'
import ReviewCarousel from './ReviewCarousel'
import CouponBanner, { CouponApplied } from './CouponBanner'
import { GATE_AT_SECONDS, NOT_AN_OWNER } from './constants'

const BORDER = 'rgba(110,118,129,0.35)'
const CARD = 'rgba(242,240,235,0.03)'
const ATTRIBUTION_KEY = 'aa_book_attribution'

type ApiDay = {
  date: string
  isToday: boolean
  label: string
  timezoneLabel: string
  slots: { iso: string; display: string }[]
}

export type InitialGate = {
  leadId: string
  name: string
  phone: string
  trade: string
  email: string
} | null

function SectionHeading({ step, title }: { step: string; title: string }) {
  return (
    <div className="mb-4">
      <div className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] mb-2.5">
        <span className="inline-block h-2.5 w-2.5" style={{ background: '#EE6B1A' }} />
        <span style={{ color: '#EE6B1A' }}>{step}</span>
      </div>
      <h2 className="text-[clamp(1.35rem,4.4vw,2.2rem)] font-black uppercase leading-[1.15] tracking-tight">{title}</h2>
    </div>
  )
}

export default function BookFunnelClient({
  initialGate,
  variant,
  coupon,
}: {
  initialGate: InitialGate
  variant: Variant
  coupon: CouponState
}) {
  const [gate, setGate] = useState<InitialGate>(initialGate)
  const [modalOpen, setModalOpen] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [watchedSeconds, setWatchedSeconds] = useState(0)
  const videoRef = useRef<HTMLVideoElement>(null)
  const attributionRef = useRef<Attribution>({})
  const viewContentFired = useRef(false)
  // Lead is the ad optimization target. It must fire at most once per visitor,
  // whichever arm they are in.
  const leadFired = useRef(false)

  const [days, setDays] = useState<ApiDay[]>([])
  const [slotsLoading, setSlotsLoading] = useState(true)
  const [slotsError, setSlotsError] = useState('')
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [wizardSlot, setWizardSlot] = useState<ChosenSlot | null>(null)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [slotTakenNote, setSlotTakenNote] = useState('')
  const [booked, setBooked] = useState<{
    dateLabel: string
    timeLabel: string
    meetLink: string | null
    couponLine: string | null
  } | null>(null)

  useEffect(() => {
    setPixelVariant(variant)
  }, [variant])

  useEffect(() => {
    if (viewContentFired.current) return
    viewContentFired.current = true
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
    trackStandard('ViewContent', { content_name: 'book_funnel' })
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/marketing-bookings')
        if (!res.ok) throw new Error('slots')
        const data = (await res.json()) as { days?: ApiDay[]; calendarUnavailable?: boolean }
        if (cancelled) return
        if (data.calendarUnavailable) setSlotsError('I cannot read my calendar right now. Try again in a minute.')
        const list = data.days ?? []
        setDays(list)
        const firstOpen = list.find((d) => d.slots.length > 0)
        setSelectedDate(firstOpen?.date ?? list[0]?.date ?? null)
      } catch {
        if (!cancelled) setSlotsError('Could not load times. Try again in a minute.')
      } finally {
        if (!cancelled) setSlotsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const timezoneLabel = useMemo(() => days[0]?.timezoneLabel ?? 'Eastern Time (ET)', [days])
  const daySlots = useMemo(
    () => (selectedDate ? days.find((d) => d.date === selectedDate)?.slots ?? [] : []),
    [days, selectedDate]
  )

  const startPlayback = useCallback(() => {
    setPlaying(true)
    setTimeout(() => {
      videoRef.current?.play().catch(() => {
        /* autoplay blocked, visible controls still work */
      })
    }, 60)
  }, [])

  function handlePlayClick() {
    // `nogate`: the video is the offer, nothing stands in front of it.
    if (variant === 'nogate' || gate || GATE_AT_SECONDS > 0) {
      startPlayback()
      return
    }
    setModalOpen(true)
  }

  function handleTimeUpdate() {
    const v = videoRef.current
    if (!v) return
    setWatchedSeconds(v.currentTime)
    if (variant === 'gate' && !gate && GATE_AT_SECONDS > 0 && v.currentTime >= GATE_AT_SECONDS) {
      v.pause()
      setModalOpen(true)
    }
  }

  const fireLeadOnce = useCallback((qualified: boolean) => {
    if (leadFired.current) return
    leadFired.current = true
    if (qualified) trackStandard('Lead', { content_name: 'demo_video_gate' })
    else trackCustomEvent('UnqualifiedLead', { content_name: 'demo_video_gate' })
  }, [])

  function handleGateComplete(result: GateResult) {
    setGate({
      leadId: result.leadId,
      name: result.name,
      phone: result.phone,
      trade: result.trade,
      email: '',
    })
    fireLeadOnce(result.qualified)
    setModalOpen(false)
    startPlayback()
  }

  async function clearGate() {
    await fetch('/api/demo-lead/clear', { method: 'POST' }).catch(() => {})
    setGate(null)
  }

  function chooseSlot(iso: string, display: string) {
    const dayLabel = days.find((d) => d.date === selectedDate)?.label ?? ''
    setSlotTakenNote('')
    setWizardSlot({ iso, display, dateLabel: dayLabel })
    setWizardOpen(true)
  }

  const prefill: WizardPrefill = useMemo(
    () => ({
      trade: gate?.trade || undefined,
      name: gate?.name || undefined,
      phone: gate?.phone || undefined,
      email: gate?.email || undefined,
    }),
    [gate]
  )

  const videoSrc = getDemoVideoUrl()
  const posterSrc = getDemoPosterUrl()

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

      <main className="mx-auto max-w-4xl px-5 sm:px-8 py-6 md:py-14">
        {/* ── Hero ─────────────────────────────────────── */}
        <section className="mb-4">
          <div className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] mb-2">
            <span className="inline-block h-2.5 w-2.5" style={{ background: '#EE6B1A' }} />
            <span style={{ color: '#EE6B1A' }}>Free live demo</span>
          </div>
          <h1 className="text-[clamp(1.5rem,5.2vw,2.6rem)] font-black uppercase leading-[1.1] tracking-tight mb-4">
            Missed calls, texted back in 8 seconds.
          </h1>
          <a
            href="#step-2"
            className="aa-btn flex items-center justify-center gap-2 px-8 py-3.5 text-[15px] font-bold uppercase tracking-wide min-h-[52px] sm:inline-flex sm:w-auto"
            style={{ background: '#EE6B1A', color: '#16181C' }}
          >
            Book now
            <ArrowRight size={17} strokeWidth={2.5} />
          </a>

        </section>

        <div className="mb-4">
          <BrettTestimonial />
        </div>

        {/* ── Step 1 ───────────────────────────────────── */}
        <section id="step-1" className="mb-8 scroll-mt-6">
          <h2 className="text-[clamp(1.1rem,3.8vw,1.9rem)] font-black uppercase leading-[1.15] tracking-tight mb-2">
            <span style={{ color: '#EE6B1A' }}>Step 1.</span> Watch me run it live
          </h2>
          <div className="border-2 overflow-hidden" style={{ borderColor: BORDER, background: CARD }}>
            {playing ? (
              <video
                ref={videoRef}
                src={videoSrc}
                poster={posterSrc || undefined}
                controls
                playsInline
                preload="metadata"
                onTimeUpdate={handleTimeUpdate}
                className="w-full aspect-[1664/1080] bg-black"
              />
            ) : (
              <button
                type="button"
                onClick={handlePlayClick}
                aria-label="Play the demo video"
                className="relative w-full aspect-[1664/1080] grid place-items-center group overflow-hidden"
                style={{ background: 'linear-gradient(135deg, #1d2026 0%, #16181C 60%, #22252b 100%)' }}
              >
                {posterSrc && (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={posterSrc}
                      alt=""
                      aria-hidden="true"
                      fetchPriority="high"
                      loading="eager"
                      decoding="async"
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                    <span aria-hidden="true" className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(22,24,28,0.35) 0%, rgba(22,24,28,0.55) 100%)' }} />
                  </>
                )}
                <span className="relative grid place-items-center rounded-full transition-transform motion-safe:group-hover:scale-105" style={{ background: '#EE6B1A', width: 84, height: 84, boxShadow: '0 6px 24px rgba(0,0,0,0.45)' }}>
                  <Play size={34} strokeWidth={2.5} fill="#16181C" style={{ color: '#16181C', marginLeft: 4 }} />
                </span>
                <span className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] whitespace-nowrap" style={{ color: '#F2F0EB', background: 'rgba(22,24,28,0.78)' }}>
                  Under two minutes
                </span>
              </button>
            )}
          </div>
          <p className="text-[13px] leading-[1.5] mt-2.5" style={{ color: 'rgba(242,240,235,0.6)' }}>
            Under two minutes. Real missed call, real text back, real booked quote.
          </p>
        </section>

        {/* Reviews keep their place on the page, just below the player rather
            than above it: they no longer get to push the video off the screen. */}
        <div className="mb-8">
          <ReviewCarousel />
        </div>

        {/* Urgency sits at the booking decision, not at the top of the page:
            they see the clock right as they are about to pick a time. */}
        <div className="mb-8 -mt-6">
          <CouponBanner initial={coupon} />
        </div>

        {/* ── Step 2 ───────────────────────────────────── */}
        <section id="step-2" className="mb-16 scroll-mt-6">
          <SectionHeading step="Step 2" title="Book a 15 minute call" />

          {booked ? (
            <div className="border-2 p-6 sm:p-8 text-center" style={{ borderColor: 'rgba(238,107,26,0.45)', background: 'rgba(238,107,26,0.07)' }}>
              <div className="inline-flex items-center justify-center h-16 w-16 border-2 mb-6 mx-auto" style={{ borderColor: '#EE6B1A' }}>
                <Check size={32} strokeWidth={2.5} style={{ color: '#EE6B1A' }} />
              </div>
              <h3 className="text-[clamp(1.8rem,5vw,2.6rem)] font-black uppercase leading-[1.1] tracking-tight mb-4">Locked in.</h3>
              <p className="text-[16px] font-bold leading-[1.5] mb-2">
                {booked.dateLabel} at {booked.timeLabel}
                <span className="ml-2 text-[13px] font-normal" style={{ color: '#6E7681' }}>({timezoneLabel})</span>
              </p>
              {booked.couponLine && (
                <p className="text-[14px] leading-[1.6] mb-2" style={{ color: '#EE6B1A' }}>{booked.couponLine}</p>
              )}
              {booked.meetLink && (
                <p className="text-[14px] leading-[1.6] mb-4">
                  <a href={booked.meetLink} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4" style={{ color: '#EE6B1A' }}>
                    Join on Google Meet
                  </a>
                </p>
              )}
              <div className="border-2 p-5 text-left max-w-md mx-auto my-6" style={{ borderColor: BORDER, background: CARD }}>
                <p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] mb-3" style={{ color: '#6E7681' }}>
                  What happens on the call
                </p>
                <ol className="space-y-3 text-[14px] leading-[1.65]" style={{ color: 'rgba(242,240,235,0.78)' }}>
                  <li>1. I show you the system running on real client accounts.</li>
                  <li>2. I show you real text-back conversations, word for word.</li>
                  <li>3. You see the jobs that got booked out of them.</li>
                  <li>4. You ask whatever you want. If it is not a fit, no hard feelings.</li>
                </ol>
              </div>
              <p className="text-[14px] leading-[1.65]" style={{ color: 'rgba(242,240,235,0.6)' }}>
                You&apos;re talking to me, Jacob, the owner. Not a sales rep. You&apos;ll get a text from me confirming. Talk soon.
              </p>
            </div>
          ) : (
            <div className="border-2 p-5 sm:p-7" style={{ borderColor: BORDER, background: CARD }}>
              {gate && (
                <div className="mb-6 border-2 px-4 py-3.5" style={{ borderColor: 'rgba(238,107,26,0.35)', background: 'rgba(238,107,26,0.06)' }}>
                  <p className="text-[14px] font-semibold leading-[1.5]">{gate.name}</p>
                  <p className="text-[13px] leading-[1.5]" style={{ color: '#6E7681' }}>{gate.phone}</p>
                  <button type="button" onClick={clearGate} className="mt-2 font-mono text-[10px] uppercase tracking-[0.18em] underline underline-offset-4 min-h-[44px]" style={{ color: '#6E7681' }}>
                    Not you?
                  </button>
                </div>
              )}

              <CouponApplied state={coupon} />

              <div className="flex items-center justify-between mb-4">
                <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em]" style={{ color: '#6E7681' }}>
                  <Calendar size={14} strokeWidth={2.25} style={{ color: '#EE6B1A' }} />
                  Pick a time
                </span>
                <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: '#6E7681' }}>{timezoneLabel}</span>
              </div>

              {slotTakenNote && (
                <p className="mb-4 text-[13px] font-semibold leading-[1.6]" style={{ color: '#EE6B1A' }}>{slotTakenNote}</p>
              )}

              {slotsLoading ? (
                <div className="flex items-center gap-2 py-6" style={{ color: '#6E7681' }}>
                  <Loader2 size={18} className="motion-safe:animate-spin" style={{ color: '#EE6B1A' }} />
                  <span className="font-mono text-[11px] uppercase tracking-widest">Loading times</span>
                </div>
              ) : slotsError ? (
                <p className="text-[14px] leading-[1.6]" style={{ color: '#EE6B1A' }}>{slotsError}</p>
              ) : (
                <>
                  <div className="flex gap-2 overflow-x-auto pb-3 mb-4 [scrollbar-width:none]">
                    {days.map((d) => {
                      const active = d.date === selectedDate
                      const open = d.slots.length > 0
                      return (
                        <button key={d.date} type="button" disabled={!open}
                          onClick={() => setSelectedDate(d.date)}
                          className="min-w-[108px] px-3 py-3 border-2 text-left text-[12px] shrink-0"
                          style={{
                            borderColor: active ? '#EE6B1A' : BORDER,
                            background: active ? 'rgba(238,107,26,0.1)' : 'transparent',
                            color: open ? (active ? '#F2F0EB' : '#6E7681') : 'rgba(110,118,129,0.4)',
                            cursor: open ? 'pointer' : 'not-allowed',
                          }}>
                          <div className="font-bold uppercase tracking-wide text-[11px] leading-[1.4]">
                            {d.isToday ? 'Today' : d.label.split(' ')[0]}
                          </div>
                          <div className="text-[11px] leading-[1.5] mt-0.5" style={{ color: '#6E7681' }}>
                            {d.isToday ? d.label : d.label.split(' ').slice(1).join(' ')}
                          </div>
                          <div className="mt-1.5 font-mono text-[10px] uppercase tracking-widest" style={{ color: open ? '#EE6B1A' : 'rgba(110,118,129,0.4)' }}>
                            {open ? `${d.slots.length} open` : 'Full'}
                          </div>
                        </button>
                      )
                    })}
                  </div>

                  {daySlots.length === 0 ? (
                    <p className="text-[14px] leading-[1.6]" style={{ color: '#6E7681' }}>Nothing left that day. Try another.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {daySlots.map((s) => (
                        <button key={s.iso} type="button" onClick={() => chooseSlot(s.iso, s.display)}
                          className="px-4 py-3 border-2 text-[14px] font-semibold min-h-[52px]"
                          style={{ borderColor: BORDER, color: '#F2F0EB' }}>
                          <Clock size={13} strokeWidth={2.25} className="inline mr-1.5 -mt-0.5" style={{ color: '#EE6B1A' }} />
                          {s.display}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </section>


        <GoogleReviewsCard />
      </main>

      {variant === 'gate' && (
        <GateModal
          open={modalOpen}
          watchedSeconds={watchedSeconds}
          attribution={attributionRef.current as Record<string, string>}
          onClose={() => setModalOpen(false)}
          onComplete={handleGateComplete}
        />
      )}

      <BookingWizard
        open={wizardOpen}
        slot={wizardSlot}
        prefill={prefill}
        attribution={attributionRef.current}
        needsLeadWrite={!gate}
        coupon={coupon}
        onClose={() => setWizardOpen(false)}
        onLeadCaptured={(qualified) => fireLeadOnce(qualified)}
        onSlotTaken={() => {
          setWizardOpen(false)
          setSlotTakenNote('That time just got taken. Pick another and I kept everything else you entered.')
          document.getElementById('step-2')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }}
        onBooked={(r) => {
          trackStandard('Schedule', { content_name: 'demo_call' })
          setWizardOpen(false)
          setBooked(r)
        }}
      />
    </div>
  )
}
