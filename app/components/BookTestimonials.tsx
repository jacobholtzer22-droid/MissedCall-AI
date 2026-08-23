'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Star } from 'lucide-react'

// ─────────────────────────────────────────────────────────
// /book landing social proof.
//
// Every quote is reproduced VERBATIM from content already published on this
// site. The eight Google reviews come from app/components/GoogleReviews.tsx
// (public Google Business Profile listing, all 5 star). The Brett card is a
// contiguous pull-quote cut from the Master Gardener LLC testimonial on
// app/reviews/page.tsx — words are removed from the ends only, never changed,
// reordered, or added.
//
// Business type is deliberately absent on the Google reviews: it is not
// published anywhere, and inventing it is not an option. Add it later only
// from confirmed source.
//
// Card height is fixed so this cannot push the CTA below the fold on a phone.
// ─────────────────────────────────────────────────────────

type Testimonial = {
  name: string
  business?: string
  rating: number
  quote: string
  photo?: string
  photoAlt?: string
}

// Order is intentional: the two most on-message for a missed-call funnel lead,
// then the photo card, then the rest.
const TESTIMONIALS: Testimonial[] = [
  {
    name: 'Ryan',
    rating: 5,
    quote:
      'Helped me stay focused on the job and not lose any leads. Works even better than expected. 100% recommend',
  },
  {
    name: 'Brett',
    business: 'Master Gardener LLC',
    rating: 5,
    // Contiguous cut from the full testimonial on /reviews. Nothing reworded.
    quote:
      "The ones I miss, the AI texts them back right away so I'm not losing work while I'm out on a job.",
    photo: '/images/testimonial-master-gardener.jpg',
    photoAlt: 'Jacob shaking hands with Brett of Master Gardener LLC',
  },
  {
    name: 'Cameron Brillantes',
    rating: 5,
    quote:
      'Great experience working with Align and Acquire. Jacob is professional, responsive, and really understands how to help local businesses generate more leads. Highly recommend if you’re looking to grow your business and stop missing potential customers.',
  },
  {
    name: 'Benji Hussey',
    rating: 5,
    quote:
      'Great experience working with Jacob, he is very involved and you can tell he really cares about his client relationships. Would recommend',
  },
  {
    name: 'Colin Albright',
    rating: 5,
    quote:
      'Highly recommend Align & Acquire! They built an awesome website for my business and were great to work with. Very helpful, professional, and always quick to answer questions. I’m extremely happy with the final result!',
  },
  {
    name: 'Hayley Harpe',
    rating: 5,
    quote:
      'Highly recommend the service Jacob offers! He is super professional and always on time. Also a super friendly guy who cares about his customers. 5 stars all the way!!!!',
  },
  {
    name: 'Klederson Rodas',
    rating: 5,
    quote:
      'Great communication, affordable pricing, and quality work. I’ve definitely seen results from the work he does. Highly recommend!',
  },
  {
    name: 'Will Schnelk',
    rating: 5,
    quote: 'Great service, jacob is respectful and is very knowledgeable on what he’s doing.',
  },
  {
    name: 'Keegan Kaiser',
    rating: 5,
    quote:
      'Liam got me connected with this amazing company through a call and I was grateful to have answered it. I got in communication with Jacob the owner who helped me strategize ways to make my business better. Great experience overall',
  },
]

const ROTATE_MS = 5000
const SWIPE_THRESHOLD_PX = 40

// Muted, theme-consistent anchors. No stock photos, no fake avatars.
const INITIAL_COLORS = ['#EE6B1A', '#6E7681', '#8B7355', '#5C7A89', '#7A6A8A']

function initialsOf(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

function colorFor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return INITIAL_COLORS[hash % INITIAL_COLORS.length]
}

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: rating }).map((_, i) => (
        <Star key={i} size={13} strokeWidth={0} fill="#EE6B1A" aria-hidden="true" />
      ))}
    </div>
  )
}

function Attribution({ item }: { item: Testimonial }) {
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      {!item.photo && (
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-bold"
          style={{ background: colorFor(item.name), color: '#16181C' }}
          aria-hidden="true"
        >
          {initialsOf(item.name)}
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-bold" style={{ color: '#F2F0EB' }}>
          {item.name}
        </span>
        {item.business && (
          <span
            className="block truncate font-mono text-[9px] uppercase tracking-[0.18em]"
            style={{ color: '#6E7681' }}
          >
            {item.business}
          </span>
        )}
      </span>
    </div>
  )
}

function Card({ item }: { item: Testimonial }) {
  if (item.photo) {
    return (
      <div className="grid h-full grid-cols-[38%_1fr]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.photo}
          alt={item.photoAlt ?? ''}
          className="h-full w-full object-cover object-[center_28%]"
        />
        <div className="flex min-w-0 flex-col justify-between p-4">
          <div>
            <Stars rating={item.rating} />
            <p
              className="mt-2 overflow-hidden text-[13px] leading-snug"
              style={{
                color: 'rgba(242,240,235,0.88)',
                display: '-webkit-box',
                WebkitLineClamp: 4,
                WebkitBoxOrient: 'vertical',
              }}
            >
              {item.quote}
            </p>
          </div>
          <Attribution item={item} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col justify-between p-4 sm:p-5">
      <div>
        <Stars rating={item.rating} />
        <p
          className="mt-2 overflow-hidden text-[13px] leading-snug sm:text-[14px]"
          style={{
            color: 'rgba(242,240,235,0.88)',
            display: '-webkit-box',
            WebkitLineClamp: 4,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {item.quote}
        </p>
      </div>
      <Attribution item={item} />
    </div>
  )
}

export default function BookTestimonials() {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [reduceMotion, setReduceMotion] = useState(false)
  const touchStartX = useRef<number | null>(null)
  const count = TESTIMONIALS.length

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => setReduceMotion(mq.matches)
    apply()
    mq.addEventListener?.('change', apply)
    return () => mq.removeEventListener?.('change', apply)
  }, [])

  const go = useCallback((next: number) => setIndex(((next % count) + count) % count), [count])

  useEffect(() => {
    if (paused || reduceMotion) return
    const id = setInterval(() => setIndex((i) => (i + 1) % count), ROTATE_MS)
    return () => clearInterval(id)
  }, [paused, reduceMotion, count])

  const active = useMemo(() => TESTIMONIALS[index], [index])

  return (
    <div
      className="mb-7"
      role="group"
      aria-roledescription="carousel"
      aria-label="Customer reviews"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={(e) => {
        setPaused(true)
        touchStartX.current = e.touches[0]?.clientX ?? null
      }}
      onTouchEnd={(e) => {
        const start = touchStartX.current
        touchStartX.current = null
        if (start == null) return
        const delta = (e.changedTouches[0]?.clientX ?? start) - start
        if (Math.abs(delta) >= SWIPE_THRESHOLD_PX) go(index + (delta < 0 ? 1 : -1))
      }}
    >
      {/* Fixed height keeps the CTA above the fold on a phone. */}
      <div
        className="h-[150px] overflow-hidden border-2"
        style={{ borderColor: 'rgba(110,118,129,0.35)', background: 'rgba(242,240,235,0.03)' }}
      >
        <div key={index} className="h-full animate-[aaFade_320ms_ease-out]">
          <Card item={active} />
        </div>
      </div>

      <div className="mt-3 flex items-center justify-center gap-2">
        {TESTIMONIALS.map((t, i) => (
          <button
            key={t.name}
            type="button"
            onClick={() => go(i)}
            aria-label={`Show review ${i + 1} of ${count}`}
            aria-current={i === index ? 'true' : undefined}
            className="p-1.5"
          >
            <span
              className="block h-1.5 w-1.5 rounded-full transition-colors"
              style={{ background: i === index ? '#EE6B1A' : 'rgba(110,118,129,0.45)' }}
            />
          </button>
        ))}
      </div>
    </div>
  )
}
