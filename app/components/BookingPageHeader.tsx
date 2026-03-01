'use client'

import Link from 'next/link'
import { Logo } from './Logo'

export function BookingPageHeader({ businessName }: { businessName: string | null }) {
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
              Schedule a quote with {businessName}
            </span>
          )}
        </div>
      </div>
    </header>
  )
}
