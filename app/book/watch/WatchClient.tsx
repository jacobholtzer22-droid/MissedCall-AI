'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import SocialProof from '../SocialProof'
import DateCalendar from '../DateCalendar'
import FunnelHeadline from '../FunnelHeadline'
import { BannerCard, FunnelButton } from '../FunnelCard'
import { CALL_LENGTH_MINUTES } from '../constants'
import { trackStandard, trackStandardWithId, setPixelFunnelVariant } from '../pixel'
import type { FunnelVariant } from '@/lib/funnel-variant'
import type { FunnelVideo } from '@/lib/funnel-videos'


export default function WatchClient({
  arm,
  video,
  prefill,
}: {
  arm: FunnelVariant
  video: FunnelVideo
  prefill: { firstName: string; phone: string; email: string; trade: string }
}) {
  const [playing, setPlaying] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const bookingRef = useRef<HTMLDivElement>(null)
  const milestones = useRef<Set<number>>(new Set())

  useEffect(() => {
    setPixelFunnelVariant(arm)
    trackStandard('ViewContent', { content_name: 'vsl_watch' })
  }, [arm])

  /** 25/50/75/100% watch-through into the arm ledger. */
  function onTimeUpdate() {
    const el = videoRef.current
    if (!el?.duration || !Number.isFinite(el.duration)) return
    const pct = (el.currentTime / el.duration) * 100
    for (const m of [25, 50, 75, 100]) {
      if (pct >= m && !milestones.current.has(m)) {
        milestones.current.add(m)
        void fetch('/api/arm-event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: `video_${m}` }),
          keepalive: true,
        }).catch(() => {})
      }
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-[640px] flex-col px-5 py-8">
      <div className="mb-8 flex justify-center">
        <Image src="/aa-logo.png" alt="Align and Acquire" width={132} height={44} priority className="h-11 w-auto" />
      </div>

      <FunnelHeadline />

      <BannerCard className="mb-12" banner="Step 1: Watch this video">
        <div className="relative w-full" style={{ aspectRatio: '16 / 9' }}>
          <video
            ref={videoRef}
            src={video.src}
            poster={video.poster}
            controls={playing}
            playsInline
            preload="metadata"
            className="absolute inset-0 h-full w-full object-cover"
            onPlay={() => setPlaying(true)}
            onTimeUpdate={onTimeUpdate}
            onEnded={onTimeUpdate}
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
              style={{ background: 'rgba(0,0,0,0.18)' }}
            >
              <span className="grid h-[68px] w-[68px] place-items-center rounded-full shadow-lg"
                style={{ background: 'var(--funnel-banner)' }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </span>
            </button>
          )}
        </div>
      </BannerCard>

      {/* The only calendar on the page. The button below scrolls back to this
          one rather than mounting a second. */}
      <div ref={bookingRef} className="mb-12 scroll-mt-6">
        <BannerCard banner="Step 2: Book a call">
          <DateCalendar
            durationMinutes={CALL_LENGTH_MINUTES}
            prefill={prefill}
            onBooked={(r) => {
              trackStandardWithId('Schedule', r.scheduleEventId, { content_name: 'vsl_watch' })
            }}
          />
        </BannerCard>
      </div>

      <div className="mb-12">
        <SocialProof />
      </div>

      <div className="mb-12">
        <BannerCard banner="Step 2: Book a call">
          <div className="p-4">
            <FunnelButton
              onClick={() => bookingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            >
              Pick a Time
            </FunnelButton>
          </div>
        </BannerCard>
      </div>

      <footer className="mt-auto pt-6 text-center text-[13px] text-neutral-500">
        © 2026 Align and Acquire. All rights reserved.
      </footer>
    </main>
  )
}
