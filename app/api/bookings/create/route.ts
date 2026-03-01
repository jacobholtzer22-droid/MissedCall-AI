// ===========================================
// CREATE BOOKING
// ===========================================
// Creates a booking: Google Calendar event + DB + confirmation SMS
// Public API - used by booking page and SMS flow

import { NextRequest, NextResponse } from 'next/server'
import { TZDate } from '@date-fns/tz'
import { db } from '@/lib/db'
import { createBooking } from '@/lib/create-booking'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      businessId,
      businessSlug,
      customerName,
      customerPhone,
      customerEmail,
      slotStart,
      serviceType,
      notes,
      customerAddress,
      conversationId,
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
      return NextResponse.json(
        { error: 'Missing required fields: customerName, customerPhone, slotStart, serviceType' },
        { status: 400 }
      )
    }

    const isWebsite = !conversationId
    if (isWebsite && !notes?.trim()) {
      return NextResponse.json({ error: 'Missing required field: notes' }, { status: 400 })
    }

    const requiresAddress = business.bookingRequiresAddress ?? true
    if (isWebsite && requiresAddress && !customerAddress?.trim()) {
      return NextResponse.json({ error: 'Missing required field: customerAddress' }, { status: 400 })
    }

    const startDate = new Date(slotStart)
    if (isNaN(startDate.getTime())) {
      return NextResponse.json({ error: 'Invalid slotStart' }, { status: 400 })
    }

    const tz = business.timezone ?? 'America/New_York'
    const nowInTz = new TZDate(new Date(), tz)
    if (startDate.getTime() < nowInTz.getTime()) {
      return NextResponse.json(
        { error: 'This time slot is no longer available' },
        { status: 409 }
      )
    }

    const result = await createBooking({
      business,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      customerEmail: customerEmail?.trim() || null,
      slotStart,
      serviceType: serviceType.trim(),
      notes: notes?.trim() || null,
      customerAddress: customerAddress?.trim() || null,
      conversationId: conversationId || null,
      logPrefix: '[BOOKING CREATE]',
    })

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status ?? 500 }
      )
    }

    return NextResponse.json({
      appointment: {
        id: result.appointment.id,
        scheduledAt: result.appointment.scheduledAt,
        serviceType: result.appointment.serviceType,
        timezone: tz,
      },
    })
  } catch (error) {
    console.error('Create booking error:', error)
    return NextResponse.json({ error: 'Failed to create booking' }, { status: 500 })
  }
}
