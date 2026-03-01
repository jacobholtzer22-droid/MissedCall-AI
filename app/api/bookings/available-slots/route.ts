// ===========================================
// AVAILABLE BOOKING SLOTS
// ===========================================
// Returns available time slots for a business in a date range
// Public API - used by booking page and SMS flow

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAvailableSlotsWithDebug } from '@/lib/google-calendar'

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
      console.log('[available-slots] calendarEnabled=false', { businessId: business.id, slug: business.slug })
      return NextResponse.json({ error: 'Booking not available', businessName: business.name, calendarEnabled: false }, { status: 200 })
    }

    if (!business.googleCalendarConnected) {
      console.log('[available-slots] googleCalendarConnected=false', { businessId: business.id, slug: business.slug })
      return NextResponse.json({ error: 'Google Calendar not connected', businessName: business.name, slots: [] }, { status: 200 })
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const defaultEnd = new Date(today)
    defaultEnd.setDate(defaultEnd.getDate() + 14)

    const effectiveStart = startStr ?? today.toISOString().slice(0, 10)
    const effectiveEnd = endStr ?? defaultEnd.toISOString().slice(0, 10)

    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveStart) || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveEnd)) {
      return NextResponse.json({ error: 'Invalid date range' }, { status: 400 })
    }

    if (effectiveStart > effectiveEnd) {
      return NextResponse.json({ error: 'Start date must be before end date' }, { status: 400 })
    }

    const { slots, debug } = await getAvailableSlotsWithDebug(
      business.id,
      effectiveStart,
      effectiveEnd,
      business.slug
    )

    // Console logging for debugging
    console.log('[available-slots] businessId/slug:', { businessId: business.id, slug: business.slug })
    console.log('[available-slots] calendarEnabled:', debug.calendarEnabled)
    console.log('[available-slots] googleCalendarConnected:', debug.googleCalendarConnected)
    console.log('[available-slots] tokensExist:', debug.tokensExist)
    console.log('[available-slots] businessHours:', JSON.stringify(debug.businessHours))
    console.log('[available-slots] timezone:', debug.timezone)
    console.log('[available-slots] dateRangeQueried:', debug.dateRangeQueried)
    console.log('[available-slots] timeMin/timeMax:', { timeMin: debug.timeMin, timeMax: debug.timeMax })
    console.log('[available-slots] googleCalendarBusyTimes:', JSON.stringify(debug.googleCalendarBusyTimes))
    if (debug.googleCalendarError) {
      console.error('[available-slots] googleCalendarError:', debug.googleCalendarError)
    }
    console.log('[available-slots] slotsBeforeFiltering:', debug.slotsBeforeFiltering)
    console.log('[available-slots] slotsAfterPastFilter:', debug.slotsAfterPastFilter)
    console.log('[available-slots] finalSlotCount:', debug.finalSlotCount)

    // Parse services for booking dropdown: supports { name, price? } or plain strings (duration not shown to customers)
    const rawServices = business.servicesOffered
    let servicesOffered: { value: string; label: string }[] = []
    if (Array.isArray(rawServices) && rawServices.length > 0) {
      servicesOffered = rawServices.map((s: unknown) => {
        if (typeof s === 'object' && s !== null && 'name' in s && typeof (s as { name: string }).name === 'string') {
          const obj = s as { name: string; price?: number }
          const priceStr = typeof obj.price === 'number' ? ` - $${obj.price}` : ''
          return { value: obj.name, label: `${obj.name}${priceStr}` }
        }
        const name = typeof s === 'string' ? s : String(s)
        return { value: name, label: name }
      })
    }

    return NextResponse.json({
      slots,
      businessName: business.name,
      slotDurationMinutes: business.slotDurationMinutes ?? 30,
      calendarEnabled: true,
      servicesOffered,
      debug,
    })
  } catch (error) {
    console.error('Available slots error:', error)
    return NextResponse.json({ error: 'Failed to fetch slots' }, { status: 500 })
  }
}
