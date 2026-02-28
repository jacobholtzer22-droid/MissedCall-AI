'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { Calendar, Clock, User, Phone, Mail, FileText, CheckCircle } from 'lucide-react'

const EMBED_MESSAGE_TYPE = 'booking-embed-height'

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

function sendHeightToParent(height: number) {
  if (typeof window !== 'undefined' && window.parent !== window) {
    window.parent.postMessage({ type: EMBED_MESSAGE_TYPE, height }, '*')
  }
}

export default function EmbedBookingPage() {
  const params = useParams()
  const slug = params.businessSlug as string
  const containerRef = useRef<HTMLDivElement>(null)

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

  const reportHeight = useCallback(() => {
    if (containerRef.current) {
      const height = containerRef.current.scrollHeight
      sendHeightToParent(height)
    }
  }, [])

  useEffect(() => {
    if (!containerRef.current) return
    const el = containerRef.current
    const observer = new ResizeObserver(() => reportHeight())
    observer.observe(el)
    reportHeight()
    return () => observer.disconnect()
  }, [reportHeight, loading, calendarConnected, confirmation, selectedDate, slots, selectedSlot])

  useEffect(() => {
    reportHeight()
  }, [reportHeight, loading, calendarConnected, confirmation, selectedDate, slots, selectedSlot])

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
      <div ref={containerRef} className="min-h-[200px] bg-white flex items-center justify-center p-6">
        <div className="text-gray-500">Loading...</div>
      </div>
    )
  }

  if (!calendarConnected || !businessName) {
    return (
      <div ref={containerRef} className="bg-white p-6">
        <div className="max-w-md mx-auto text-center">
          <Calendar className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Booking Not Available</h2>
          <p className="text-gray-500 text-sm">
            {businessName
              ? `${businessName} doesn't have online booking enabled. Please call or text to schedule.`
              : 'Business not found.'}
          </p>
        </div>
      </div>
    )
  }

  if (confirmation) {
    const d = new Date(confirmation.scheduledAt)
    return (
      <div ref={containerRef} className="bg-white p-6">
        <div className="max-w-md mx-auto text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="h-10 w-10 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">You're All Set!</h2>
          <p className="text-gray-500 text-sm">
            Your {confirmation.serviceType} appointment with {businessName} is confirmed for{' '}
            {d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} at{' '}
            {d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}.
          </p>
          <p className="text-sm text-gray-500 mt-2">You'll receive a confirmation text shortly.</p>
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="bg-white p-4 sm:p-6 md:p-8">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-6">
          <h2 className="text-xl font-bold text-gray-900">Book with {businessName}</h2>
          <p className="text-gray-500 text-sm mt-1">Select a date and time that works for you</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
              <Calendar className="h-4 w-4" />
              Date
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              min={today}
              max={maxDate}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
            />
          </div>

          {selectedDate && (
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                <Clock className="h-4 w-4" />
                Available Times
              </label>
              {slotsLoading ? (
                <p className="text-gray-500 text-sm">Loading...</p>
              ) : slots.length === 0 ? (
                <p className="text-gray-500 text-sm">No availability on this date</p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {slots.map(slot => (
                    <button
                      key={slot.start}
                      type="button"
                      onClick={() => setSelectedSlot(slot)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                        selectedSlot?.start === slot.start
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {slot.display}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="border-t border-gray-100 pt-6 space-y-4">
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                <User className="h-4 w-4" />
                Your Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                placeholder="John Smith"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
              />
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                <Phone className="h-4 w-4" />
                Phone *
              </label>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                required
                placeholder="(555) 123-4567"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
              />
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                <Mail className="h-4 w-4" />
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="john@example.com"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
              />
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                <FileText className="h-4 w-4" />
                Service / Description *
              </label>
              <input
                type="text"
                value={service}
                onChange={e => setService(e.target.value)}
                required
                placeholder="e.g. Teeth cleaning, Haircut"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
              />
            </div>
          </div>

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!selectedSlot || !name.trim() || !phone.trim() || !service.trim() || submitting}
            className="w-full py-4 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {submitting ? 'Booking...' : 'Confirm Booking'}
          </button>
        </form>
      </div>
    </div>
  )
}
