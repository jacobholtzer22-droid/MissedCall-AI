'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Roboto } from 'next/font/google'
import { REVIEWS, GOOGLE_LISTING_URL, type Review } from './GoogleReviews'

// ─────────────────────────────────────────────────────────
// Google-parity review block for /book.
//
// Rendered in Google's LIGHT theme on purpose: name, body and reply greys only
// read correctly on white, and card-level parity was the requirement. That
// makes this a white surface sitting on the dark funnel page, which is how an
// embedded Google widget looks anyway.
//
// Roboto, not Google Sans. Google Sans is not licensed for third-party use.
// Roboto is Apache-2.0 and is what Google renders review bodies in.
//
// Data now comes from the live Google Business Profile pull, so dates and
// photos are real:
//   - relative dates are DERIVED from Google's createTime, never hand-written.
//     No timestamp means no date renders.
//   - profile photos are Google's own lh3 URLs. Those can rotate or 404, so a
//     failed load falls back to the initial circle rather than showing a broken
//     image, which is also what Google renders for photoless accounts.
//   - owner replies: none of the nine carry one, so no reply block is emitted.
//     The markup is ready if you start replying.
//
// The G mark attributes where the reviews live. It is never laid out to imply
// Google endorses the business.
// ─────────────────────────────────────────────────────────

const roboto = Roboto({ subsets: ['latin'], weight: ['400', '500'], display: 'swap' })

// Google's own values, sampled from the Maps review surface.
const G = {
  surface: '#FFFFFF',
  divider: '#E8EAED',
  name: '#202124',
  body: '#3C4043',
  meta: '#70757A',
  star: '#FBBC04',
  starEmpty: '#DADCE0',
  link: '#1A73E8',
  replyBg: '#F1F3F4',
}

// The palette Google assigns to photoless accounts.
const AVATAR_COLORS = ['#1A73E8', '#D93025', '#1E8E3E', '#9334E6', '#E37400', '#12B5CB', '#C5221F', '#188038']

/**
 * Google's own relative-date phrasing, computed from the real createTime.
 * Returns null when there is no timestamp, so nothing is ever invented.
 */
function relativeDate(iso?: string): string | null {
  if (!iso) return null
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return null
  const days = Math.floor((Date.now() - then) / 86_400_000)
  if (days < 1) return 'today'
  if (days < 7) return days === 1 ? 'a day ago' : `${days} days ago`
  const weeks = Math.floor(days / 7)
  if (days < 30) return weeks <= 1 ? 'a week ago' : `${weeks} weeks ago`
  const months = Math.floor(days / 30)
  if (days < 365) return months <= 1 ? 'a month ago' : `${months} months ago`
  const years = Math.floor(days / 365)
  return years <= 1 ? 'a year ago' : `${years} years ago`
}

const COLLAPSED_COUNT = 2
// Pinned to the top of the collapsed view. Names must match the review data
// exactly, which is why it is "Brillantes".
const PINNED_NAMES = ['Cameron Brillantes', 'Ryan']

function orderReviews(all: Review[]): Review[] {
  const pinned = PINNED_NAMES.map((n) => all.find((r) => r.name === n)).filter((r): r is Review => Boolean(r))
  const rest = all.filter((r) => !PINNED_NAMES.includes(r.name))
  return [...pinned, ...rest]
}

function colorFor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

function GoogleG({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}

/** Google renders 5 stars always, filling per rating. 14px, 2px apart. */
function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center" style={{ gap: 1 }} role="img" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            fill={i < rating ? G.star : G.starEmpty}
            d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"
          />
        </svg>
      ))}
    </span>
  )
}

function ReviewRow({ review, last }: { review: Review; last: boolean }) {
  const { name, rating, text, photoUrl, createdAt } = review
  const [photoBroken, setPhotoBroken] = useState(false)
  const date = relativeDate(createdAt)
  const [expanded, setExpanded] = useState(false)
  const [clamped, setClamped] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)

  // Measured rather than guessed from character count: whether four lines
  // actually truncate depends on rendered width.
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
    <li style={{ padding: '16px 0', borderBottom: last ? 'none' : `1px solid ${G.divider}` }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        {photoUrl && !photoBroken ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={photoUrl}
            alt=""
            aria-hidden="true"
            referrerPolicy="no-referrer"
            onError={() => setPhotoBroken(true)}
            style={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0, objectFit: 'cover' }}
          />
        ) : (
          <span
            aria-hidden="true"
            style={{
              width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
              background: colorFor(name), color: '#FFFFFF',
              display: 'grid', placeItems: 'center',
              fontSize: 18, fontWeight: 400, lineHeight: 1,
            }}
          >
            {name.trim().charAt(0).toUpperCase()}
          </span>
        )}

        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ color: G.name, fontSize: 14, fontWeight: 400, lineHeight: '20px' }}>{name}</div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
            <Stars rating={rating} />
            {/* Only if the data actually carries a date. */}
            {date && <span style={{ color: G.meta, fontSize: 12, lineHeight: '16px' }}>{date}</span>}
          </div>

          <div
            ref={bodyRef}
            style={{
              color: G.body, fontSize: 14, lineHeight: '20px', marginTop: 10,
              ...(expanded
                ? {}
                : { display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }),
            }}
          >
            {text}
          </div>

          {(clamped || expanded) && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              style={{
                color: G.link, fontSize: 14, lineHeight: '20px', marginTop: 2,
                background: 'none', border: 0, padding: '10px 0', cursor: 'pointer',
                minHeight: 44, display: 'inline-flex', alignItems: 'center',
              }}
            >
              {expanded ? 'Less' : 'More'}
            </button>
          )}

          {/* Owner reply. No review currently carries one, so nothing renders. */}
          {review.ownerReply && (
            <div style={{ background: G.replyBg, borderRadius: 8, padding: 12, marginTop: 12 }}>
              <div style={{ color: G.name, fontSize: 13, fontWeight: 500, lineHeight: '18px' }}>
                Response from the owner
              </div>
              <div style={{ color: G.body, fontSize: 13, lineHeight: '18px', marginTop: 4 }}>
                {review.ownerReply}
              </div>
            </div>
          )}
        </div>
      </div>
    </li>
  )
}

export default function GoogleReviewsCard() {
  const [showAll, setShowAll] = useState(false)
  const ordered = useMemo(() => orderReviews(REVIEWS), [])
  const visible = showAll ? ordered : ordered.slice(0, COLLAPSED_COUNT)
  const hidden = ordered.length - COLLAPSED_COUNT

  // Derived, never hardcoded, so adding a review updates both automatically.
  const average = REVIEWS.reduce((sum, r) => sum + r.rating, 0) / REVIEWS.length

  return (
    <section
      aria-label="Reviews from Google"
      className={roboto.className}
      style={{ background: G.surface, borderRadius: 8, padding: '4px 16px 16px' }}
    >
      <div
        style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between',
          gap: 8, padding: '12px 0', borderBottom: `1px solid ${G.divider}`,
        }}
      >
        <a
          href={GOOGLE_LISTING_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: G.name, fontSize: 14, textDecoration: 'none' }}
        >
          <GoogleG size={18} />
          Reviews from Google
        </a>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: G.meta, fontSize: 13 }}>
          <span style={{ color: G.name, fontWeight: 500 }}>{average.toFixed(1)}</span>
          <Stars rating={Math.round(average)} />
          <span>({REVIEWS.length})</span>
        </span>
      </div>

      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {visible.map((r, i) => (
          <ReviewRow key={r.name} review={r} last={i === visible.length - 1} />
        ))}
      </ul>

      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          aria-expanded={showAll}
          style={{
            width: '100%', minHeight: 44, marginTop: 8,
            background: 'none', border: `1px solid ${G.divider}`, borderRadius: 20,
            color: G.link, fontSize: 14, fontWeight: 500, cursor: 'pointer',
          }}
        >
          {showAll ? 'Show less' : `More reviews (${hidden})`}
        </button>
      )}
    </section>
  )
}
