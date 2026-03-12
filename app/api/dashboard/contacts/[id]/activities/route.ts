// ===========================================
// CLIENT DASHBOARD: CONTACT ACTIVITIES — timeline & add note
// ===========================================

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireDashboardBusiness } from '@/lib/dashboard-auth'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireDashboardBusiness()
  if (authResult instanceof NextResponse) return authResult
  const { business } = authResult

  const { id } = await params
  const contact = await db.contact.findFirst({
    where: { id, businessId: business.id },
    select: { id: true },
  })
  if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 })

  const activities = await db.activity.findMany({
    where: { contactId: id, businessId: business.id },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ activities })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireDashboardBusiness()
  if (authResult instanceof NextResponse) return authResult
  const { business } = authResult

  const { id } = await params
  const contact = await db.contact.findFirst({
    where: { id, businessId: business.id },
    select: { id: true },
  })
  if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 })

  let body: { content?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const description = typeof body.content === 'string' && body.content.trim()
    ? body.content.trim()
    : 'Note added'

  const activity = await db.activity.create({
    data: {
      businessId: business.id,
      contactId: id,
      type: 'note_added',
      description,
    },
  })

  return NextResponse.json({ activity })
}
