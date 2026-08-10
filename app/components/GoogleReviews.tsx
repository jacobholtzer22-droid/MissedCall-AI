'use client'

import { useCallback, useEffect, useState } from 'react'
import { Star, Quote, ChevronLeft, ChevronRight } from 'lucide-react'

// ─────────────────────────────────────────────────────────
// Google reviews — Align and Acquire (Google Business Profile).
// Text is reproduced VERBATIM from the public listing, including
// original capitalisation and punctuation. Do not edit, shorten,
// or "improve" any review text. Static content — no runtime call
// to Google.
//
// Listing at time of capture (Aug 2026): 5.0 average, 7 reviews,
// all 5-star.
// ─────────────────────────────────────────────────────────
interface Review {
  name: string
  rating: number
  text: string
  date?: string
}

const REVIEWS: Review[] = [
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

export default function GoogleReviews() {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)

  const go = useCallback((next: number) => {
    setIndex(((next % REVIEWS.length) + REVIEWS.length) % REVIEWS.length)
  }, [])

  useEffect(() => {
    if (paused) return
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const timer = window.setInterval(() => {
      setIndex(i => (i + 1) % REVIEWS.length)
    }, ROTATE_MS)

    return () => window.clearInterval(timer)
  }, [paused])

  const review = REVIEWS[index]

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
        <span className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: '#6E7681' }}>
          via Google
        </span>
      </div>

      {/* Rotating review */}
      <div className="px-6 py-10 sm:px-8 sm:py-12">
        <Quote size={32} strokeWidth={1.25} className="mb-6" style={{ color: '#EE6B1A' }} />

        <div className="min-h-[168px] sm:min-h-[140px]" aria-live="polite">
          <p
            key={index}
            className="text-[17px] leading-relaxed sm:text-[19px]"
            style={{ color: '#16181C' }}
          >
            {review.text}
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="text-[15px] font-bold" style={{ color: '#16181C' }}>
              {review.name}
            </span>
            <Stars rating={review.rating} />
            <span className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: '#6E7681' }}>
              via Google
            </span>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div
        className="flex items-center justify-between gap-4 border-t-2 px-6 py-4 sm:px-8"
        style={{ borderColor: '#16181C' }}
      >
        <button
          type="button"
          onClick={() => go(index - 1)}
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
              aria-current={i === index}
              className="h-2.5 w-2.5 transition-opacity"
              style={{
                background: i === index ? '#EE6B1A' : 'rgba(110,118,129,0.35)',
              }}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={() => go(index + 1)}
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
