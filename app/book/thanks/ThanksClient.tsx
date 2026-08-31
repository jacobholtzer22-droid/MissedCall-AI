'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Play } from 'lucide-react'
import { Logo } from '@/app/components/Logo'
import BookingSection from '../BookingSection'
import BrettTestimonial from '../BrettTestimonial'
import GoogleReviewsCard from '@/app/components/GoogleReviewsCard'
import { demoVideo } from '@/lib/funnel-variant'
import type { CouponState } from '@/lib/coupon'

const ATTRIBUTION_KEY = 'aa_book_attribution'

export default function ThanksClient({
  prefill,
  coupon,
}: {
  prefill: { name: string; phone: string; email: string; trade: string; company: string }
  coupon: CouponState
}) {
  const { src, poster } = demoVideo()
  const [playing, setPlaying] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const logged = useRef(false)
  const [attribution, setAttribution] = useState<Record<string, string>>({})

  useEffect(() => {
    if (logged.current) return
    logged.current = true
    try {
      const stored = sessionStorage.getItem(ATTRIBUTION_KEY)
      if (stored) setAttribution(JSON.parse(stored))
    } catch {
      /* attribution is a nice-to-have */
    }
    void fetch('/api/funnel-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'thanks_view', step: 'thanks' }),
      keepalive: true,
    }).catch(() => {})
  }, [])

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

      <main className="mx-auto max-w-4xl px-5 sm:px-8 py-5 md:py-8">
        <section className="mb-5 text-center">
          <h1 className="text-[clamp(1.55rem,4.6vw,2.5rem)] font-black uppercase leading-[1.08] tracking-tight mb-2.5">
            Thanks. Watch this while you wait.
          </h1>
          <p className="text-[clamp(0.98rem,2.2vw,1.1rem)] leading-[1.55]" style={{ color: 'rgba(242,240,235,0.78)' }}>
            Jacob will personally reach out to you shortly.
          </p>
        </section>

        <section className="mb-7 mx-auto max-w-2xl">
          <div className="relative overflow-hidden rounded-xl aspect-[1664/1080]" style={{ background: '#0F1114' }}>
            <video
              ref={videoRef}
              src={src}
              poster={poster || undefined}
              controls={playing}
              playsInline
              preload="metadata"
              className="absolute inset-0 h-full w-full object-contain"
              onPlay={() => setPlaying(true)}
            />
            {!playing && (
              <button
                type="button"
                onClick={() => {
                  setPlaying(true)
                  void videoRef.current?.play()
                }}
                aria-label="Play the demo"
                className="absolute inset-0 grid place-items-center group"
                style={{ background: 'rgba(15,17,20,0.35)' }}
              >
                <span
                  className="grid place-items-center rounded-full transition-transform motion-safe:group-hover:scale-105"
                  style={{ background: '#EE6B1A', width: 84, height: 84, boxShadow: '0 6px 24px rgba(0,0,0,0.45)' }}
                >
                  <Play size={34} strokeWidth={2.5} fill="#16181C" style={{ color: '#16181C', marginLeft: 4 }} />
                </span>
              </button>
            )}
          </div>
        </section>

        <section className="mb-6 mx-auto max-w-2xl">
          <h2 className="text-[clamp(1.05rem,3vw,1.5rem)] font-black uppercase leading-[1.15] tracking-tight mb-3">
            Or skip the wait and grab a time now.
          </h2>
          <BookingSection
            bare
            heading="Pick a time"
            prefill={{
              trade: prefill.trade || undefined,
              name: prefill.name || undefined,
              phone: prefill.phone || undefined,
              email: prefill.email || undefined,
              company: prefill.company || undefined,
            }}
            attribution={attribution}
            coupon={coupon}
          />
        </section>

        <div className="mb-4 mx-auto max-w-2xl">
          <BrettTestimonial bare />
        </div>
        <div className="mx-auto max-w-2xl">
          <GoogleReviewsCard />
        </div>
      </main>
    </div>
  )
}
