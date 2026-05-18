import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

const ADMIN_USER_ID = process.env.ADMIN_USER_ID

export async function GET(
  request: Request,
  context: { params: { id: string } }
) {
  const { id } = context.params
  const { userId } = await auth()

  if (!userId || userId !== ADMIN_USER_ID) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  try {
    const business = await db.business.findUnique({
      where: { id },
      select: { name: true, telnyxPhoneNumber: true },
    })

    const conversations = await db.conversation.findMany({
      where: {
        businessId: id,
        messages: { some: {} },
        ...(business?.telnyxPhoneNumber
          ? { callerPhone: { not: business.telnyxPhoneNumber } }
          : {}),
      },
      orderBy: { lastMessageAt: 'desc' },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          select: { id: true, direction: true, content: true, createdAt: true },
        },
        appointment: { select: { id: true } },
      },
      // Include bucket classification fields
    })

    // Select only the fields needed for bucket classification + UI
    const result = conversations.map(c => ({
      id: c.id,
      callerPhone: c.callerPhone,
      callerName: c.callerName,
      status: c.status,
      summary: c.summary,
      intent: c.intent,
      serviceRequested: c.serviceRequested,
      createdAt: c.createdAt,
      lastMessageAt: c.lastMessageAt,
      // Bucket classification fields
      customerEmail: c.customerEmail,
      customerAddress: c.customerAddress,
      customerTimeframe: c.customerTimeframe,
      appointment: c.appointment,
      messages: c.messages,
    }))

    return NextResponse.json({
      businessName: business?.name || 'Unknown',
      conversations: result,
    })
  } catch (error) {
    console.error('Admin: Failed to fetch conversations:', error)
    return NextResponse.json({ error: 'Failed to fetch conversations' }, { status: 500 })
  }
}
