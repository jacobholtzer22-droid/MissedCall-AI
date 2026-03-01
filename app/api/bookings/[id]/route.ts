// DELETE /api/bookings/[id] - Permanently delete an appointment
// Used for past/cancelled/completed appointments to remove from dashboard

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { getBusinessForDashboard } from '@/lib/get-business-for-dashboard'
import { deleteCalendarEvent } from '@/lib/google-calendar'

const ADMIN_USER_ID = process.env.ADMIN_USER_ID

export async function DELETE(
  request: NextRequest,
  context: { params: { id: string } }
) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const appointmentId = context.params.id
    const appointment = await db.appointment.findUnique({
      where: { id: appointmentId },
      include: { business: true },
    })

    if (!appointment) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 })
    }

    const user = await db.user.findUnique({
      where: { clerkId: userId },
      include: { business: true },
    })
    const { business } = await getBusinessForDashboard(userId, user?.business ?? null)
    const isAdmin = userId === ADMIN_USER_ID

    if (!business || (business.id !== appointment.businessId && !isAdmin)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Try to remove from Google Calendar (ignore if already deleted)
    if (appointment.googleCalendarEventId && appointment.status === 'confirmed') {
      try {
        await deleteCalendarEvent(appointment.businessId, appointment.googleCalendarEventId)
      } catch {
        // Event may already be gone
      }
    }

    await db.appointment.delete({
      where: { id: appointmentId },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete appointment error:', error)
    return NextResponse.json({ error: 'Failed to delete appointment' }, { status: 500 })
  }
}
