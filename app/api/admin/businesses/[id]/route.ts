import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { normalizeToE164 } from '@/lib/phone-utils'

const ADMIN_USER_ID = process.env.ADMIN_USER_ID

export async function PATCH(
  request: Request,
  context: { params: { id: string } }
) {
  const { id } = context.params
  const { userId } = await auth()

  if (!userId || userId !== ADMIN_USER_ID) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  try {
    const body = await request.json()

    const allowedFields = [
      'name',
      'calendarEnabled',
      'telnyxPhoneNumber',
      'forwardingNumber',
      'timezone',
      'businessHours',
      'servicesOffered',
      'aiGreeting',
      'aiInstructions',
      'aiContext',
      'subscriptionStatus',
      'spamFilterEnabled',
      'adminNotes',
      'setupFee',
      'monthlyFee',
      'callScreenerEnabled',
      'callScreenerMessage',
      'missedCallVoiceMessage',
      'missedCallAiEnabled',
      'slotDurationMinutes',
      'bufferMinutes',
    ]

    const data: Record<string, unknown> = {}
    for (const field of allowedFields) {
      if (body[field] !== undefined) data[field] = body[field]
    }

    // Normalize telnyxPhoneNumber to E.164 (+1XXXXXXXXXX) for Telnyx API matching
    if (data.telnyxPhoneNumber !== undefined) {
      const raw = data.telnyxPhoneNumber
      data.telnyxPhoneNumber = raw && typeof raw === 'string' && raw.trim()
        ? normalizeToE164(raw.trim()) || null
        : null
    }

    const business = await db.business.update({
      where: { id },
      data,
    })

    return NextResponse.json({ business })
  } catch (error) {
    console.error('Admin: Failed to update business:', error)
    return NextResponse.json({ error: 'Failed to update business' }, { status: 500 })
  }
}