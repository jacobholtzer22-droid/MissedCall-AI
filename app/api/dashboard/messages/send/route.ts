// ===========================================
// CLIENT DASHBOARD: MESSAGES — send single SMS
// ===========================================

import { NextResponse } from 'next/server'
import Telnyx from 'telnyx'
import { db } from '@/lib/db'
import { requireDashboardBusiness } from '@/lib/dashboard-auth'
import { normalizeToE164 } from '@/lib/phone-utils'
import { findOrCreateContact } from '@/lib/crm-utils'

type SendBody = {
  to: string
  body: string
  conversationId?: string
}

export async function POST(request: Request) {
  const authResult = await requireDashboardBusiness()
  if (authResult instanceof NextResponse) return authResult
  const { business } = authResult

  let body: SendBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const toRaw = body.to?.trim()
  const text = body.body?.trim()
  if (!toRaw || !text) {
    return NextResponse.json({ error: 'to and body are required' }, { status: 400 })
  }

  if (!business.telnyxPhoneNumber) {
    return NextResponse.json({ error: 'Business is not configured with a Telnyx phone number' }, { status: 400 })
  }

  const to = normalizeToE164(toRaw) || toRaw

  // Find or create conversation for this contact/number
  let conversationId = body.conversationId ?? null
  if (!conversationId) {
    const existing = await db.conversation.findFirst({
      where: { businessId: business.id, callerPhone: to },
      orderBy: { lastMessageAt: 'desc' },
      select: { id: true },
    })
    if (existing) {
      conversationId = existing.id
    } else {
      const created = await db.conversation.create({
        data: {
          businessId: business.id,
          callerPhone: to,
          status: 'active',
          lastMessageAt: new Date(),
          manualMode: true,
        },
        select: { id: true },
      })
      conversationId = created.id
    }
  }

  const conversation = await db.conversation.findFirst({
    where: { id: conversationId, businessId: business.id },
    select: { id: true, callerPhone: true },
  })
  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  }

  const telnyxClient = new Telnyx({ apiKey: process.env.TELNYX_API_KEY! })

  try {
    const sent = await telnyxClient.messages.send({
      from: business.telnyxPhoneNumber,
      to,
      text,
    })
    const data = (sent as any)?.data
    const messageId = data?.id as string | undefined
    const status = (data?.to?.[0]?.status as string | undefined) ?? 'sent'

    const message = await db.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'outbound',
        content: text,
        telnyxSid: messageId ?? null,
        telnyxStatus: status,
      },
    })

    await db.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: new Date(),
        manualMode: true,
      },
    })

    // Ensure contact exists in CRM
    await findOrCreateContact({
      businessId: business.id,
      phoneNumber: conversation.callerPhone,
      source: 'sms_conversation',
    }).catch(() => {})

    return NextResponse.json({
      conversationId: conversation.id,
      message: {
        id: message.id,
        body: message.content,
        direction: message.direction as 'inbound' | 'outbound',
        createdAt: message.createdAt,
        status: message.telnyxStatus ?? null,
      },
      contactLabel: null,
    })
  } catch (error) {
    console.error('[dashboard-messages-send] Telnyx error', error)
    return NextResponse.json({ error: 'Failed to send SMS' }, { status: 500 })
  }
}

