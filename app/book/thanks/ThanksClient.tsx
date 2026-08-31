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

const BORDER = 'rgba(110,118,129,0.35)'
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

      <main className="mx-auto max-w-4xl px-5 sm:px-8 py-6 md:py-14">
        <section className="mb-6">
          <h1 className="text-[clamp(1.5rem,5.2vw,2.6rem)] font-black uppercase leading-[1.1] tracking-tight mb-3">
            Thanks. Watch this while you wait.
          </h1>
          <p className="text-[clamp(1rem,2.6vw,1.15rem)] leading-[1.6]" style={{ color: 'rgba(242,240,235,0.78)' }}>
            Jacob will personally reach out to you shortly.
          </p>
        </section>

        <section className="mb-10">
          <div className="relative border-2 overflow-hidden aspect-[1664/1080]" style={{ borderColor: BORDER, background: '#0F1114' }}>
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
                className="absolute inset-0 grid place-items-center"
                style={{ background: 'rgba(15,17,20,0.35)' }}
              >
                <span
                  className="grid place-items-center h-[72px] w-[72px] border-2"
                  style={{ borderColor: '#EE6B1A', background: 'rgba(238,107,26,0.92)' }}
                >
                  <Play size={30} strokeWidth={2.5} style={{ color: '#16181C' }} fill="#16181C" />
                </span>
              </button>
            )}
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-[clamp(1.1rem,3.8vw,1.7rem)] font-black uppercase leading-[1.15] tracking-tight mb-4">
            Or skip the wait and grab a time now.
          </h2>
          <BookingSection
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

        <div className="mb-8">
          <BrettTestimonial />
        </div>
        <GoogleReviewsCard />
      </main>
    </div>
  )
}
