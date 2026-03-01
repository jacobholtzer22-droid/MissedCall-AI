'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { Calendar, Clock, User, Phone, Mail, FileText, MapPin, CheckCircle } from 'lucide-react'
import { BookingPageHeader } from '@/app/components/BookingPageHeader'

const EMBED_MESSAGE_TYPE = 'booking-embed-height'

interface ServiceOption {
  value: string
  label: string
}

interface TimeSlot {
  start: string
  end: string
  display: string
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

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [service, setService] = useState('')
  const [notes, setNotes] = useState('')
  const [address, setAddress] = useState('')
  const [servicesOffered, setServicesOffered] = useState<ServiceOption[]>([])

  const [submitting, setSubmitting] = useState(false)
  const [confirmation, setConfirmation] = useState<{ scheduledAt: string; serviceType: string; timezone?: string } | null>(null)
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
        setServicesOffered(Array.isArray(data.servicesOffered) ? data.servicesOffered : [])
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
      return
    }
    setSlotsLoading(true)
    setSelectedSlot(null)
    fetch(`/api/bookings/available-slots?businessSlug=${slug}&start=${selectedDate}&end=${selectedDate}`)
      .then(res => res.json())
      .then(data => {
        setSlots(data.slots ?? [])
        setSlotsLoading(false)
      })
      .catch(() => {
        setSlots([])
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
    if (!selectedSlot || !name.trim() || !phone.trim() || !service.trim() || !notes.trim() || !address.trim()) return
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
        notes: notes.trim(),
        customerAddress: address.trim(),
      }),
    })
      .then(async res => {
        const data = await res.json()
        if (res.ok) {
          setConfirmation({
            scheduledAt: data.appointment.scheduledAt,
            serviceType: data.appointment.serviceType,
            timezone: data.appointment.timezone,
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
      <div ref={containerRef} className="min-h-[200px]" style={{ backgroundColor: '#ffffff' }}>
        <BookingPageHeader businessName={null} />
        <div className="flex items-center justify-center p-6">
          <div style={{ color: '#6b7280' }}>Loading...</div>
        </div>
      </div>
    )
  }

  if (!calendarConnected || !businessName) {
    return (
      <div ref={containerRef} style={{ backgroundColor: '#ffffff' }}>
        <BookingPageHeader businessName={businessName} />
        <div className="p-6">
        <div className="max-w-md mx-auto text-center">
          <Calendar className="h-12 w-12 mx-auto mb-4" style={{ color: '#d1d5db' }} />
          <h2 className="text-lg font-semibold mb-2" style={{ color: '#111827' }}>Quote Scheduling Not Available</h2>
          <p className="text-sm" style={{ color: '#6b7280' }}>
            {businessName
              ? `${businessName} doesn't have online booking enabled. Please call or text to schedule.`
              : 'Business not found.'}
          </p>
        </div>
        </div>
      </div>
    )
  }

  if (confirmation) {
    const d = new Date(confirmation.scheduledAt)
    const tzOpt = confirmation.timezone ? { timeZone: confirmation.timezone } : {}
    return (
      <div ref={containerRef} className="p-6" style={{ backgroundColor: '#ffffff' }}>
        <div className="max-w-md mx-auto text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="h-10 w-10" style={{ color: '#16a34a' }} />
          </div>
          <h2 className="text-xl font-bold mb-2" style={{ color: '#111827' }}>Your Quote Visit is Scheduled!</h2>
          <p className="text-sm" style={{ color: '#6b7280' }}>
            {businessName} will meet you on{' '}
            {d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', ...tzOpt })} at{' '}
            {d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, ...tzOpt })} to give you a quote for {confirmation.serviceType}.
          </p>
          <p className="text-sm mt-2" style={{ color: '#6b7280' }}>You'll receive a confirmation text shortly.</p>
        </div>
      </div>
    )
  }

  const inputStyle = { color: '#111827', backgroundColor: '#ffffff', border: '1px solid #d1d5db' } as const
  const labelStyle = { color: '#374151' } as const

  return (
    <div ref={containerRef} style={{ backgroundColor: '#ffffff' }}>
      <BookingPageHeader businessName={businessName} />
      <div className="p-4 sm:p-6 md:p-8">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold" style={{ color: '#111827' }}>Schedule a Free Quote</h2>
            <p className="text-sm mt-1" style={{ color: '#6b7280' }}>Select a date and time for your in-person quote visit</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2" style={labelStyle}>
                Select a date for your quote visit
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={selectedDate}
                  onChange={e => setSelectedDate(e.target.value)}
                  min={today}
                  max={maxDate}
                  className="flex-1 px-4 py-3 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  style={inputStyle}
                />
              </div>
              <p className="mt-2 text-xs" style={{ color: '#6b7280' }}>
                Click a highlighted date to see available times
              </p>
            </div>

            {selectedDate && (
            <div>
              <label className="flex items-center gap-2 text-sm font-medium mb-2" style={labelStyle}>
                <Clock className="h-4 w-4" />
                Available Times
              </label>
              {slotsLoading ? (
                <p className="text-sm" style={{ color: '#6b7280' }}>Loading...</p>
              ) : slots.length === 0 ? (
                <p className="text-sm" style={{ color: '#6b7280' }}>No availability on this date</p>
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
                          : 'hover:bg-gray-200'
                      }`}
                      style={selectedSlot?.start === slot.start ? undefined : { backgroundColor: '#f3f4f6', color: '#374151' }}
                    >
                      {slot.display}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="border-t pt-6 space-y-4" style={{ borderColor: '#e5e7eb' }}>
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
            {servicesOffered.length > 0 ? (
              <div>
                <label className="flex items-center gap-2 text-sm font-medium mb-2" style={labelStyle}>
                  <FileText className="h-4 w-4" />
                  What do you need a quote for? *
                </label>
                <select
                  value={service}
                  onChange={e => setService(e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  style={inputStyle}
                >
                  <option value="">Select a service</option>
                  {servicesOffered.map(opt => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="flex items-center gap-2 text-sm font-medium mb-2" style={labelStyle}>
                  <FileText className="h-4 w-4" />
                  What do you need a quote for? *
                </label>
                <input
                  type="text"
                  value={service}
                  onChange={e => setService(e.target.value)}
                  required
                  placeholder="e.g. Lawn mowing, Landscaping"
                  className="w-full px-4 py-3 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  style={inputStyle}
                />
              </div>
            )}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium mb-2" style={labelStyle}>
                <FileText className="h-4 w-4" />
                Tell us about the job so we can prepare *
              </label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                required
                rows={3}
                placeholder="Yard size, specific areas, access details, etc."
                className="w-full px-4 py-3 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                style={inputStyle}
              />
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm font-medium mb-2" style={labelStyle}>
                <MapPin className="h-4 w-4" />
                Address for the quote visit *
              </label>
              <input
                type="text"
                value={address}
                onChange={e => setAddress(e.target.value)}
                required
                placeholder="123 Main St, Grand Rapids, MI 49503"
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
            disabled={!selectedSlot || !name.trim() || !phone.trim() || !service.trim() || !notes.trim() || !address.trim() || submitting}
            className="w-full py-4 text-white font-semibold rounded-xl text-base shadow-lg hover:shadow-xl hover:brightness-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:brightness-100 transition"
            style={{ backgroundColor: '#2563eb' }}
          >
            {submitting ? 'Scheduling...' : 'Schedule My Quote'}
          </button>
        </form>
        </div>
      </div>
    </div>
  )
}
