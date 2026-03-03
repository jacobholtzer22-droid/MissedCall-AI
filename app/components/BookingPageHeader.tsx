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
  if (embed) {
    return (
      <header
        className="sticky top-0 z-40 border-b"
        style={{
          backgroundColor: '#ffffff',
          borderColor: '#e5e7eb',
          colorScheme: 'light',
        }}
      >
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex flex-col items-center text-center">
            <h1 className="text-xl sm:text-2xl font-bold leading-tight" style={{ color: '#111827' }}>
              {businessName
                ? `${bookingPageTitle} with ${businessName}`
                : bookingPageTitle}
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

  return (
    <header
      className="sticky top-0 z-40 border-b"
      style={{
        backgroundColor: '#ffffff',
        borderColor: '#e5e7eb',
        colorScheme: 'light',
      }}
    >
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 opacity-80 hover:opacity-100 transition"
            style={{ color: '#374151' }}
          >
            <Logo size="xs" variant="light" className="h-8 w-auto" />
            <span className="text-sm font-medium" style={{ color: '#6b7280' }}>
              Align and Acquire
            </span>
          </Link>
          {businessName && (
            <span className="text-sm font-medium truncate max-w-[200px] sm:max-w-none" style={{ color: '#374151' }}>
              {bookingPageTitle} with {businessName}
            </span>
          )}
        </div>
      </div>
    </header>
  )
}
