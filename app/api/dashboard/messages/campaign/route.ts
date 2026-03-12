// ===========================================
// CLIENT DASHBOARD: MESSAGES — SMS campaign send
// ===========================================

import { NextResponse } from 'next/server'
import Telnyx from 'telnyx'
import { db } from '@/lib/db'
import { requireDashboardBusiness } from '@/lib/dashboard-auth'
import { normalizeToE164 } from '@/lib/phone-utils'
import { findOrCreateContact } from '@/lib/crm-utils'
import type { Prisma } from '@prisma/client'

type RecipientFilter =
  | { type: 'all' }
  | { type: 'tags'; tagIds: string[] }
  | { type: 'status'; statuses: string[] }
  | { type: 'manual'; contactIds: string[] }

type CampaignBody = {
  body: string
  recipientFilter: RecipientFilter
  mergeFields?: boolean
}

const BATCH_SIZE = 10
const BATCH_DELAY_MS = 2000

function applyMergeFields(template: string, contact: { name: string | null }, businessName: string) {
  let text = template
  text = text.replace(/\{\{\s*name\s*\}\}/gi, contact.name?.trim() || '')
  text = text.replace(/\{\{\s*business_name\s*\}\}/gi, businessName)
  return text
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function POST(request: Request) {
  const authResult = await requireDashboardBusiness()
  if (authResult instanceof NextResponse) return authResult
  const { business } = authResult

  let body: CampaignBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const textTemplate = body.body?.trim()
  if (!textTemplate) {
    return NextResponse.json({ error: 'body is required' }, { status: 400 })
  }

  if (!business.telnyxPhoneNumber) {
    return NextResponse.json({ error: 'Business is not configured with a Telnyx phone number' }, { status: 400 })
  }

  const filter = body.recipientFilter as RecipientFilter | undefined
  if (!filter?.type) {
    return NextResponse.json({ error: 'recipientFilter.type is required' }, { status: 400 })
  }

  // Resolve contacts by filter
  let contactsWhere: Prisma.ContactWhereInput = {
    businessId: business.id,
    phoneNumber: { not: '' },
  }

  if (filter.type === 'tags' && Array.isArray(filter.tagIds) && filter.tagIds.length > 0) {
    contactsWhere = {
      ...contactsWhere,
      contactTags: { some: { tagId: { in: filter.tagIds } } },
    }
  } else if (filter.type === 'status' && Array.isArray(filter.statuses) && filter.statuses.length > 0) {
    contactsWhere = {
      ...contactsWhere,
      status: { in: filter.statuses },
    }
  } else if (filter.type === 'manual' && Array.isArray(filter.contactIds) && filter.contactIds.length > 0) {
    contactsWhere = {
      ...contactsWhere,
      id: { in: filter.contactIds },
    }
  }

  const contacts = await db.contact.findMany({
    where: contactsWhere,
    select: { id: true, name: true, phoneNumber: true },
  })

  const telnyxClient = new Telnyx({ apiKey: process.env.TELNYX_API_KEY! })
  const businessName = business.name || 'our team'

  let sent = 0
  let failed = 0
  let skipped = 0

  for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
    const batch = contacts.slice(i, i + BATCH_SIZE)

    await Promise.all(
      batch.map(async (contact) => {
        const toRaw = contact.phoneNumber
        if (!toRaw) {
          skipped++
          return
        }
        const to = normalizeToE164(toRaw) || toRaw
        const text = body.mergeFields === false ? textTemplate : applyMergeFields(textTemplate, contact, businessName)

        try {
          const sentRes = await telnyxClient.messages.send({
            from: business.telnyxPhoneNumber!,
            to,
            text,
          })
          const data = (sentRes as any)?.data
          const messageId = data?.id as string | undefined
          const status = (data?.to?.[0]?.status as string | undefined) ?? 'sent'

          // Conversation per phone number
          let conversation = await db.conversation.findFirst({
            where: { businessId: business.id, callerPhone: to },
            orderBy: { lastMessageAt: 'desc' },
          })
          if (!conversation) {
            conversation = await db.conversation.create({
              data: {
                businessId: business.id,
                callerPhone: to,
                status: 'active',
                lastMessageAt: new Date(),
                manualMode: true,
              },
            })
          }

          await db.message.create({
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

          await findOrCreateContact({
            businessId: business.id,
            phoneNumber: to,
            source: 'sms_conversation',
          }).catch(() => {})

          sent++
        } catch (err) {
          console.error('[dashboard-messages-campaign] Telnyx error for contact', contact.id, err)
          failed++
        }
      })
    )

    if (i + BATCH_SIZE < contacts.length) {
      await sleep(BATCH_DELAY_MS)
    }
  }

  return NextResponse.json({ sent, failed, skipped })
}

