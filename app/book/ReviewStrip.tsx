'use client'

import { useEffect, useRef, useState } from 'react'
import { Star } from 'lucide-react'
import { REVIEWS, GOOGLE_LISTING_URL } from '@/app/components/GoogleReviews'

// ─────────────────────────────────────────────────────────
// Compact social proof, high on /book, above the video.
//
// The handshake photo is the constant left element. It is Jacob with Brett of
// Master Gardener LLC, and it used to be its own block lower down the page.
// It MOVED here rather than being duplicated.
//
// Brett's own testimonial shows first. After that it rotates through the Google
// reviews. Because one photo sits beside many people's words, every slide
// carries an explicit, prominent attribution: nobody should read Klederson's
// review as Brett's. Non-Brett slides are labelled "Google review" and get
// their own initials chip.
//
// All text is verbatim. Nothing here is edited, trimmed for meaning, or
// invented.
// ─────────────────────────────────────────────────────────

const PHOTO = '/images/testimonial-master-gardener.jpg'
const ROTATE_MS = 6000

type Slide = {
  name: string
  attribution: string
  quote: string
  rating: number
  isBrett: boolean
}

const SLIDES: Slide[] = [
  {
    name: 'Brett',
    attribution: 'Master Gardener LLC',
    // Contiguous pull-quote from the testimonial published on /reviews.
    quote:
      "The ones I miss, the AI texts them back right away so I'm not losing work while I'm out on a job.",
    rating: 5,
    isBrett: true,
  },
  ...REVIEWS.map((r) => ({
    name: r.name,
    attribution: 'Google review',
    quote: r.text,
    rating: r.rating,
    isBrett: false,
  })),
]

function initialsOf(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('')
}

export default function ReviewStrip() {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [reduceMotion, setReduceMotion] = useState(false)
  const touchRef = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => setReduceMotion(mq.matches)
    apply()
    mq.addEventListener?.('change', apply)
    return () => mq.removeEventListener?.('change', apply)
  }, [])

  useEffect(() => {
    if (paused || reduceMotion) return
    const id = setInterval(() => setIndex((i) => (i + 1) % SLIDES.length), ROTATE_MS)
    return () => clearInterval(id)
  }, [paused, reduceMotion])

  const slide = SLIDES[index]

  return (
    <div
      className="border-2 overflow-hidden"
      style={{ borderColor: 'rgba(110,118,129,0.35)', background: 'rgba(242,240,235,0.03)' }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={() => {
        touchRef.current = true
        setPaused(true)
      }}
      onTouchEnd={() => {
        // Resume shortly after the finger lifts so a scroll past does not
        // freeze the strip for the rest of the session.
        if (touchRef.current) setTimeout(() => setPaused(false), 4000)
      }}
      aria-live="polite"
    >
      <div className="flex items-stretch gap-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={PHOTO}
          alt="Jacob shaking hands with Brett of Master Gardener LLC"
          className="w-[104px] sm:w-[132px] shrink-0 object-cover object-[center_28%]"
        />
        <div key={index} className="min-w-0 flex-1 p-3.5 sm:p-4 motion-safe:animate-[aaFade_300ms_ease-out]">
          <div className="flex items-center gap-1.5 mb-1.5">
            {Array.from({ length: slide.rating }).map((_, i) => (
              <Star key={i} size={12} strokeWidth={0} fill="#FBBC04" aria-hidden="true" />
            ))}
            <span className="sr-only">{slide.rating} out of 5 stars</span>
          </div>
          <p
            className="text-[13px] sm:text-[14px] leading-[1.55] overflow-hidden"
            style={{
              color: 'rgba(242,240,235,0.9)',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {slide.quote}
          </p>
          <div className="mt-2 flex items-center gap-2 min-w-0">
            {!slide.isBrett && (
              <span
                className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[9px] font-bold"
                style={{ background: 'rgba(110,118,129,0.35)', color: '#F2F0EB' }}
                aria-hidden="true"
              >
                {initialsOf(slide.name)}
              </span>
            )}
            <span className="text-[12px] font-bold truncate" style={{ color: '#F2F0EB' }}>
              {slide.name}
            </span>
            <span className="font-mono text-[9px] uppercase tracking-[0.16em] truncate" style={{ color: '#6E7681' }}>
              {slide.attribution}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between px-3.5 sm:px-4 pb-2.5">
        <div className="flex gap-1" role="tablist" aria-label="Reviews">
          {SLIDES.map((s, i) => (
            <button
              key={s.name + i}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Show review from ${s.name}`}
              aria-selected={i === index}
              role="tab"
              className="p-1"
            >
              <span
                className="block h-1 w-1 rounded-full"
                style={{ background: i === index ? '#EE6B1A' : 'rgba(110,118,129,0.45)' }}
              />
            </button>
          ))}
        </div>
        <a
          href={GOOGLE_LISTING_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-[9px] uppercase tracking-[0.16em] underline underline-offset-4"
          style={{ color: '#6E7681' }}
        >
          See all on Google
        </a>
      </div>
    </div>
  )
}
