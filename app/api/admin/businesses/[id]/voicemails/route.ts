// ===========================================
// ADMIN VOICEMAILS - Conversations with recordings (missedCallAiEnabled = false)
// ===========================================

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

const ADMIN_USER_ID = process.env.ADMIN_USER_ID

export async function GET(
  _request: Request,
  context: { params: { id: string } }
) {
  const { id: businessId } = context.params
  const { userId } = await auth()

  if (!userId || userId !== ADMIN_USER_ID) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  try {
    const business = await db.business.findUnique({
      where: { id: businessId },
      select: { id: true, missedCallAiEnabled: true },
    })

    if (!business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    const conversations = await db.conversation.findMany({
      where: {
        businessId,
        recordingUrl: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        callerPhone: true,
        recordingUrl: true,
        voicemailTranscription: true,
        createdAt: true,
      },
    })

    const voicemails = conversations.map((c) => ({
      conversationId: c.id,
      callerPhone: c.callerPhone,
      recordingUrl: c.recordingUrl,
      voicemailTranscription: c.voicemailTranscription ?? null,
      createdAt: c.createdAt,
    }))

    return NextResponse.json({ voicemails })
  } catch (error) {
    console.error('Admin: Failed to fetch voicemails:', error)
    return NextResponse.json({ error: 'Failed to fetch voicemails' }, { status: 500 })
  }
}
