// ===========================================
// AVAILABLE BOOKING SLOTS
// ===========================================
// Returns available time slots for a business in a date range
// Public API - used by booking page and SMS flow

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAvailableSlots } from '@/lib/google-calendar'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const businessId = searchParams.get('businessId')
    const businessSlug = searchParams.get('businessSlug')
    const startStr = searchParams.get('start') // YYYY-MM-DD
    const endStr = searchParams.get('end') // YYYY-MM-DD

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
      return NextResponse.json({ error: 'Booking not available', businessName: business.name, calendarEnabled: false }, { status: 200 })
    }

    if (!business.googleCalendarConnected) {
      return NextResponse.json({ error: 'Google Calendar not connected', businessName: business.name, slots: [] }, { status: 200 })
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const defaultEnd = new Date(today)
    defaultEnd.setDate(defaultEnd.getDate() + 14)

    const startDate = startStr ? new Date(startStr + 'T00:00:00') : today
    const endDate = endStr ? new Date(endStr + 'T23:59:59') : defaultEnd

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return NextResponse.json({ error: 'Invalid date range' }, { status: 400 })
    }

    if (startDate > endDate) {
      return NextResponse.json({ error: 'Start date must be before end date' }, { status: 400 })
    }

    const slots = await getAvailableSlots(business.id, startDate, endDate)

    return NextResponse.json({
      slots,
      businessName: business.name,
      slotDurationMinutes: business.slotDurationMinutes ?? 30,
      calendarEnabled: true,
    })
  } catch (error) {
    console.error('Available slots error:', error)
    return NextResponse.json({ error: 'Failed to fetch slots' }, { status: 500 })
  }
}
