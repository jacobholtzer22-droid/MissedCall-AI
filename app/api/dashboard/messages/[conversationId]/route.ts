// ===========================================
// CLIENT DASHBOARD: MESSAGES — conversation detail
// ===========================================

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireDashboardBusiness } from '@/lib/dashboard-auth'

type RouteParams = {
  params: Promise<{ conversationId: string }>
}

export async function GET({ params }: RouteParams) {
  const authResult = await requireDashboardBusiness()
  if (authResult instanceof NextResponse) return authResult
  const { business } = authResult

  const { conversationId } = await params

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

