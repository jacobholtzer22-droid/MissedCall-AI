// GET /api/appointments - Fetch appointments for the current user's business
// Syncs with Google Calendar: marks appointments as cancelled if the event was deleted externally

import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { getBusinessForDashboard } from '@/lib/get-business-for-dashboard'
import { calendarEventExists } from '@/lib/google-calendar'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({
    where: { clerkId: userId },
    include: { business: true },
  })

  const { business } = await getBusinessForDashboard(userId, user?.business ?? null)
  if (!business) return NextResponse.json({ error: 'No business found' }, { status: 404 })

  let appointments = await db.appointment.findMany({
    where: { businessId: business.id },
    orderBy: { scheduledAt: 'desc' },
    include: { conversation: true },
  })

  // Sync: if a confirmed appointment has a Google event that no longer exists, mark as cancelled
  const confirmedWithCalendar = appointments.filter(
    (a) => a.status === 'confirmed' && a.googleCalendarEventId
  )
  for (const apt of confirmedWithCalendar) {
    if (!apt.googleCalendarEventId) continue
    const exists = await calendarEventExists(business.id, apt.googleCalendarEventId)
    if (!exists) {
      await db.appointment.update({
        where: { id: apt.id },
        data: { status: 'cancelled' },
      })
    }
  }

  // Re-fetch after potential updates
  appointments = await db.appointment.findMany({
    where: { businessId: business.id },
    orderBy: { scheduledAt: 'desc' },
    include: { conversation: true },
  })

  return NextResponse.json({ appointments })
}
