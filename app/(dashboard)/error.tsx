'use client'

import { useEffect } from 'react'
import { AlertCircle } from 'lucide-react'
import Link from 'next/link'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log the error for debugging
    console.error('Dashboard error:', error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-8">
      <div className="max-w-md w-full bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <AlertCircle className="h-12 w-12 text-red-600 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-red-900 mb-2">Something went wrong</h2>
        <p className="text-sm text-red-700 mb-4">
          {error.message || 'An unexpected error occurred while loading this page.'}
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-medium"
          >
            Try again
          </button>
          <Link
            href="/dashboard"
            className="px-4 py-2 bg-white text-red-700 border border-red-200 rounded-lg hover:bg-red-50 transition font-medium"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
