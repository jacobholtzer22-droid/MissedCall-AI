// ===========================================
// CREATE BOOKING
// ===========================================
// Creates a booking: Google Calendar event + DB + confirmation SMS
// Public API - used by booking page and SMS flow

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import Telnyx from 'telnyx'
import {
  createCalendarEvent,
  getAvailableSlots,
} from '@/lib/google-calendar'
import { notifyOwnerOnBookingCreated } from '@/lib/notify-owner'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      businessId,
      businessSlug,
      customerName,
      customerPhone,
      customerEmail,
      slotStart, // ISO datetime string
      serviceType,
      notes,
      conversationId, // Optional - for SMS bookings
    } = body

    let business
    if (businessId) {
      business = await db.business.findUnique({ where: { id: businessId } })
    } else if (businessSlug) {
      business = await db.business.findUnique({ where: { slug: businessSlug } })
    }

    if (!business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    if (!business.calendarEnabled) {
      return NextResponse.json({ error: 'Booking not available' }, { status: 400 })
    }

    if (!business.googleCalendarConnected) {
      return NextResponse.json({ error: 'Google Calendar not connected' }, { status: 400 })
    }

    if (!customerName?.trim() || !customerPhone?.trim() || !slotStart || !serviceType?.trim()) {
      return NextResponse.json({
        error: 'Missing required fields: customerName, customerPhone, slotStart, serviceType',
      }, { status: 400 })
    }

    const startDate = new Date(slotStart)
    if (isNaN(startDate.getTime())) {
      return NextResponse.json({ error: 'Invalid slotStart' }, { status: 400 })
    }

    const slotDuration = business.slotDurationMinutes ?? 60
    const endDate = new Date(startDate.getTime() + slotDuration * 60 * 1000)

    // Verify slot is still available (use business TZ for date to avoid timezone mismatch)
    const tz = business.timezone ?? 'America/New_York'
    const dateStr = startDate.toLocaleDateString('en-CA', { timeZone: tz }) // YYYY-MM-DD
    const availableSlots = await getAvailableSlots(business.id, dateStr, dateStr)
    const isAvailable = availableSlots.some(
      s => new Date(s.start).getTime() === startDate.getTime()
    )
    if (!isAvailable) {
      return NextResponse.json({ error: 'This time slot is no longer available' }, { status: 409 })
    }

    const summary = `${serviceType} - ${customerName}`
    const description = [
      `Customer: ${customerName}`,
      `Phone: ${customerPhone}`,
      customerEmail ? `Email: ${customerEmail}` : null,
      notes ? `Notes: ${notes}` : null,
    ]
      .filter(Boolean)
      .join('\n')

    const googleEventId = await createCalendarEvent(
      business.id,
      startDate,
      endDate,
      summary,
      description
    )

    const appointment = await db.appointment.create({
      data: {
        businessId: business.id,
        conversationId: conversationId || null,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerEmail: customerEmail?.trim() || null,
        serviceType: serviceType.trim(),
        scheduledAt: startDate,
        duration: slotDuration,
        notes: notes?.trim() || null,
        googleCalendarEventId: googleEventId,
        status: 'confirmed',
      },
    })

    // Send confirmation SMS via Telnyx
    if (business.telnyxPhoneNumber) {
      const telnyx = new Telnyx({ apiKey: process.env.TELNYX_API_KEY! })
      const dateStr = startDate.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })
      const timeStr = startDate.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })
      const msg = `Confirmed! Your appointment with ${business.name} is scheduled for ${dateStr} at ${timeStr}. Reply to this number if you need to reschedule.`

      try {
        await telnyx.messages.send({
          from: business.telnyxPhoneNumber,
          to: customerPhone.trim(),
          text: msg,
        })
      } catch (smsErr) {
        console.error('Failed to send confirmation SMS:', smsErr)
      }
    }

    // Notify business owner (SMS + email)
    try {
      await notifyOwnerOnBookingCreated(business, {
        id: appointment.id,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerEmail: customerEmail?.trim() || null,
        serviceType: serviceType.trim(),
        scheduledAt: startDate,
      })
    } catch (notifyErr) {
      console.error('Failed to notify owner of new booking:', notifyErr)
    }

    return NextResponse.json({
      appointment: {
        id: appointment.id,
        scheduledAt: appointment.scheduledAt,
        serviceType: appointment.serviceType,
      },
    })
  } catch (error) {
    console.error('Create booking error:', error)
    return NextResponse.json({ error: 'Failed to create booking' }, { status: 500 })
  }
}
