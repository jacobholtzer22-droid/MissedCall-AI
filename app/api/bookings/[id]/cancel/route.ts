// ===========================================
// CANCEL BOOKING
// ===========================================
// Cancels a booking: removes calendar event, updates DB, notifies customer via SMS
// Auth required - dashboard users and admin

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import Telnyx from 'telnyx'
import { deleteCalendarEvent } from '@/lib/google-calendar'
import { getBusinessForDashboard } from '@/lib/get-business-for-dashboard'

const ADMIN_USER_ID = process.env.ADMIN_USER_ID

export async function POST(
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

    if (appointment.status === 'cancelled') {
      return NextResponse.json({ error: 'Appointment already cancelled' }, { status: 400 })
    }

    // Try to delete from Google Calendar; if event was already deleted manually, still mark as cancelled
    if (appointment.googleCalendarEventId) {
      try {
        await deleteCalendarEvent(appointment.businessId, appointment.googleCalendarEventId)
      } catch {
        // Event may have been deleted from Google Calendar directly; continue to mark as cancelled
      }
    }

    await db.appointment.update({
      where: { id: appointmentId },
      data: { status: 'cancelled' },
    })

    if (appointment.business.telnyxPhoneNumber) {
      const telnyx = new Telnyx({ apiKey: process.env.TELNYX_API_KEY! })
      const tz = appointment.business.timezone ?? 'America/New_York'
      const dateStr = new Date(appointment.scheduledAt).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        timeZone: tz,
      })
      const timeStr = new Date(appointment.scheduledAt).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: tz,
      })
      const msg = `Your appointment with ${appointment.business.name} for ${dateStr} at ${timeStr} has been cancelled. Please contact us to reschedule.`

      try {
        await telnyx.messages.send({
          from: appointment.business.telnyxPhoneNumber,
          to: appointment.customerPhone,
          text: msg,
        })
      } catch (smsErr) {
        console.error('Failed to send cancellation SMS:', smsErr)
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Cancel booking error:', error)
    return NextResponse.json({ error: 'Failed to cancel booking' }, { status: 500 })
  }
}
