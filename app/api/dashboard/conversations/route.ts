import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireDashboardBusiness } from '@/lib/dashboard-auth'
import { isHiddenByDelete } from '../lead-delete'

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
      deletedAt: true,
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

  // Deleted from the Leads page (DELETE /api/dashboard/conversations/[id]),
  // unless the thread has moved since. deletedAt is not part of the response.
  const visible = conversations.filter((c) => !isHiddenByDelete(c)).map(({ deletedAt: _deletedAt, ...c }) => c)

  return NextResponse.json({ conversations: visible })
}
