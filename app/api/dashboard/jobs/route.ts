// ===========================================
// CLIENT DASHBOARD: JOBS — list & create
// ===========================================

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireDashboardBusiness } from '@/lib/dashboard-auth'

export async function GET(request: Request) {
  const authResult = await requireDashboardBusiness()
  if (authResult instanceof NextResponse) return authResult
  const { business } = authResult

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')?.trim() || ''

  const where: { businessId: string; status?: string } = {
    businessId: business.id,
  }
  if (status && status !== 'all') {
    where.status = status
  }

  const jobs = await db.job.findMany({
    where,
    orderBy: { scheduledDate: 'desc' },
    include: { contact: true },
  })

  const list = jobs.map((j) => ({
    id: j.id,
    contactId: j.contactId,
    contactName: j.contact.name ?? j.contact.phoneNumber,
    serviceName: j.serviceName,
    description: j.description,
    scheduledDate: j.scheduledDate,
    completedDate: j.completedDate,
    amount: j.amount,
    status: j.status,
    notes: j.notes,
    createdAt: j.createdAt,
  }))

  return NextResponse.json({ jobs: list })
}

export async function POST(request: Request) {
  const authResult = await requireDashboardBusiness()
  if (authResult instanceof NextResponse) return authResult
  const { business } = authResult

  let body: {
    contactId: string
    serviceName: string
    description?: string
    scheduledDate?: string
    amount?: number
    notes?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const contact = await db.contact.findFirst({
    where: { id: body.contactId, businessId: business.id },
  })
  if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 })

  const serviceName = body.serviceName?.trim()
  if (!serviceName) return NextResponse.json({ error: 'Service name is required' }, { status: 400 })

  const job = await db.job.create({
    data: {
      businessId: business.id,
      contactId: body.contactId,
      serviceName,
      description: body.description?.trim() || null,
      scheduledDate: body.scheduledDate ? new Date(body.scheduledDate) : null,
      amount: body.amount ?? null,
      notes: body.notes?.trim() || null,
      status: 'scheduled',
    },
    include: { contact: true },
  })

  await db.activity.create({
    data: {
      businessId: business.id,
      contactId: body.contactId,
      type: 'job_created',
      description: `Job created: ${job.serviceName}`,
      metadata: { jobId: job.id },
    },
  })

  return NextResponse.json({
    job: {
      id: job.id,
      contactId: job.contactId,
      contactName: job.contact.name ?? job.contact.phoneNumber,
      serviceName: job.serviceName,
      description: job.description,
      scheduledDate: job.scheduledDate,
      completedDate: job.completedDate,
      amount: job.amount,
      status: job.status,
      notes: job.notes,
      createdAt: job.createdAt,
    },
  })
}
