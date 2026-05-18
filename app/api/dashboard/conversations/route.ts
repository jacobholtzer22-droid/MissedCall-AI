import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireDashboardBusiness } from '@/lib/dashboard-auth'

export async function GET() {
  const authResult = await requireDashboardBusiness()
  if (authResult instanceof NextResponse) return authResult
  const { business } = authResult

  if (!business.missedCallAiEnabled) {
    return NextResponse.json({ error: 'Feature not available' }, { status: 403 })
  }

  const conversations = await db.conversation.findMany({
    where: {
      businessId: business.id,
      messages: { some: {} },
      NOT: {
        status: { in: ['screening', 'screening_blocked', 'forwarding'] },
      },
    },
    orderBy: { lastMessageAt: 'desc' },
    select: {
      id: true,
      callerPhone: true,
      callerName: true,
      status: true,
      summary: true,
      intent: true,
      serviceRequested: true,
      createdAt: true,
      lastMessageAt: true,
      customerEmail: true,
      customerAddress: true,
      customerTimeframe: true,
      appointment: { select: { id: true } },
      messages: {
        select: { id: true, direction: true, content: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  })

  return NextResponse.json({ conversations })
}
