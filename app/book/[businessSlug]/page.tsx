'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Calendar, Clock, User, Phone, Mail, FileText, CheckCircle } from 'lucide-react'

interface TimeSlot {
  start: string
  end: string
  display: string
}

interface SlotsDebug {
  businessId: string
  calendarEnabled: boolean
  googleCalendarConnected: boolean
  tokensExist: boolean
  businessHours: Record<string, { open: string; close: string } | null>
  timezone: string
  dateRangeQueried: { start: string; end: string }
  timeMin: string
  timeMax: string
  googleCalendarBusyTimes: { start: string; end: string }[]
  googleCalendarError?: string
  slotsBeforeFiltering: number
  slotsAfterPastFilter: number
  finalSlotCount: number
}

export default function BookingPage() {
  const params = useParams()
  const slug = params.businessSlug as string

  const [businessName, setBusinessName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [calendarConnected, setCalendarConnected] = useState(false)
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [slots, setSlots] = useState<TimeSlot[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null)
  const [slotsDebug, setSlotsDebug] = useState<SlotsDebug | null>(null)

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [service, setService] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [confirmation, setConfirmation] = useState<{ scheduledAt: string; serviceType: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!slug) return
    fetch(`/api/bookings/available-slots?businessSlug=${slug}&start=${new Date().toISOString().slice(0, 10)}&end=${addDays(new Date(), 14).toISOString().slice(0, 10)}`)
      .then(res => res.json())
      .then(data => {
        setBusinessName(data.businessName ?? null)
        setCalendarConnected(data.calendarEnabled === true && !data.error?.includes('not connected') && !!data.businessName)
        setLoading(false)
      })
      .catch(() => {
        setLoading(false)
        setError('Failed to load booking page')
      })
  }, [slug])

  useEffect(() => {
    if (!slug || !selectedDate) {
      setSlots([])
      setSlotsDebug(null)
      return
    }
    setSlotsLoading(true)
    setSelectedSlot(null)
    fetch(`/api/bookings/available-slots?businessSlug=${slug}&start=${selectedDate}&end=${selectedDate}`)
      .then(res => res.json())
      .then(data => {
        setSlots(data.slots ?? [])
        setSlotsDebug(data.debug ?? null)
        setSlotsLoading(false)
      })
      .catch(() => {
        setSlots([])
        setSlotsDebug(null)
        setSlotsLoading(false)
      })
  }, [slug, selectedDate])

  const today = new Date().toISOString().slice(0, 10)
  const maxDate = addDays(new Date(), 30).toISOString().slice(0, 10)

  function addDays(d: Date, n: number) {
    const out = new Date(d)
    out.setDate(out.getDate() + n)
    return out
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedSlot || !name.trim() || !phone.trim() || !service.trim()) return
    setSubmitting(true)
    setError(null)
    fetch('/api/bookings/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        businessSlug: slug,
        customerName: name.trim(),
        customerPhone: phone.trim(),
        customerEmail: email.trim() || undefined,
        slotStart: selectedSlot.start,
        serviceType: service.trim(),
      }),
    })
      .then(async res => {
        const data = await res.json()
        if (res.ok) {
          setConfirmation({
            scheduledAt: data.appointment.scheduledAt,
            serviceType: data.appointment.serviceType,
          })
        } else {
          setError(data.error ?? 'Booking failed')
        }
      })
      .catch(() => setError('Booking failed'))
      .finally(() => setSubmitting(false))
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#f9fafb' }}>
        <div style={{ color: '#374151' }}>Loading...</div>
      </div>
    )
  }

  if (!calendarConnected || !businessName) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: '#f9fafb' }}>
        <div className="rounded-2xl shadow-lg border p-8 max-w-md text-center" style={{ backgroundColor: '#ffffff', borderColor: '#e5e7eb' }}>
          <Calendar className="h-12 w-12 mx-auto mb-4" style={{ color: '#d1d5db' }} />
          <h1 className="text-xl font-semibold mb-2" style={{ color: '#111827' }}>Booking Not Available</h1>
          <p className="mb-6" style={{ color: '#374151' }}>
            {businessName
              ? `${businessName} doesn't have online booking enabled. Please call or text to schedule.`
              : 'Business not found.'}
          </p>
          <Link href="/" className="font-medium" style={{ color: '#2563eb' }}>
            ← Back to home
          </Link>
        </div>
      </div>
    )
  }

  if (confirmation) {
    const d = new Date(confirmation.scheduledAt)
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: '#f9fafb' }}>
        <div className="rounded-2xl shadow-lg border p-8 max-w-md text-center" style={{ backgroundColor: '#ffffff', borderColor: '#e5e7eb' }}>
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="h-10 w-10" style={{ color: '#16a34a' }} />
          </div>
          <h1 className="text-2xl font-bold mb-2" style={{ color: '#111827' }}>You're All Set!</h1>
          <p className="mb-6" style={{ color: '#374151' }}>
            Your {confirmation.serviceType} appointment with {businessName} is confirmed for{' '}
            {d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} at{' '}
            {d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}.
          </p>
          <p className="text-sm" style={{ color: '#374151' }}>You'll receive a confirmation text shortly.</p>
        </div>
      </div>
    )
  }

  const inputStyle = { color: '#111827', backgroundColor: '#ffffff', border: '1px solid #d1d5db' } as const
  const labelStyle = { color: '#374151' } as const

  return (
    <div className="min-h-screen py-12 px-4" style={{ backgroundColor: '#f9fafb' }}>
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold" style={{ color: '#111827' }}>Book with {businessName}</h1>
          <p className="mt-1" style={{ color: '#6b7280' }}>Select a date and time that works for you</p>
        </div>

        <div className="rounded-2xl shadow-lg overflow-hidden" style={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb' }}>
          <form onSubmit={handleSubmit} className="p-6 md:p-8 space-y-6">
            {/* Date picker */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium mb-2" style={labelStyle}>
                <Calendar className="h-4 w-4" />
                Date
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                min={today}
                max={maxDate}
                className="w-full px-4 py-3 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                style={inputStyle}
              />
            </div>

            {/* Time slots */}
            {selectedDate && (
              <div>
                <label className="flex items-center gap-2 text-sm font-medium mb-2" style={labelStyle}>
                  <Clock className="h-4 w-4" />
                  Available Times
                </label>
                {slotsLoading ? (
                  <p className="text-sm" style={{ color: '#6b7280' }}>Loading...</p>
                ) : slots.length === 0 ? (
                  <div>
                    <p className="text-sm" style={{ color: '#6b7280' }}>No availability on this date</p>
                    {slotsDebug && (
                      <details className="mt-4">
                        <summary className="text-xs font-medium cursor-pointer" style={{ color: '#6b7280' }}>
                          Debug info
                        </summary>
                        <pre className="mt-2 p-4 rounded-lg text-xs overflow-auto max-h-64" style={{ backgroundColor: '#f3f4f6', color: '#111827' }}>
                          {JSON.stringify(slotsDebug, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {slots.map(slot => (
                        <button
                          key={slot.start}
                          type="button"
                          onClick={() => setSelectedSlot(slot)}
                          className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                            selectedSlot?.start === slot.start
                              ? 'bg-blue-600 text-white'
                              : 'hover:bg-gray-200'
                          }`}
                          style={selectedSlot?.start === slot.start ? undefined : { backgroundColor: '#f3f4f6', color: '#374151' }}
                        >
                          {slot.display}
                        </button>
                      ))}
                    </div>
                    {slotsDebug && (
                      <details className="mt-4">
                        <summary className="text-xs font-medium cursor-pointer" style={{ color: '#6b7280' }}>
                          Debug info
                        </summary>
                        <pre className="mt-2 p-4 rounded-lg text-xs overflow-auto max-h-64" style={{ backgroundColor: '#f3f4f6', color: '#111827' }}>
                          {JSON.stringify(slotsDebug, null, 2)}
                        </pre>
                      </details>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Customer form */}
            <div className="border-t pt-6 space-y-4" style={{ borderColor: '#f3f4f6' }}>
              <div>
                <label className="flex items-center gap-2 text-sm font-medium mb-2" style={labelStyle}>
                  <User className="h-4 w-4" />
                  Your Name *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                  placeholder="John Smith"
                  className="w-full px-4 py-3 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  style={inputStyle}
                />
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm font-medium mb-2" style={labelStyle}>
                  <Phone className="h-4 w-4" />
                  Phone *
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  required
                  placeholder="(555) 123-4567"
                  className="w-full px-4 py-3 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  style={inputStyle}
                />
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm font-medium mb-2" style={labelStyle}>
                  <Mail className="h-4 w-4" />
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="john@example.com"
                  className="w-full px-4 py-3 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  style={inputStyle}
                />
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm font-medium mb-2" style={labelStyle}>
                  <FileText className="h-4 w-4" />
                  Service / Description *
                </label>
                <input
                  type="text"
                  value={service}
                  onChange={e => setService(e.target.value)}
                  required
                  placeholder="e.g. Teeth cleaning, Haircut"
                  className="w-full px-4 py-3 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  style={inputStyle}
                />
              </div>
            </div>

            {error && (
              <div className="p-4 rounded-xl text-sm" style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c' }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={!selectedSlot || !name.trim() || !phone.trim() || !service.trim() || submitting}
              className="w-full py-4 text-white font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
              style={{ backgroundColor: '#2563eb' }}
            >
              {submitting ? 'Booking...' : 'Confirm Booking'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm mt-6" style={{ color: '#6b7280' }}>
          <Link href="/" style={{ color: '#2563eb' }}>
            ← Back to home
          </Link>
        </p>
      </div>
    </div>
  )
}
