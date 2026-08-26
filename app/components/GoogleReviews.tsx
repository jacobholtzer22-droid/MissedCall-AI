'use client'

import { useCallback, useEffect, useState } from 'react'
import { Star, Quote, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react'

// ─────────────────────────────────────────────────────────
// Google reviews — Align and Acquire (Google Business Profile).
//
// Pulled verbatim from the live GBP API on 2026-08-26 via the connected
// Google Business Profile integration (location 3820569693245684558).
// Google reported averageRating 5, totalReviewCount 9.
//
// Text is EXACTLY as Google returned it, including typographic apostrophes and
// the reviewer's own capitalisation. Do not edit, shorten, or "improve" any
// review. Order below is Google's own: newest first.
//
// This is still a snapshot, not a live fetch: hitting Google on every render
// would put a third-party dependency and its latency in front of paid traffic.
// To refresh it, ask Claude to re-pull from the GBP connector.
// ─────────────────────────────────────────────────────────
export interface Review {
  name: string
  rating: number
  text: string
  /** Google-hosted avatar. Can rotate or 404, so every consumer must fall back
   *  to an initial circle rather than showing a broken image. */
  photoUrl?: string
  /** ISO timestamp from Google. Relative dates are derived from this, never
   *  written by hand. */
  createdAt?: string
  /** Verbatim owner reply, if one exists. None of the current nine have one. */
  ownerReply?: string
}

export const REVIEWS: Review[] = [
  {
    name: 'Mervin Hoch',
    rating: 5,
    text: 'Jacob has been good to work with. Response the same day, providing resolutions for our needs.',
    photoUrl: 'https://lh3.googleusercontent.com/a/ACg8ocI4pnlFi5uw4OIaPeCUa1MQhehJz_2Dai3Q6ksY0T9lWi2tKg=s120-c-rp-mo-br100',
    createdAt: '2026-08-13T20:32:09.100Z',
  },
  {
    name: 'Klederson Rodas',
    rating: 5,
    text: 'Great communication, affordable pricing, and quality work. I’ve definitely seen results from the work he does. Highly recommend!',
    photoUrl: 'https://lh3.googleusercontent.com/a/ACg8ocLdFIR-BCZWhV0shahIMgsquYtwQbmxVRHVd-yg4NvSSBH0=s120-c-rp-mo-br100',
    createdAt: '2026-08-11T20:18:17.788Z',
  },
  {
    name: 'Will Schnelk',
    rating: 5,
    text: 'Great service, jacob is respectful and is very knowledgeable on what he’s doing.',
    photoUrl: 'https://lh3.googleusercontent.com/a-/ALV-UjWyvCeJGFbJiRcNRiM4wLebi0kMUUEZhX0HHCktgPEMU0SGkld6=s120-c-rp-mo-br100',
    createdAt: '2026-07-08T16:21:02.967Z',
  },
  {
    name: 'Hayley Harpe',
    rating: 5,
    text: 'Highly recommend the service Jacob offers! He is super professional and always on time. Also a super friendly guy who cares about his customers. 5 stars all the way!!!!',
    photoUrl: 'https://lh3.googleusercontent.com/a/ACg8ocIBdfdkO8ENZMS6btG8pxwjtnXVXR72X_YaA-S9voXZUlpktA=s120-c-rp-mo-br100',
    createdAt: '2026-07-08T17:01:16.668Z',
  },
  {
    name: 'Cameron Brillantes',
    rating: 5,
    text: 'Great experience working with Align and Acquire. Jacob is professional, responsive, and really understands how to help local businesses generate more leads. Highly recommend if you’re looking to grow your business and stop missing potential customers.',
    photoUrl: 'https://lh3.googleusercontent.com/a/ACg8ocIBv0mmAbLWFwj7RVorHypb2uq-oJKHG7ST1_p8hvd0s6Ggm2A=s120-c-rp-mo-br100',
    createdAt: '2026-07-08T16:33:06.211Z',
  },
  {
    name: 'Colin Albright',
    rating: 5,
    text: 'Highly recommend Align & Acquire! They built an awesome website for my business and were great to work with. Very helpful, professional, and always quick to answer questions. I’m extremely happy with the final result!',
    photoUrl: 'https://lh3.googleusercontent.com/a-/ALV-UjWBApl7LAw9z1fffnCbOD046Z6gwXrscbhCiMfnBWS2Rl4It90=s120-c-rp-mo-br100',
    createdAt: '2026-07-06T17:51:43.660Z',
  },
  {
    name: 'Benji Hussey',
    rating: 5,
    text: 'Great experience working with Jacob, he is very involved and you can tell he really cares about his client relationships. Would recommend',
    photoUrl: 'https://lh3.googleusercontent.com/a/ACg8ocIwCC7Qd2gwbLu367S85cFpEeRO5JF7iIvUvZtWTIVX0-uZQA=s120-c-rp-mo-br100',
    createdAt: '2026-07-06T17:46:27.953Z',
  },
  {
    name: 'Keegan Kaiser',
    rating: 5,
    text: 'Liam got me connected with this amazing company through a call and I was grateful to have answered it. I got in communication with Jacob the owner who helped me strategize ways to make my business better. Great experience overall',
    photoUrl: 'https://lh3.googleusercontent.com/a/ACg8ocJtFFgP-qMiqterMumCBAMRw08s8MAATMBR5SW1S8fXHLM3ZQ=s120-c-rp-mo-br100',
    createdAt: '2026-07-06T17:40:19.074Z',
  },
  {
    name: 'Ryan',
    rating: 5,
    text: 'Helped me stay focused on the job and not lose any leads. Works even better than expected. 100% recommend',
    photoUrl: 'https://lh3.googleusercontent.com/a-/ALV-UjXAULkcXEkaXyA-nrkDFIsoomkXo7k10wfo6NF_KAPVDIzNhYQ3=s120-c-rp-mo-br100',
    createdAt: '2026-07-06T17:36:36.228Z',
  },
]

const ROTATE_MS = 7000

// Stable public link to the Google Business Profile listing (cid form —
// survives name/address edits, unlike the long /maps/place URLs).
export const GOOGLE_LISTING_URL = 'https://maps.google.com/?cid=11437658075713946562'

// Reviewer initials avatar. Deliberately NOT the Google-hosted profile
// photos: those URLs (lh3.googleusercontent.com/...) rotate and would
// become broken images, and hotlinking them means a runtime call to
// Google on every page view. Initials render instantly and never break.
function Avatar({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase()

  return (
    <span
      aria-hidden="true"
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-bold"
      style={{ background: '#16181C', color: '#F2F0EB' }}
    >
      {initials}
    </span>
  )
}

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          size={16}
          strokeWidth={0}
          aria-hidden="true"
          style={{ fill: i < rating ? '#EE6B1A' : 'rgba(110,118,129,0.3)' }}
        />
      ))}
    </div>
  )
}

function ReviewCard({
  review,
  slot,
  className = '',
}: {
  review: Review
  slot: number
  className?: string
}) {
  return (
    <div
      // Remounting on slot change keeps each card's content in sync with its
      // position rather than reusing the previous review's DOM.
      key={slot}
      className={`flex flex-col px-6 py-10 sm:px-8 sm:py-12 ${className}`}
      style={{ borderColor: '#16181C' }}
    >
      <Quote size={32} strokeWidth={1.25} className="mb-6" style={{ color: '#EE6B1A' }} />

      <p className="text-[17px] leading-relaxed sm:text-[18px]" style={{ color: '#16181C' }}>
        {review.text}
      </p>

      <div className="mt-auto flex items-center gap-3 pt-6">
        <Avatar name={review.name} />
        <div className="min-w-0">
          <div className="text-[15px] font-bold" style={{ color: '#16181C' }}>
            {review.name}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <Stars rating={review.rating} />
            <span className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: '#6E7681' }}>
              via Google
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function GoogleReviews() {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)

  // Layout is CSS-driven (the second card is simply hidden below md), so
  // there is no hydration mismatch. perView only drives how far a step
  // advances and which dots read as active.
  const [perView, setPerView] = useState(1)

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const sync = () => setPerView(mq.matches ? 2 : 1)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  const go = useCallback((next: number) => {
    setIndex(((next % REVIEWS.length) + REVIEWS.length) % REVIEWS.length)
  }, [])

  useEffect(() => {
    if (paused) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const timer = window.setInterval(() => {
      setIndex(i => (i + perView) % REVIEWS.length)
    }, ROTATE_MS)

    return () => window.clearInterval(timer)
  }, [paused, perView])

  const first = REVIEWS[index]
  const second = REVIEWS[(index + 1) % REVIEWS.length]

  // A dot is active if its review is one of the currently visible ones.
  const isActive = (i: number) =>
    Array.from({ length: perView }, (_, k) => (index + k) % REVIEWS.length).includes(i)

  return (
    <div
      className="border-2"
      style={{ borderColor: '#16181C' }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      {/* Header — aggregate rating + source */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 border-b-2 px-6 py-4 sm:px-8"
        style={{ borderColor: '#16181C' }}
      >
        <div className="flex items-center gap-3">
          <Stars rating={5} />
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: '#16181C' }}>
            5.0 · {REVIEWS.length} reviews
          </span>
        </div>
        <a
          href={GOOGLE_LISTING_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.2em] underline underline-offset-4"
          style={{ color: '#16181C' }}
        >
          Read them on Google <ExternalLink size={12} strokeWidth={2.5} />
        </a>
      </div>

      {/* Rotating reviews — one card on mobile, two side by side on desktop */}
      <div
        className="grid min-h-[300px] md:min-h-[260px] md:grid-cols-2"
        aria-live="polite"
      >
        <ReviewCard review={first} slot={index} />
        <ReviewCard
          review={second}
          slot={index + 1}
          className="hidden md:flex md:border-l-2"
        />
      </div>

      {/* Controls */}
      <div
        className="flex items-center justify-between gap-4 border-t-2 px-6 py-4 sm:px-8"
        style={{ borderColor: '#16181C' }}
      >
        <button
          type="button"
          onClick={() => go(index - perView)}
          aria-label="Previous review"
          className="inline-flex h-11 w-11 items-center justify-center border-2 transition-colors"
          style={{ borderColor: '#16181C', color: '#16181C' }}
        >
          <ChevronLeft size={18} strokeWidth={2.5} />
        </button>

        <div className="flex flex-wrap items-center justify-center gap-2">
          {REVIEWS.map((r, i) => (
            <button
              key={r.name}
              type="button"
              onClick={() => go(i)}
              aria-label={`Show review from ${r.name}`}
              aria-current={isActive(i)}
              className="h-2.5 w-2.5 transition-opacity"
              style={{
                background: isActive(i) ? '#EE6B1A' : 'rgba(110,118,129,0.35)',
              }}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={() => go(index + perView)}
          aria-label="Next review"
          className="inline-flex h-11 w-11 items-center justify-center border-2 transition-colors"
          style={{ borderColor: '#16181C', color: '#16181C' }}
        >
          <ChevronRight size={18} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  )
}
