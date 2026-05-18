// ===========================================
// CLIENT DASHBOARD: EMAIL CAMPAIGNS — fetch single campaign
// Used by the compose page's "Reuse as Template" flow.
// ===========================================

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireDashboardBusiness } from '@/lib/dashboard-auth'

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const authResult = await requireDashboardBusiness()
  if (authResult instanceof NextResponse) return authResult
  const { business } = authResult

  if (!business.massMessagingEnabled) {
    return NextResponse.json({ error: 'Feature not available' }, { status: 403 })
  }

  const campaign = await db.emailCampaign.findFirst({
    where: { id: params.id, businessId: business.id },
    select: {
      id: true,
      senderName: true,
      subject: true,
      body: true,
      status: true,
      recipientCount: true,
      sentAt: true,
      createdAt: true,
    },
  })

  if (!campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  return NextResponse.json({ campaign })
}
