'use client'

import { useCallback, useEffect, useState } from 'react'
import { Star, Quote, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react'

// ─────────────────────────────────────────────────────────
// Google reviews — Align and Acquire (Google Business Profile).
// Text is reproduced VERBATIM from the public listing, including
// original capitalisation and punctuation. Do not edit, shorten,
// or "improve" any review text. Static content — no runtime call
// to Google.
//
// Listing at time of capture (Aug 2026): 5.0 average, 8 reviews,
// all 5-star.
// ─────────────────────────────────────────────────────────
export interface Review {
  name: string
  rating: number
  text: string
  date?: string
}

export const REVIEWS: Review[] = [
  {
    name: 'Benji Hussey',
    rating: 5,
    text: 'Great experience working with Jacob, he is very involved and you can tell he really cares about his client relationships. Would recommend',
  },
  {
    name: 'Colin Albright',
    rating: 5,
    text: 'Highly recommend Align & Acquire! They built an awesome website for my business and were great to work with. Very helpful, professional, and always quick to answer questions. I’m extremely happy with the final result!',
  },
  {
    name: 'Hayley Harpe',
    rating: 5,
    text: 'Highly recommend the service Jacob offers! He is super professional and always on time. Also a super friendly guy who cares about his customers. 5 stars all the way!!!!',
  },
  {
    name: 'Ryan',
    rating: 5,
    text: 'Helped me stay focused on the job and not lose any leads. Works even better than expected. 100% recommend',
  },
  {
    name: 'Klederson Rodas',
    rating: 5,
    text: 'Great communication, affordable pricing, and quality work. I’ve definitely seen results from the work he does. Highly recommend!',
  },
  {
    name: 'Will Schnelk',
    rating: 5,
    text: 'Great service, jacob is respectful and is very knowledgeable on what he’s doing.',
  },
  {
    name: 'Cameron Brillantes',
    rating: 5,
    text: 'Great experience working with Align and Acquire. Jacob is professional, responsive, and really understands how to help local businesses generate more leads. Highly recommend if you’re looking to grow your business and stop missing potential customers.',
  },
  {
    name: 'Keegan Kaiser',
    rating: 5,
    text: 'Liam got me connected with this amazing company through a call and I was grateful to have answered it. I got in communication with Jacob the owner who helped me strategize ways to make my business better. Great experience overall',
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
