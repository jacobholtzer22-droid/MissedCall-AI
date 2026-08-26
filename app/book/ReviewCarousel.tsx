'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Star, ChevronLeft, ChevronRight } from 'lucide-react'
import { REVIEWS, GOOGLE_LISTING_URL } from '@/app/components/GoogleReviews'

// ─────────────────────────────────────────────────────────
// Google reviews only. Brett has his own block above with his own photo, so
// nothing in here is ever paired with a face that is not the reviewer's.
//
// Arrows on both sides for click-through, tappable dots, real touch swipe, and
// auto-rotate that parks on any interaction and resumes after 10s idle.
// ─────────────────────────────────────────────────────────

const ROTATE_MS = 6000
const RESUME_AFTER_MS = 10_000
const SWIPE_THRESHOLD_PX = 40

function initialsOf(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('')
}

export default function ReviewCarousel() {
  const [index, setIndex] = useState(0)
  const [reduceMotion, setReduceMotion] = useState(false)
  const [hovering, setHovering] = useState(false)
  const [interactedAt, setInteractedAt] = useState<number | null>(null)
  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)
  const swiping = useRef(false)

  const nudge = useCallback(() => setInteractedAt(Date.now()), [])
  const go = useCallback((next: number) => {
    const n = REVIEWS.length
    setIndex(((next % n) + n) % n)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => setReduceMotion(mq.matches)
    apply()
    mq.addEventListener?.('change', apply)
    return () => mq.removeEventListener?.('change', apply)
  }, [])

  const parked = hovering || interactedAt !== null

  useEffect(() => {
    if (parked || reduceMotion) return
    const id = setInterval(() => setIndex((i) => (i + 1) % REVIEWS.length), ROTATE_MS)
    return () => clearInterval(id)
  }, [parked, reduceMotion])

  useEffect(() => {
    if (interactedAt === null) return
    const id = setTimeout(() => setInteractedAt(null), RESUME_AFTER_MS)
    return () => clearTimeout(id)
  }, [interactedAt])

  const review = REVIEWS[index]

  const arrow =
    'grid place-items-center shrink-0 w-11 h-11 border-2 transition-colors focus:outline-none focus-visible:ring-2'
  const arrowStyle = { borderColor: 'rgba(110,118,129,0.35)', color: '#6E7681' }

  return (
    <div
      className="border-2"
      style={{
        borderColor: 'rgba(110,118,129,0.35)',
        background: 'rgba(242,240,235,0.03)',
        touchAction: 'pan-y',
      }}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onTouchStart={(e) => {
        const t = e.touches[0]
        if (!t) return
        touchStartX.current = t.clientX
        touchStartY.current = t.clientY
        swiping.current = false
        nudge()
      }}
      onTouchMove={(e) => {
        const t = e.touches[0]
        const sx = touchStartX.current
        const sy = touchStartY.current
        if (!t || sx === null || sy === null) return
        // Only claim the gesture once it is clearly horizontal, so vertical
        // page scrolling is never hijacked.
        if (!swiping.current && Math.abs(t.clientX - sx) > Math.abs(t.clientY - sy) + 6) swiping.current = true
        if (swiping.current && e.cancelable) e.preventDefault()
      }}
      onTouchEnd={(e) => {
        const sx = touchStartX.current
        touchStartX.current = null
        touchStartY.current = null
        if (sx === null || !swiping.current) return
        const delta = (e.changedTouches[0]?.clientX ?? sx) - sx
        if (Math.abs(delta) >= SWIPE_THRESHOLD_PX) go(index + (delta < 0 ? 1 : -1))
        swiping.current = false
        nudge()
      }}
      aria-roledescription="carousel"
      aria-label="Google reviews"
    >
      <div className="flex items-center gap-2 p-2.5 sm:p-3">
        <button
          type="button"
          className={arrow}
          style={arrowStyle}
          aria-label="Previous review"
          onClick={() => {
            go(index - 1)
            nudge()
          }}
        >
          <ChevronLeft size={18} strokeWidth={2.5} />
        </button>

        <div key={index} className="min-w-0 flex-1 motion-safe:animate-[aaFade_280ms_ease-out]" aria-live="polite">
          <div className="flex items-center gap-1 mb-1" role="img" aria-label={`${review.rating} out of 5 stars`}>
            {Array.from({ length: review.rating }).map((_, i) => (
              <Star key={i} size={11} strokeWidth={0} fill="#FBBC04" aria-hidden="true" />
            ))}
          </div>
          <p
            className="text-[13px] leading-[1.5] overflow-hidden"
            style={{
              color: 'rgba(242,240,235,0.9)',
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {review.text}
          </p>
          <div className="mt-1.5 flex items-center gap-2 min-w-0">
            <span
              className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[9px] font-bold"
              style={{ background: 'rgba(110,118,129,0.35)', color: '#F2F0EB' }}
              aria-hidden="true"
            >
              {initialsOf(review.name)}
            </span>
            <span className="text-[12px] font-bold truncate" style={{ color: '#F2F0EB' }}>{review.name}</span>
            <span className="font-mono text-[9px] uppercase tracking-[0.16em] shrink-0" style={{ color: '#6E7681' }}>
              Google review
            </span>
          </div>
        </div>

        <button
          type="button"
          className={arrow}
          style={arrowStyle}
          aria-label="Next review"
          onClick={() => {
            go(index + 1)
            nudge()
          }}
        >
          <ChevronRight size={18} strokeWidth={2.5} />
        </button>
      </div>

      <div className="flex items-center justify-between px-3 pb-2">
        <div className="flex gap-1" role="tablist" aria-label="Reviews">
          {REVIEWS.map((r, i) => (
            <button
              key={r.name}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Show review from ${r.name}`}
              className="p-1"
              onClick={() => {
                go(i)
                nudge()
              }}
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
