// ===========================================
// PATCH /api/admin/pipeline/booking/[id] — did this booking happen
// ===========================================
// Body: { showStatus: "pending" | "showed" | "no_show" | "cancelled" }
//
// Writes Appointment.showStatus and nothing else. Never `status`, `notes`, the
// reminder stamps or anything the booking path, the reminder cron or the
// calendar sync reads. Scoped to the marketing business. Returns the refreshed
// person the booking belongs to.

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getMarketingBusiness } from '@/lib/marketing-funnel'
import { loadPerson, requireAdmin } from '@/lib/pipeline-server'
import { SHOW_STATUSES } from '@/lib/pipeline'

export const dynamic = 'force-dynamic'

export async function PATCH(request: Request, context: { params: { id: string } }) {
  const denied = await requireAdmin()
  if (denied) return denied

  try {
    const body = (await request.json()) as { showStatus?: unknown }
    if (!SHOW_STATUSES.includes(body.showStatus as never)) {
      return NextResponse.json({ error: 'Invalid showStatus' }, { status: 400 })
    }

    const business = await getMarketingBusiness()
    if (!business) return NextResponse.json({ error: 'No marketing business' }, { status: 503 })

    const updated = await db.appointment.updateMany({
      where: { id: context.params.id, businessId: business.id },
      data: { showStatus: body.showStatus as string },
    })
    if (updated.count === 0) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    console.log(`[admin/pipeline] booking ${context.params.id} showStatus=${body.showStatus}`)

    const appt = await db.appointment.findUnique({ where: { id: context.params.id }, select: { customerPhone: true } })
    const refreshed = appt ? await loadPerson(appt.customerPhone) : null
    return NextResponse.json({ person: refreshed?.person ?? null })
  } catch (err) {
    console.error('[admin/pipeline] booking update failed:', err)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}
