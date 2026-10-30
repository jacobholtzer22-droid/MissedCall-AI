import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireDashboardBusiness } from '@/lib/dashboard-auth'
import { isHiddenByDelete } from '../lead-delete'

export async function GET(request: Request) {
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

  // ?view=leads is the Leads page: it drops conversations deleted there
  // (DELETE /api/dashboard/conversations/[id]) unless the caller has texted in
  // since. Every other caller, the Conversations tab included, gets every
  // conversation as before. deletedAt is never part of the response.
  const leadsView = new URL(request.url).searchParams.get('view') === 'leads'
  const visible = conversations
    .filter((c) => !leadsView || !isHiddenByDelete(c))
    .map(({ deletedAt: _deletedAt, ...c }) => c)

  return NextResponse.json({ conversations: visible })
}
