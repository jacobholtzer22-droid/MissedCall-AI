// ===========================================
// CLIENT DASHBOARD: WEBSITE LEADS — list & update lead status
// ===========================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireDashboardBusiness } from '@/lib/dashboard-auth'

export async function GET() {
  const authResult = await requireDashboardBusiness()
  if (authResult instanceof NextResponse) return authResult
  const { business } = authResult

  const leads = await db.websiteLead.findMany({
    where: { businessId: business.id },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ leads })
}

const VALID_STATUSES = ['new', 'contacted', 'converted', 'closed'] as const

export async function PATCH(req: NextRequest) {
  const authResult = await requireDashboardBusiness()
  if (authResult instanceof NextResponse) return authResult
  const { business } = authResult

  const { leadId, status } = await req.json()

  if (!leadId || !status) {
    return NextResponse.json({ error: 'leadId and status are required' }, { status: 400 })
  }

  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
      { status: 400 }
    )
  }

  const lead = await db.websiteLead.findFirst({
    where: { id: leadId, businessId: business.id },
  })

  if (!lead) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  }

  const updated = await db.websiteLead.update({
    where: { id: leadId },
    data: { status },
  })

  return NextResponse.json({ lead: updated })
}
