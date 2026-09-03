'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Reviews from './Reviews'
import VslModal from './VslModal'
import { trackStandard, trackStandardWithId, trackCustomEvent, setPixelFunnelVariant } from './pixel'
import type { FunnelVariant } from '@/lib/funnel-variant'
import type { FunnelVideo } from '@/lib/funnel-videos'

const ACCENT = '#EE6B1A'

export default function VslLanding({ arm, video }: { arm: FunnelVariant; video: FunnelVideo }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const viewFired = useRef(false)
  const leadFired = useRef(false)

  useEffect(() => {
    setPixelFunnelVariant(arm)
    if (viewFired.current) return
    viewFired.current = true
    trackStandard('ViewContent', { content_name: 'vsl_landing' })
    // First-party denominator for /admin/arms; pixel data cannot be read back.
    void fetch('/api/funnel-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'landing_view', step: 'landing' }),
      keepalive: true,
    }).catch(() => {})
  }, [arm])

  return (
    <main className="mx-auto flex min-h-dvh max-w-[640px] flex-col px-5 py-8">
      {/* Logo is a plain image. Nothing on this page leaves the funnel. */}
      <div className="mb-8 flex justify-center">
        <Image src="/aa-logo.png" alt="Align and Acquire" width={132} height={44} priority
          className="h-11 w-auto" />
      </div>

      <h1 className="mb-8 text-center text-[clamp(1.5rem,6vw,2rem)] font-extrabold leading-[1.2] tracking-tight text-neutral-900">
        We Help Home Service Owners Turn Missed Calls Into Booked Jobs With AI for Just $250/mo👇
      </h1>

      {/* A still with a play overlay, NOT a player: the landing page must not
          pull a video file on a phone before anyone has asked for it. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Watch the demo"
        className="relative mb-6 block w-full overflow-hidden rounded-xl border border-neutral-200"
        style={{ aspectRatio: '16 / 9' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={video.poster} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <span className="absolute inset-0 grid place-items-center" style={{ background: 'rgba(0,0,0,0.18)' }}>
          <span className="grid h-[68px] w-[68px] place-items-center rounded-full shadow-lg" style={{ background: ACCENT }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </span>
      </button>

      <p className="mb-6 text-center text-[16px] font-bold leading-[1.5] text-neutral-900">
        Step 1: Watch the 3-minute demo of a live account to see exactly how it works
      </p>

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-12 w-full rounded-lg py-4 text-[17px] font-bold text-white"
        style={{ background: ACCENT }}
      >
        Click to See How It Works
      </button>

      <div className="mb-12">
        <Reviews />
      </div>

      <footer className="mt-auto pt-6 text-center text-[13px] text-neutral-500">
        © 2026 Align &amp; Acquire. All rights reserved.
      </footer>

      <VslModal
        open={open}
        onClose={() => setOpen(false)}
        onVerified={({ watchUrl, trade, eventId, qualified }) => {
          if (!leadFired.current) {
            leadFired.current = true
            const params = { content_name: 'vsl_gate', trade }
            // Lead is the ad optimisation target: once, on OTP success, for a
            // verified owner. Deduped against the server's CAPI event.
            if (qualified) trackStandardWithId('Lead', eventId, params)
            else trackCustomEvent('UnqualifiedLead', params)
          }
          router.push(watchUrl)
        }}
      />
    </main>
  )
}
