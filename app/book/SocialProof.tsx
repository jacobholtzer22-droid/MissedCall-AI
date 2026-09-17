'use client'

import GoogleReviewsCard from '@/app/components/GoogleReviewsCard'

// Client photos, then the same Google card the homepage renders — the component
// itself, not a copy, so the two surfaces cannot drift. It already paints its own
// white surface, so it needs no light variant to sit here.
//
// No outbound links in these testimonials. This renders on the paid-traffic
// landing and watch pages, where any link off the funnel is a leak.

type PhotoTestimonial = {
  photo: string
  alt: string
  quote: string
  credit: string
  /** Where the photo's crop sits. Faces sit high in these shots. */
  objectPosition?: string
}

const TESTIMONIALS: PhotoTestimonial[] = [
  {
    photo: '/images/testimonial-master-gardener.jpg',
    alt: 'Jacob shaking hands with Brett',
    // Verbatim from the pre-rebuild BrettTestimonial component.
    quote:
      "The ones I miss, the AI texts them back right away so I'm not losing work while I'm out on a job.",
    credit: 'Brett, Master Gardner LLC',
  },
  {
    photo: '/images/testimonial-big-bear-truck-repair.jpg',
    alt: 'Jacob shaking hands with Eduardo',
    // Eduardo's words, as he gave them to Jacob directly (not posted on Google).
    quote:
      'Jacob has brought me more traffic through my website, and he knows how to run and scale ads.',
    credit: 'Eduardo, Big Bear Truck Repair',
    objectPosition: 'center 30%',
  },
]

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

function Testimonial({ t }: { t: PhotoTestimonial }) {
  return (
    <figure>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={t.photo}
        alt={t.alt}
        loading="lazy"
        className="w-full rounded-lg border object-cover"
        style={{ borderColor: 'var(--funnel-border)', maxHeight: 320, objectPosition: t.objectPosition }}
      />
      <figcaption className="mt-4">
        <p className="text-[15px] leading-[1.6] text-neutral-800">{t.quote}</p>
        <div className="mt-2">
          <Stars />
        </div>
        <p className="mt-1.5 text-[14px] font-semibold" style={{ color: 'var(--funnel-ink)' }}>
          {t.credit}
        </p>
      </figcaption>
    </figure>
  )
}

export default function SocialProof() {
  return (
    <div className="space-y-8">
      {TESTIMONIALS.map((t) => (
        <Testimonial key={t.credit} t={t} />
      ))}

      <GoogleReviewsCard collapsedCount={3} pinnedNames={['JAWS Lawn and Snow', 'Cameron Brillantes']} />
    </div>
  )
}
