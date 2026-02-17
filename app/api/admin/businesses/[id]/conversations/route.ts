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
      select: { name: true },
    })

    const conversations = await db.conversation.findMany({
      where: {
        businessId: id,
        status: { in: ['active', 'no_response', 'completed'] },
        messages: { some: {} },
      },
      orderBy: { lastMessageAt: 'desc' },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            direction: true,
            content: true,
            createdAt: true,
          },
        },
      },
    })

    return NextResponse.json({
      businessName: business?.name || 'Unknown',
      conversations,
    })
  } catch (error) {
    console.error('Admin: Failed to fetch conversations:', error)
    return NextResponse.json({ error: 'Failed to fetch conversations' }, { status: 500 })
  }
}