'use client'

import { useState } from 'react'
import { ImageOff } from 'lucide-react'

// ─────────────────────────────────────────────────────────
// Testimonial photo — a client shaking hands with Jacob.
// Files live in public/images/testimonial-*.jpg (1080×1440 portrait).
// objectPosition keeps faces in frame when the 4:5 box crops the 3:4 photo.
// ─────────────────────────────────────────────────────────
export default function TestimonialPhoto({
  src,
  alt,
  objectPosition = 'center 28%',
}: {
  src: string
  alt: string
  objectPosition?: string
}) {
  const [errored, setErrored] = useState(false)
  return (
    <div className="relative w-full overflow-hidden aspect-[4/5]" style={{ background: 'rgba(110,118,129,0.1)' }}>
      {errored ? (
        <div className="w-full h-full flex items-center justify-center">
          <ImageOff size={28} strokeWidth={1.5} style={{ color: '#6E7681' }} />
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          className="w-full h-full object-cover"
          style={{ objectPosition }}
          onError={() => setErrored(true)}
        />
      )}
    </div>
  )
}
