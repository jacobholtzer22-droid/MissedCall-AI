'use client'

import { useState } from 'react'

export function CancelBookingButton({
  appointmentId,
  onCancelled,
}: {
  appointmentId: string
  onCancelled?: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  async function handleCancel() {
    if (!confirmed) {
      setConfirmed(true)
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/bookings/${appointmentId}/cancel`, { method: 'POST' })
      if (res.ok) {
        onCancelled?.()
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleCancel}
      disabled={loading}
      className={`text-sm font-medium transition ${
        confirmed
          ? 'text-red-600 hover:text-red-700'
          : 'text-gray-500 hover:text-red-600'
      } disabled:opacity-50`}
    >
      {loading ? 'Cancelling...' : confirmed ? 'Click again to confirm' : 'Cancel'}
    </button>
  )
}
