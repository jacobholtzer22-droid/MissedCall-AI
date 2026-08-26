'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Star, ChevronDown, ChevronUp } from 'lucide-react'
import { REVIEWS, GOOGLE_LISTING_URL, type Review } from './GoogleReviews'

// ─────────────────────────────────────────────────────────
// Google-styled reviews block for /book.
//
// Separate component on purpose: the shared GoogleReviews still renders on /
// and /reviews, which are not in scope, so restyling in place would have
// changed them too.
//
// Collapsed by default to exactly two reviews. The point of the collapse is
// that the video section stays reachable in the first scroll on a phone:
// reviews come first, but they must not bury Step 1.
//
// Review text is VERBATIM. Long reviews clamp to three lines with a real expand
// control, never a rewrite, and the full text is always in the DOM as real text
// so it stays selectable, translatable and readable by a screen reader.
//
// No dates render. The source data carries no timestamps and a relative date
// would be fabricated.
// ─────────────────────────────────────────────────────────

const GOOGLE_STAR = '#FBBC04'
const COLLAPSED_COUNT = 2

// Pinned to the top of the collapsed view, in this order. Names must match the
// review data exactly, which is why it is "Brillantes" here.
const PINNED_NAMES = ['Cameron Brillantes', 'Ryan']

function orderReviews(all: Review[]): Review[] {
  const pinned = PINNED_NAMES.map((n) => all.find((r) => r.name === n)).filter(
    (r): r is Review => Boolean(r)
  )
  const rest = all.filter((r) => !PINNED_NAMES.includes(r.name))
  return [...pinned, ...rest]
}

function GoogleG({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}

function Stars({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} size={size} strokeWidth={0} fill={i < rating ? GOOGLE_STAR : 'rgba(110,118,129,0.4)'} aria-hidden="true" />
      ))}
    </span>
  )
}

function initialsOf(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('')
}

const AVATAR_COLORS = ['#EE6B1A', '#5C7A89', '#8B7355', '#7A6A8A', '#4E7A5E']
function colorFor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

function ReviewCard({ name, rating, text }: Review) {
  const [expanded, setExpanded] = useState(false)
  const [clamped, setClamped] = useState(false)
  const bodyRef = useRef<HTMLParagraphElement>(null)

  // Measured, not guessed from character count: whether three lines actually
  // truncate depends on the rendered width.
  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    const check = () => setClamped(el.scrollHeight - el.clientHeight > 2)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <li className="border-2 p-3.5 sm:p-5" style={{ borderColor: 'rgba(110,118,129,0.3)', background: 'rgba(242,240,235,0.03)' }}>
      <div className="flex items-center gap-3 mb-2.5">
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[13px] font-bold"
          style={{ background: colorFor(name), color: '#16181C' }}
          aria-hidden="true"
        >
          {initialsOf(name)}
        </span>
        <span className="min-w-0">
          <span className="block text-[14px] font-bold truncate" style={{ color: '#F2F0EB' }}>{name}</span>
          <Stars rating={rating} />
        </span>
      </div>
      <p
        ref={bodyRef}
        className={expanded ? 'text-[14px] leading-[1.6]' : 'text-[14px] leading-[1.6] overflow-hidden'}
        style={
          expanded
            ? { color: 'rgba(242,240,235,0.85)' }
            : {
                color: 'rgba(242,240,235,0.85)',
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical',
              }
        }
      >
        {text}
      </p>
      {(clamped || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-1 inline-flex items-center font-mono text-[10px] uppercase tracking-[0.16em] underline underline-offset-4 min-h-[44px]"
          style={{ color: '#6E7681' }}
        >
          {expanded ? 'Show less' : 'Read more'}
        </button>
      )}
    </li>
  )
}

export default function GoogleReviewsCard() {
  const [showAll, setShowAll] = useState(false)
  const ordered = useMemo(() => orderReviews(REVIEWS), [])
  const visible = showAll ? ordered : ordered.slice(0, COLLAPSED_COUNT)
  const hidden = ordered.length - COLLAPSED_COUNT

  // Derived, never hardcoded: adding a review updates the count and the
  // aggregate everywhere automatically.
  const average = REVIEWS.reduce((sum, r) => sum + r.rating, 0) / REVIEWS.length

  return (
    <section aria-label="Reviews from Google">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <a
          href={GOOGLE_LISTING_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-[13px] font-semibold underline underline-offset-4"
          style={{ color: 'rgba(242,240,235,0.85)' }}
        >
          <GoogleG size={17} />
          Reviews from Google
        </a>
        <span className="inline-flex items-center gap-2 text-[13px]" style={{ color: '#6E7681' }}>
          <span className="font-bold tabular-nums" style={{ color: '#F2F0EB' }}>{average.toFixed(1)}</span>
          <Stars rating={Math.round(average)} size={13} />
          <span>{REVIEWS.length} reviews</span>
        </span>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2">
        {visible.map((r) => (
          <ReviewCard key={r.name} {...r} />
        ))}
      </ul>

      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          aria-expanded={showAll}
          className="mt-4 w-full border-2 py-3.5 text-[14px] font-bold uppercase tracking-wide inline-flex items-center justify-center gap-2 min-h-[52px]"
          style={{ borderColor: 'rgba(110,118,129,0.4)', color: '#F2F0EB' }}
        >
          {showAll ? (
            <>
              See less <ChevronUp size={16} strokeWidth={2.5} />
            </>
          ) : (
            <>
              See more <span style={{ color: '#6E7681' }}>({hidden})</span> <ChevronDown size={16} strokeWidth={2.5} />
            </>
          )}
        </button>
      )}
    </section>
  )
}
