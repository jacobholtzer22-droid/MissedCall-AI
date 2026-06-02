'use client'

import Link from 'next/link'
import { Logo } from './Logo'

export function BookingPageHeader({
  businessName,
  bookingPageTitle = 'Schedule a Free In-Person Quote',
  embed = false,
}: {
  businessName: string | null
  bookingPageTitle?: string
  embed?: boolean
}) {
  // Embed mode — keeps a light/neutral chrome since it renders inside
  // iframes on external client websites with any background color.
  if (embed) {
    return (
      <header
        className="sticky top-0 z-40 border-b"
        style={{ backgroundColor: '#ffffff', borderColor: '#e5e7eb', colorScheme: 'light' }}
      >
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex flex-col items-center text-center">
            <h1 className="text-xl sm:text-2xl font-bold leading-tight" style={{ color: '#111827' }}>
              {businessName ? `${bookingPageTitle} with ${businessName}` : bookingPageTitle}
            </h1>
            <div className="flex items-center justify-center gap-1.5 mt-2" style={{ color: '#9ca3af' }}>
              <Logo size="xs" variant="light" className="h-4 w-auto opacity-70" />
              <span className="text-xs font-normal">Booking courtesy of Align and Acquire</span>
            </div>
          </div>
        </div>
      </header>
    )
  }

  // Full (non-embed) header — branded dark chrome matching the site theme.
  return (
    <header
      className="sticky top-0 z-40 border-b-2"
      style={{
        background: 'rgba(22,24,28,0.96)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        borderColor: 'rgba(110,118,129,0.28)',
      }}
    >
      <div className="max-w-4xl mx-auto px-5 sm:px-8 py-3.5">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo size="sm" />
            <span className="hidden sm:block text-[13px] font-semibold" style={{ color: 'rgba(242,240,235,0.7)' }}>
              Align and Acquire
            </span>
          </Link>
          {businessName && (
            <span
              className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] truncate max-w-[200px] sm:max-w-none"
              style={{ color: '#6E7681' }}
            >
              {bookingPageTitle} · {businessName}
            </span>
          )}
        </div>
      </div>
    </header>
  )
}
