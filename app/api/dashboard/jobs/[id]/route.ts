// ===========================================
// CLIENT DASHBOARD: JOB BY ID — update
// ===========================================

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireDashboardBusiness } from '@/lib/dashboard-auth'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireDashboardBusiness()
  if (authResult instanceof NextResponse) return authResult
  const { business } = authResult

  const { id } = await params
  const job = await db.job.findFirst({
    where: { id, businessId: business.id },
    include: { contact: true },
  })
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const allowed = [
    'serviceName', 'description', 'scheduledDate', 'completedDate', 'amount', 'status', 'notes',
  ] as const
  const data: Record<string, unknown> = {}
  for (const key of allowed) {
    if (body[key] !== undefined) {
      if (key === 'scheduledDate' || key === 'completedDate') {
        data[key] = body[key] ? new Date(body[key] as string) : null
      } else {
        data[key] = body[key]
      }
    }
  }

  const updated = await db.job.update({
    where: { id },
    data,
    include: { contact: true },
  })

  return NextResponse.json({
    job: {
      id: updated.id,
      contactId: updated.contactId,
      contactName: updated.contact.name ?? updated.contact.phoneNumber,
      serviceName: updated.serviceName,
      description: updated.description,
      scheduledDate: updated.scheduledDate,
      completedDate: updated.completedDate,
      amount: updated.amount,
      status: updated.status,
      notes: updated.notes,
      createdAt: updated.createdAt,
    },
  })
}
