'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import SocialProof from './SocialProof'
import WizardModal from './WizardModal'
import FunnelHeadline from './FunnelHeadline'
import DateCalendar, { type Booked } from './DateCalendar'
import { BannerCard, FunnelButton } from './FunnelCard'
import { CALL_LENGTH_MINUTES } from './constants'
import { trackStandard, trackStandardWithId, trackCustomEvent, setPixelFunnelVariant } from './pixel'
import { captureAttribution } from '@/lib/attribution-cookie'
import type { FunnelVariant } from '@/lib/funnel-variant'


export default function VslLanding({ arm, poster }: { arm: FunnelVariant; poster: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  // Someone who books here never reaches the watch page, so this page owns the
  // booked state and the Schedule event for that booking.
  const [booked, setBooked] = useState<Booked | null>(null)
  const viewFired = useRef(false)
  const leadFired = useRef(false)
  const scheduleFired = useRef(false)

  function handleBooked(r: Booked & { scheduleEventId: string }) {
    setBooked({ dateLabel: r.dateLabel, timeLabel: r.timeLabel, meetLink: r.meetLink })
    if (scheduleFired.current) return
    scheduleFired.current = true
    trackStandardWithId('Schedule', r.scheduleEventId, { content_name: 'vsl_landing' })
  }

  useEffect(() => {
    setPixelFunnelVariant(arm)
    // Before anything else on the page: document.referrer is only trustworthy
    // on the landing view, and this is the visit an ad click arrives on.
    captureAttribution(arm)
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

      <FunnelHeadline />

      {/* A still with a play overlay, NOT a player: the landing page must not
          pull a video file on a phone before anyone has asked for it. */}
      <BannerCard
        className="mb-6"
        banner="Step 1: Watch the 3-minute demo of a live account to see exactly how it works"
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Watch the demo"
          className="relative block w-full"
          style={{ aspectRatio: '16 / 9' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={poster} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <span className="absolute inset-0 grid place-items-center" style={{ background: 'rgba(0,0,0,0.18)' }}>
            <span className="grid h-[68px] w-[68px] place-items-center rounded-full shadow-lg"
              style={{ background: 'var(--funnel-banner)' }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
          </span>
        </button>
      </BannerCard>

      <div className="mb-12">
        <FunnelButton onClick={() => setOpen(true)}>Click to See How It Works</FunnelButton>
      </div>

      {/* The same calendar the watch page uses. Watching first is still the
          path this page is built to push, but someone who is already sold
          should not have to sit through a video to get on the books. Nobody
          here has been through the gate, so the confirm step asks for the name,
          number and email itself — see DateCalendar. */}
      <div className="mb-12">
        <BannerCard banner="Ready now? Book your call">
          <DateCalendar
            durationMinutes={CALL_LENGTH_MINUTES}
            prefill={{ firstName: '', phone: '', email: '', trade: '' }}
            booked={booked}
            surface="landing"
            onBooked={handleBooked}
          />
        </BannerCard>
      </div>

      <div className="mb-12">
        <SocialProof />
      </div>

      <footer className="mt-auto pt-6 text-center text-[13px] text-neutral-500">
        © 2026 Align and Acquire. All rights reserved.
      </footer>

      <WizardModal
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
