// ===========================================
// CLIENT DASHBOARD: VOICEMAILS
// ===========================================
// Returns conversations with recordings (recordingUrl not null) for the
// authenticated client's business. Used when missedCallAiEnabled is false.

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getBusinessForDashboard } from '@/lib/get-business-for-dashboard'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({
    where: { clerkId: userId },
    include: { business: true },
  })

  const { business } = await getBusinessForDashboard(userId, user?.business ?? null)
  if (!business) return NextResponse.json({ error: 'No business found' }, { status: 404 })

  try {
    const conversations = await db.conversation.findMany({
      where: {
        businessId: business.id,
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
    console.error('Dashboard voicemails:', error)
    return NextResponse.json({ error: 'Failed to fetch voicemails' }, { status: 500 })
  }
}
