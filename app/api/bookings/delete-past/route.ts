// POST /api/bookings/delete-past - Delete all past/completed/cancelled appointments
// Clears old appointments from the dashboard

import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { getBusinessForDashboard } from '@/lib/get-business-for-dashboard'
import { deleteCalendarEvent } from '@/lib/google-calendar'

export async function POST() {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const user = await db.user.findUnique({
      where: { clerkId: userId },
      include: { business: true },
    })
    const { business } = await getBusinessForDashboard(userId, user?.business ?? null)

    if (!business) return NextResponse.json({ error: 'No business found' }, { status: 404 })

    const now = new Date()
    const pastAppointments = await db.appointment.findMany({
      where: {
        businessId: business.id,
        OR: [
          { scheduledAt: { lt: now } },
          { status: 'cancelled' },
          { status: 'completed' },
        ],
      },
    })

    for (const apt of pastAppointments) {
      if (apt.googleCalendarEventId && apt.status === 'confirmed') {
        try {
          await deleteCalendarEvent(apt.businessId, apt.googleCalendarEventId)
        } catch {
          // Event may already be gone
        }
      }
      await db.appointment.delete({ where: { id: apt.id } })
    }

    return NextResponse.json({ success: true, deleted: pastAppointments.length })
  } catch (error) {
    console.error('Delete past appointments error:', error)
    return NextResponse.json({ error: 'Failed to delete past appointments' }, { status: 500 })
  }
}
