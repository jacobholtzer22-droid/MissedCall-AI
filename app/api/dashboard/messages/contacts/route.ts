// ===========================================
// CLIENT DASHBOARD: MESSAGES — lightweight contacts list for new message flow
// ===========================================

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireDashboardBusiness } from '@/lib/dashboard-auth'

export async function GET() {
  const authResult = await requireDashboardBusiness()
  if (authResult instanceof NextResponse) return authResult
  const { business } = authResult

  const contacts = await db.contact.findMany({
    where: { businessId: business.id },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      name: true,
      phoneNumber: true,
      status: true,
      contactTags: {
        include: { tag: { select: { id: true, name: true } } },
      },
    },
    take: 200,
  })

  const list = contacts.map((c) => ({
    id: c.id,
    name: c.name,
    phoneNumber: c.phoneNumber,
    status: c.status,
    tags: c.contactTags.map((ct) => ({ id: ct.tag.id, name: ct.tag.name })),
  }))

  return NextResponse.json({ contacts: list })
}

