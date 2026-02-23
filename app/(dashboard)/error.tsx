'use client'

import { useEffect } from 'react'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Dashboard error:', error)
  }, [error])

  const isDbError =
    error.message?.includes('does not exist in the current database') ||
    error.message?.includes('PrismaClientKnownRequestError')

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center p-8 max-w-md">
        <h2 className="text-xl font-bold text-gray-900 mb-2">
          {isDbError ? 'Database schema out of sync' : 'Something went wrong'}
        </h2>
        <p className="text-gray-600 mb-4">
          {isDbError
            ? 'The database is missing columns from the latest schema update. Run "npx prisma db push" to fix this.'
            : 'An unexpected error occurred loading the dashboard.'}
        </p>
        <button
          onClick={reset}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          Try again
        </button>
      </div>
    </div>
  )
}
