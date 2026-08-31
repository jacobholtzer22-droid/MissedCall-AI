'use client'

import { Star } from 'lucide-react'

// ─────────────────────────────────────────────────────────
// Brett's photo and Brett's words, locked together and static.
//
// This used to be slide 1 of a rotating strip, which meant the handshake photo
// stayed on screen while OTHER people's reviews rotated past it. The picture
// did not match the review. Splitting it out is the fix: this photo now only
// ever appears beside the testimonial it belongs to.
//
// Full text renders, no clamp, so there is nothing to expand and nothing to
// cut off on a phone.
// ─────────────────────────────────────────────────────────

const PHOTO = '/images/testimonial-master-gardener.jpg'

// Contiguous pull-quote from the testimonial published on /reviews. Verbatim.
const QUOTE =
  "The ones I miss, the AI texts them back right away so I'm not losing work while I'm out on a job."

/**
 * `bare` drops the heavy border and tightens the box for the arm B layout,
 * which has exactly one bordered card (the form). Arm A passes nothing and is
 * pixel-identical to before.
 */
export default function BrettTestimonial({ bare = false }: { bare?: boolean } = {}) {
  return (
    <div
      className={`overflow-hidden flex items-stretch${bare ? ' rounded-lg' : ' border-2'}`}
      style={{
        ...(bare ? {} : { borderColor: 'rgba(110,118,129,0.35)' }),
        background: 'rgba(242,240,235,0.03)',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={PHOTO}
        alt="Jacob shaking hands with Brett of Master Gardener LLC"
        className="w-[76px] sm:w-[120px] shrink-0 self-stretch object-cover object-[center_28%]"
      />
      <div className="min-w-0 flex-1 px-3 py-2.5 sm:p-4">
        <div className="flex items-center gap-0.5 mb-1" role="img" aria-label="5 out of 5 stars">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={i} size={11} strokeWidth={0} fill="#FBBC04" aria-hidden="true" />
          ))}
        </div>
        <p className="text-[12.5px] sm:text-[14px] leading-[1.45]" style={{ color: 'rgba(242,240,235,0.9)' }}>
          {QUOTE}
        </p>
        <div className="mt-1.5 flex items-baseline gap-2 min-w-0">
          <span className="text-[12px] font-bold shrink-0" style={{ color: '#F2F0EB' }}>Brett</span>
          <span className="font-mono text-[9px] uppercase tracking-[0.16em] truncate" style={{ color: '#6E7681' }}>
            Master Gardener LLC
          </span>
        </div>
      </div>
    </div>
  )
}
