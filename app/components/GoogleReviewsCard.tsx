'use client'

import { useState } from 'react'
import { Star } from 'lucide-react'
import { REVIEWS, GOOGLE_LISTING_URL } from './GoogleReviews'

// ─────────────────────────────────────────────────────────
// Google-styled reviews block for /book.
//
// Separate component on purpose: the shared GoogleReviews is still rendered on
// / and /reviews and those pages are not in scope, so restyling in place would
// have changed them too.
//
// Review text is VERBATIM. Long reviews truncate with a real expand control,
// never a rewrite, and the full text is always in the DOM as real text so it
// stays selectable, translatable and readable by a screen reader.
//
// There is no date on any review. The source data has no timestamps, so no
// relative date renders rather than a fabricated one.
// ─────────────────────────────────────────────────────────

const GOOGLE_STAR = '#FBBC04'
const TRUNCATE_AT = 165

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

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          size={14}
          strokeWidth={0}
          fill={i < rating ? GOOGLE_STAR : 'rgba(110,118,129,0.4)'}
          aria-hidden="true"
        />
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

function ReviewCard({ name, rating, text }: { name: string; rating: number; text: string }) {
  const [expanded, setExpanded] = useState(false)
  const isLong = text.length > TRUNCATE_AT
  const shown = !isLong || expanded ? text : `${text.slice(0, TRUNCATE_AT).trimEnd()}…`

  return (
    <li
      className="border-2 p-4 sm:p-5"
      style={{ borderColor: 'rgba(110,118,129,0.3)', background: 'rgba(242,240,235,0.03)' }}
    >
      <div className="flex items-center gap-3 mb-3">
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[13px] font-bold"
          style={{ background: colorFor(name), color: '#16181C' }}
          aria-hidden="true"
        >
          {initialsOf(name)}
        </span>
        <span className="min-w-0">
          <span className="block text-[14px] font-bold truncate" style={{ color: '#F2F0EB' }}>
            {name}
          </span>
          <Stars rating={rating} />
        </span>
      </div>
      <p className="text-[14px] leading-[1.6]" style={{ color: 'rgba(242,240,235,0.85)' }}>
        {shown}
      </p>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-2 font-mono text-[10px] uppercase tracking-[0.16em] underline underline-offset-4 min-h-[44px]"
          style={{ color: '#6E7681' }}
        >
          {expanded ? 'Show less' : 'Read more'}
        </button>
      )}
    </li>
  )
}

export default function GoogleReviewsCard() {
  const average = REVIEWS.reduce((sum, r) => sum + r.rating, 0) / REVIEWS.length

  return (
    <section aria-label="Reviews from Google">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
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
          <span className="font-bold tabular-nums" style={{ color: '#F2F0EB' }}>
            {average.toFixed(1)}
          </span>
          <Stars rating={Math.round(average)} />
          <span>{REVIEWS.length} reviews</span>
        </span>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2">
        {REVIEWS.map((r) => (
          <ReviewCard key={r.name} name={r.name} rating={r.rating} text={r.text} />
        ))}
      </ul>
    </section>
  )
}
