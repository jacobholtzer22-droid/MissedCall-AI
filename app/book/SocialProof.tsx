'use client'

import GoogleReviewsCard from '@/app/components/GoogleReviewsCard'

// Brett, then the same Google card the homepage renders — the component itself,
// not a copy, so the two surfaces cannot drift. It already paints its own white
// surface, so it needs no light variant to sit here.

const PHOTO = '/images/testimonial-master-gardener.jpg'

// Verbatim from the pre-rebuild BrettTestimonial component.
const QUOTE =
  "The ones I miss, the AI texts them back right away so I'm not losing work while I'm out on a job."

function Stars() {
  return (
    <div className="flex gap-0.5" role="img" aria-label="5 out of 5 stars">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} width="18" height="18" viewBox="0 0 24 24" fill="#FBBC04" aria-hidden="true">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      ))}
    </div>
  )
}

export default function SocialProof() {
  return (
    <div className="space-y-8">
      <figure>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={PHOTO}
          alt="Jacob shaking hands with Brett"
          className="w-full rounded-lg border object-cover"
          style={{ borderColor: 'var(--funnel-border)', maxHeight: 320 }}
        />
        <figcaption className="mt-4">
          <p className="text-[15px] leading-[1.6] text-neutral-800">{QUOTE}</p>
          <div className="mt-2">
            <Stars />
          </div>
          <p className="mt-1.5 text-[14px] font-semibold" style={{ color: 'var(--funnel-ink)' }}>
            Brett, Fraaza Enterprises
          </p>
        </figcaption>
      </figure>

      <GoogleReviewsCard collapsedCount={3} pinnedNames={['JAWS Lawn and Snow', 'Cameron Brillantes']} />
    </div>
  )
}
