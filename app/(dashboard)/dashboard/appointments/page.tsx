import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { getBusinessForDashboard } from '@/lib/get-business-for-dashboard'
import { Calendar, Clock, User, Phone } from 'lucide-react'
import { formatPhoneNumber } from '@/lib/utils'
import { CancelBookingButton } from './CancelBookingButton'

export default async function AppointmentsPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const user = await db.user.findUnique({
    where: { clerkId: userId },
    include: { business: true }
  })

  const { business } = await getBusinessForDashboard(userId, user?.business ?? null)
  if (!business) redirect('/onboarding')

  const appointments = await db.appointment.findMany({
    where: { businessId: business.id },
    orderBy: { scheduledAt: 'desc' },
    include: { conversation: true },
  })

  const upcoming = appointments.filter(a => new Date(a.scheduledAt) >= new Date() && a.status === 'confirmed')
  const past = appointments.filter(a => new Date(a.scheduledAt) < new Date() || a.status !== 'confirmed')

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
          <h3 className="text-lg font-medium text-gray-900 mb-2">No appointments yet</h3>
          <p className="text-gray-500 max-w-md mx-auto">
            When your AI assistant books appointments, they'll appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {upcoming.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Upcoming</h2>
              <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
                {upcoming.map((appointment) => (
                  <AppointmentCard key={appointment.id} appointment={appointment} showCancel />
                ))}
              </div>
            </div>
          )}

          {past.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Past & Other</h2>
              <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
                {past.map((appointment) => (
                  <AppointmentCard key={appointment.id} appointment={appointment} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function AppointmentCard({
  appointment,
  showCancel,
}: {
  appointment: any
  showCancel?: boolean
}) {
  const date = new Date(appointment.scheduledAt)
  const isUpcoming = new Date(appointment.scheduledAt) >= new Date() && appointment.status === 'confirmed'

  return (
    <div className="px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="bg-blue-50 p-3 rounded-lg">
            <Calendar className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <p className="font-medium text-gray-900">{appointment.customerName}</p>
            <p className="text-sm text-gray-500">{appointment.serviceType}</p>
            <div className="flex items-center space-x-4 mt-1 text-sm text-gray-500">
              <span className="flex items-center">
                <Phone className="h-3 w-3 mr-1" />
                {formatPhoneNumber(appointment.customerPhone)}
              </span>
            </div>
          </div>
        </div>
        <div className="text-right">
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
            {appointment.status.charAt(0).toUpperCase() + appointment.status.slice(1)}
          </span>
          {showCancel && isUpcoming && (
            <div className="mt-2">
              <CancelBookingButton appointmentId={appointment.id} />
            </div>
          )}
        </div>
      </div>
      {appointment.notes && (
        <p className="mt-2 text-sm text-gray-500 ml-16">Notes: {appointment.notes}</p>
      )}
    </div>
  )
}

function MiniStat({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`rounded-lg p-4 ${highlight ? 'bg-blue-50 border border-blue-100' : 'bg-gray-50'}`}>
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`text-2xl font-bold ${highlight ? 'text-blue-600' : 'text-gray-900'}`}>{value}</p>
    </div>
  )
}