'use client'

import { useEffect, useState } from 'react'
import { Calendar, Phone, Globe, MessageCircle, Trash2, MapPin } from 'lucide-react'
import { formatPhoneNumber } from '@/lib/utils'
import { CancelBookingButton } from './CancelBookingButton'

type Appointment = {
  id: string
  customerName: string
  customerPhone: string
  customerEmail: string | null
  serviceType: string
  scheduledAt: string
  status: string
  source: string | null
  notes: string | null
  customerAddress?: string | null
  conversation?: { id: string } | null
}

function MiniStat({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`rounded-lg p-4 ${highlight ? 'bg-blue-50 border border-blue-100' : 'bg-gray-50'}`}>
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`text-2xl font-bold ${highlight ? 'text-blue-600' : 'text-gray-900'}`}>{value}</p>
    </div>
  )
}

function AppointmentCard({
  appointment,
  showCancel,
  showDelete,
  onCancelled,
  onDeleted,
}: {
  appointment: Appointment
  showCancel?: boolean
  showDelete?: boolean
  onCancelled?: () => void
  onDeleted?: () => void
}) {
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const date = new Date(appointment.scheduledAt)
  const isUpcoming = new Date(appointment.scheduledAt) >= new Date() && appointment.status === 'confirmed'

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setDeleting(true)
    try {
      const res = await fetch(`/api/bookings/${appointment.id}`, { method: 'DELETE' })
      if (res.ok) {
        onDeleted?.()
      }
    } finally {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  return (
    <div className="px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="bg-blue-50 p-3 rounded-lg">
            <Calendar className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-medium text-gray-900">{appointment.customerName}</p>
              <span
                className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
                  (appointment.source ?? 'website') === 'sms'
                    ? 'bg-purple-100 text-purple-700'
                    : 'bg-slate-100 text-slate-600'
                }`}
                title={(appointment.source ?? 'website') === 'sms' ? 'Quote scheduled via missed call SMS' : 'Quote scheduled via website'}
              >
                {(appointment.source ?? 'website') === 'sms' ? (
                  <>
                    <MessageCircle className="h-3 w-3" />
                    SMS
                  </>
                ) : (
                  <>
                    <Globe className="h-3 w-3" />
                    Website
                  </>
                )}
              </span>
            </div>
            <p className="text-sm text-gray-500">{appointment.serviceType}</p>
            <div className="flex items-center space-x-4 mt-1 text-sm text-gray-500 flex-wrap gap-x-4 gap-y-1">
              <span className="flex items-center">
                <Phone className="h-3 w-3 mr-1" />
                {formatPhoneNumber(appointment.customerPhone)}
              </span>
              {appointment.customerAddress && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(appointment.customerAddress)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center text-blue-600 hover:text-blue-800 hover:underline"
                >
                  <MapPin className="h-3 w-3 mr-1 flex-shrink-0" />
                  <span className="truncate max-w-[200px]">{appointment.customerAddress}</span>
                </a>
              )}
            </div>
          </div>
        </div>
        <div className="text-right flex items-center gap-3">
          <div>
            <p className="font-medium text-gray-900">
              {date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </p>
            <p className="text-sm text-gray-500">
              {date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </p>
            <span className={`text-xs px-2 py-1 rounded-full mt-1 inline-block ${
              appointment.status === 'confirmed' ? 'bg-green-100 text-green-700' :
              appointment.status === 'completed' ? 'bg-blue-100 text-blue-700' :
              appointment.status === 'cancelled' ? 'bg-red-100 text-red-700' :
              'bg-gray-100 text-gray-600'
            }`}>
              {appointment.status === 'confirmed' ? 'Quote Scheduled' :
               appointment.status === 'completed' ? 'Quote Completed' :
               appointment.status === 'cancelled' ? 'Cancelled' :
               appointment.status.charAt(0).toUpperCase() + appointment.status.slice(1)}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            {showCancel && isUpcoming && (
              <CancelBookingButton appointmentId={appointment.id} onCancelled={onCancelled} />
            )}
            {showDelete && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className={`text-sm font-medium transition flex items-center gap-1 ${
                  confirmDelete
                    ? 'text-red-600 hover:text-red-700'
                    : 'text-gray-500 hover:text-red-600'
                } disabled:opacity-50`}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {deleting ? 'Deleting...' : confirmDelete ? 'Click again to confirm' : 'Delete'}
              </button>
            )}
          </div>
        </div>
      </div>
      {appointment.notes && (
        <p className="mt-2 text-sm text-gray-500 ml-16">Notes: {appointment.notes}</p>
      )}
    </div>
  )
}

export function AppointmentsClient() {
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteAllLoading, setDeleteAllLoading] = useState(false)
  const [deleteAllConfirm, setDeleteAllConfirm] = useState(false)

  async function fetchAppointments() {
    const res = await fetch('/api/appointments')
    if (res.ok) {
      const data = await res.json()
      setAppointments(data.appointments ?? [])
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchAppointments()
  }, [])

  const upcoming = appointments.filter(a => new Date(a.scheduledAt) >= new Date() && a.status === 'confirmed')
  const past = appointments.filter(a => new Date(a.scheduledAt) < new Date() || a.status !== 'confirmed')

  function handleCancelled(appointmentId: string) {
    setAppointments(prev =>
      prev.map(a =>
        a.id === appointmentId ? { ...a, status: 'cancelled' as const } : a
      )
    )
  }

  function handleDeleted(appointmentId: string) {
    setAppointments(prev => prev.filter(a => a.id !== appointmentId))
  }

  async function handleDeleteAllPast() {
    if (!deleteAllConfirm) {
      setDeleteAllConfirm(true)
      return
    }
    setDeleteAllLoading(true)
    try {
      const res = await fetch('/api/bookings/delete-past', { method: 'POST' })
      if (res.ok) {
        setAppointments(prev =>
          prev.filter(a => new Date(a.scheduledAt) >= new Date() && a.status === 'confirmed')
        )
        setDeleteAllConfirm(false)
      }
    } finally {
      setDeleteAllLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Scheduled Quotes</h1>
          <p className="text-gray-500 mt-1">View and manage all quote visits</p>
        </div>
        <div className="flex items-center justify-center py-12">
          <p className="text-gray-500">Loading quote visits...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Appointments</h1>
        <p className="text-gray-500 mt-1">View and manage all booked appointments</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MiniStat label="Total" value={appointments.length} />
        <MiniStat label="Upcoming" value={upcoming.length} highlight />
        <MiniStat label="Completed" value={appointments.filter(a => a.status === 'completed').length} />
        <MiniStat label="Cancelled" value={appointments.filter(a => a.status === 'cancelled').length} />
      </div>

      {appointments.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Calendar className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No quote visits yet</h3>
          <p className="text-gray-500 max-w-md mx-auto">
            When customers schedule quote visits, they&apos;ll appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {upcoming.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Upcoming</h2>
              <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
                {upcoming.map((appointment) => (
                  <AppointmentCard
                    key={appointment.id}
                    appointment={appointment}
                    showCancel
                    onCancelled={() => handleCancelled(appointment.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {past.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Past & Other</h2>
                <button
                  onClick={handleDeleteAllPast}
                  disabled={deleteAllLoading}
                  className={`text-sm font-medium px-3 py-1.5 rounded-lg transition ${
                    deleteAllConfirm
                      ? 'bg-red-100 text-red-700 hover:bg-red-200'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-800'
                  } disabled:opacity-50`}
                >
                  {deleteAllLoading ? 'Deleting...' : deleteAllConfirm ? 'Click again to confirm' : 'Delete All Past Quote Visits'}
                </button>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
                {past.map((appointment) => (
                  <AppointmentCard
                    key={appointment.id}
                    appointment={appointment}
                    showDelete
                    onDeleted={() => handleDeleted(appointment.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
