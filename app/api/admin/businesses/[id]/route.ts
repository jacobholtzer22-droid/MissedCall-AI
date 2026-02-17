import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

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
      'twilioPhoneNumber',
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
      'missedCallAiEnabled',
    ]

    const data: Record<string, unknown> = {}
    for (const field of allowedFields) {
      if (body[field] !== undefined) data[field] = body[field]
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