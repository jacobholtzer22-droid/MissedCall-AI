import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { createCalendarEvent } from '@/lib/google-calendar'
import type { CalendarEventSource } from '@/lib/google-calendar'

const ADMIN_USER_ID = process.env.ADMIN_USER_ID

export async function POST(request: NextRequest) {
  const { userId } = await auth()
  if (!userId || userId !== ADMIN_USER_ID) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  let businessId: string
  try {
    const body = await request.json()
    businessId = body.businessId
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!businessId) {
    return NextResponse.json({ error: 'businessId is required' }, { status: 400 })
  }

  const business = await db.business.findUnique({ where: { id: businessId } })
  if (!business) {
    return NextResponse.json({ error: 'Business not found' }, { status: 404 })
  }
  if (!business.googleCalendarConnected) {
    return NextResponse.json({ ok: false, error: 'Calendar not connected' }, { status: 400 })
  }

  const appointments = await db.appointment.findMany({
    where: {
      businessId,
      status: { not: 'cancelled' },
      scheduledAt: { gt: new Date() },
      OR: [
        { googleCalendarEventId: null },
        { calendarSyncFailed: true },
      ],
    },
  })

  let processed = 0
  let succeeded = 0
  let failed = 0
  const errors: { appointmentId: string; error: string }[] = []

  for (const appt of appointments) {
    processed++
    const startDate = appt.scheduledAt
    const endDate = new Date(startDate.getTime() + appt.duration * 60 * 1000)
    const source = (appt.source === 'sms' ? 'sms' : 'website') as CalendarEventSource

    try {
      const eventId = await createCalendarEvent(
        businessId,
        startDate,
        endDate,
        appt.customerName,
        appt.serviceType,
        appt.customerPhone,
        {
          customerEmail: appt.customerEmail,
          notes: appt.notes,
          customerAddress: appt.customerAddress,
          source,
        }
      )

      await db.appointment.update({
        where: { id: appt.id },
        data: {
          googleCalendarEventId: eventId,
          calendarSyncFailed: false,
        },
      })
      succeeded++
    } catch (err) {
      failed++
      const msg = err instanceof Error ? err.message : String(err)
      errors.push({ appointmentId: appt.id, error: msg })
      console.error('[BACKFILL] Failed to create calendar event for appointment', appt.id, err)
    }

    // Small delay to avoid Google API rate limits
    if (processed < appointments.length) {
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
  }

  return NextResponse.json({ processed, succeeded, failed, errors })
}
