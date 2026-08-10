'use client'

import { useState } from 'react'
import { ImageOff } from 'lucide-react'

// ─────────────────────────────────────────────────────────
// Testimonial photo — client shaking hands with Jacob in
// front of Master Gardener LLC truck.
// File: public/images/testimonial-master-gardener.jpg
// ─────────────────────────────────────────────────────────
export default function TestimonialPhoto() {
  const [errored, setErrored] = useState(false)
  return (
    <div className="relative w-full overflow-hidden aspect-[4/5] lg:aspect-auto lg:h-full lg:min-h-[520px]" style={{ background: 'rgba(110,118,129,0.1)' }}>
      {errored ? (
        <div className="w-full h-full flex items-center justify-center">
          <ImageOff size={28} strokeWidth={1.5} style={{ color: '#6E7681' }} />
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/images/testimonial-master-gardener.jpg"
          alt="Jacob with Master Gardener LLC owner"
          className="w-full h-full object-cover object-[center_28%]"
          onError={() => setErrored(true)}
        />
      )}
    </div>
  )
}
