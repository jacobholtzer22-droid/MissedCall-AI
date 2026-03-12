// ===========================================
// CLIENT DASHBOARD: MESSAGES — conversation detail
// ===========================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireDashboardBusiness } from '@/lib/dashboard-auth'

export async function GET(
  _req: NextRequest,
  { params }: { params: { conversationId: string } },
) {
  const authResult = await requireDashboardBusiness()
  if (authResult instanceof NextResponse) return authResult
  const { business } = authResult

  const { conversationId } = params

  const conversation = await db.conversation.findFirst({
    where: { id: conversationId, businessId: business.id },
    include: {
      messages: {
        orderBy: { createdAt: 'asc' },
      },
    },
  })

  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  }

  const messages = conversation.messages.map((m) => ({
    id: m.id,
    body: m.content,
    direction: m.direction as 'inbound' | 'outbound',
    createdAt: m.createdAt,
    status: m.telnyxStatus ?? null,
  }))

  return NextResponse.json({ messages })
}

