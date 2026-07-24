// ===========================================
// CLIENT DASHBOARD: WEBSITE LEADS — list & update lead status
// ===========================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireDashboardBusiness } from '@/lib/dashboard-auth'
import { getOwnerGroupBusinesses } from '@/lib/owner-group'

export async function GET() {
  const authResult = await requireDashboardBusiness()
  if (authResult instanceof NextResponse) return authResult
  const { business } = authResult

  if (!business.missedCallAiEnabled) {
    return NextResponse.json({ error: 'Feature not available' }, { status: 403 })
  }

  const group = await getOwnerGroupBusinesses(business)

  const leads = await db.websiteLead.findMany({
    where: { businessId: { in: group.map((b) => b.id) }, status: { not: 'spam' } },
    orderBy: { createdAt: 'desc' },
  })

  // Ungrouped businesses get today's exact response shape — no new fields
  if (group.length === 1) {
    return NextResponse.json({ leads })
  }

  const nameById = new Map(group.map((b) => [b.id, b.name]))
  return NextResponse.json({
    leads: leads.map((lead) => ({
      ...lead,
      businessName: nameById.get(lead.businessId) ?? '',
    })),
    isGroup: true,
  })
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

  // Scope to the owner group so grouped dashboards can update sibling-business
  // leads shown by GET. Ungrouped: group = [business], identical to before.
  const group = await getOwnerGroupBusinesses(business)
  const lead = await db.websiteLead.findFirst({
    where: { id: leadId, businessId: { in: group.map((b) => b.id) } },
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
