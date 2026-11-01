// The real database and Google Calendar behind lib/show-rate-supersede.ts.
// Server only (lib/google-calendar is 'server-only'), so the tests import the
// pure module and never this one.

import { db } from '@/lib/db'
import { getCalendarClient } from '@/lib/google-calendar'
import { supersedeEarlierBookings, type SupersedeOutcome } from '@/lib/show-rate-supersede'

const SELECT = { id: true, notes: true, status: true, googleCalendarEventId: true } as const

export async function supersedeForNewBooking(
  businessId: string,
  appt: { id: string; customerPhone: string; createdAt: Date }
): Promise<SupersedeOutcome[]> {
  const now = new Date()
  return supersedeEarlierBookings(
    {
      findEarlierLive: () =>
        db.appointment.findMany({
          where: {
            businessId,
            id: { not: appt.id },
            customerPhone: appt.customerPhone,
            status: 'confirmed',
            scheduledAt: { gt: now },
            createdAt: { lt: appt.createdAt },
          },
          select: SELECT,
          take: 10,
        }),
      reread: (id) => db.appointment.findUnique({ where: { id }, select: SELECT }),
      cancel: async (id, expected, next) =>
        (
          await db.appointment.updateMany({
            where: { id, status: 'confirmed', notes: expected },
            data: { status: 'cancelled', notes: next },
          })
        ).count,
      deleteEvent: async (eventId) => {
        const calendar = await getCalendarClient(businessId)
        if (!calendar) throw new Error('no usable Google Calendar client')
        try {
          // 'all' so the prospect's copy of the old invite is withdrawn too.
          await calendar.events.delete({ calendarId: 'primary', eventId, sendUpdates: 'all' })
          return 'deleted'
        } catch (err) {
          const code = (err as { code?: number; status?: number })?.code ?? (err as { status?: number })?.status
          if (code === 404 || code === 410) return 'gone'
          throw err
        }
      },
    },
    appt.id,
    now
  )
}
