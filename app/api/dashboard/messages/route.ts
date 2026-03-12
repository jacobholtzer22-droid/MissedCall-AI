// ===========================================
// CLIENT DASHBOARD: MESSAGES — list conversations
// ===========================================

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireDashboardBusiness } from '@/lib/dashboard-auth'

export async function GET() {
  const authResult = await requireDashboardBusiness()
  if (authResult instanceof NextResponse) return authResult
  const { business } = authResult

  const conversations = await db.conversation.findMany({
    where: { businessId: business.id },
    orderBy: { lastMessageAt: 'desc' },
    include: {
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  })

  const list = await Promise.all(
    conversations.map(async (c) => {
      const last = c.messages[0]

      // Find matching contact by phone number if it exists
      const contact = await db.contact.findFirst({
        where: { businessId: business.id, phoneNumber: c.callerPhone },
        select: { id: true, name: true, phoneNumber: true },
      })

      // Unread count placeholder (could be enhanced later with read receipts)
      const unreadCount = 0

      return {
        conversationId: c.id,
        contactId: contact?.id ?? null,
        contactName: contact?.name ?? c.callerName ?? null,
        contactPhone: contact?.phoneNumber ?? c.callerPhone,
        lastMessage: last?.content ?? null,
        lastMessageAt: c.lastMessageAt,
        unreadCount,
      }
    })
  )

  return NextResponse.json({ conversations: list })
}

