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
import { notifyOwnerOnBookingCancelled } from '@/lib/notify-owner'

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

    if (appointment.googleCalendarEventId) {
      await deleteCalendarEvent(appointment.businessId, appointment.googleCalendarEventId)
    }

    await db.appointment.update({
      where: { id: appointmentId },
      data: { status: 'cancelled' },
    })

    if (appointment.business.telnyxPhoneNumber) {
      const telnyx = new Telnyx({ apiKey: process.env.TELNYX_API_KEY! })
      const dateStr = new Date(appointment.scheduledAt).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })
      const timeStr = new Date(appointment.scheduledAt).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
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

    // Notify business owner (SMS + email)
    try {
      await notifyOwnerOnBookingCancelled(appointment.business, {
        id: appointment.id,
        customerName: appointment.customerName,
        customerPhone: appointment.customerPhone,
        customerEmail: appointment.customerEmail,
        serviceType: appointment.serviceType,
        scheduledAt: appointment.scheduledAt,
      })
    } catch (notifyErr) {
      console.error('Failed to notify owner of cancelled booking:', notifyErr)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Cancel booking error:', error)
    return NextResponse.json({ error: 'Failed to cancel booking' }, { status: 500 })
  }
}
