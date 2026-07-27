// ===========================================
// CLIENT DASHBOARD: MESSAGES — SMS campaign preview
// ===========================================

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireDashboardBusiness } from '@/lib/dashboard-auth'
import { normalizeToE164 } from '@/lib/phone-utils'
import type { Prisma } from '@prisma/client'

type RecipientFilter =
  | { type: 'all' }
  | { type: 'tags'; tagIds: string[] }
  | { type: 'status'; statuses: string[] }
  | { type: 'manual'; contactIds: string[] }

type CampaignPreviewBody = {
  body: string
  recipientFilter: RecipientFilter
  mergeFields?: boolean
}

function applyMergeFields(template: string, contact: { name: string | null }, businessName: string) {
  let text = template
  text = text.replace(/\{\{\s*name\s*\}\}/gi, contact.name?.trim() || '')
  text = text.replace(/\{\{\s*business_name\s*\}\}/gi, businessName)
  return text
}

export async function POST(request: Request) {
  const authResult = await requireDashboardBusiness()
  if (authResult instanceof NextResponse) return authResult
  const { business } = authResult

  if (!business.massMessagingEnabled) {
    return NextResponse.json({ error: 'Feature not available' }, { status: 403 })
  }

  let body: CampaignPreviewBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const textTemplate = body.body?.trim()
  if (!textTemplate) {
    return NextResponse.json({ error: 'body is required' }, { status: 400 })
  }

  const filter = body.recipientFilter as RecipientFilter | undefined
  if (!filter?.type) {
    return NextResponse.json({ error: 'recipientFilter.type is required' }, { status: 400 })
  }

  let where: Prisma.ContactWhereInput = {
    businessId: business.id,
    phoneNumber: { not: '' },
  }

  if (filter.type === 'tags' && Array.isArray(filter.tagIds) && filter.tagIds.length > 0) {
    where = {
      ...where,
      contactTags: { some: { tagId: { in: filter.tagIds } } },
    }
  } else if (filter.type === 'status' && Array.isArray(filter.statuses) && filter.statuses.length > 0) {
    where = {
      ...where,
      status: { in: filter.statuses },
    }
  } else if (filter.type === 'manual' && Array.isArray(filter.contactIds) && filter.contactIds.length > 0) {
    where = {
      ...where,
      id: { in: filter.contactIds },
    }
  }

  const contacts = await db.contact.findMany({
    where,
    select: { id: true, name: true, phoneNumber: true },
    take: 50,
  })

  const totalCount = await db.contact.count({ where })

  // Exclude blocked recipients (same logic as campaign send) so preview count matches
  const blockedRows = await db.blockedNumber.findMany({
    where: { businessId: business.id },
    select: { phoneNumber: true },
  })
  const blockedE164Set = new Set(blockedRows.map(b => normalizeToE164(b.phoneNumber)).filter(Boolean))

  // For the full count: fetch all phone numbers and filter
  const allPhones = await db.contact.findMany({
    where,
    select: { phoneNumber: true },
  })
  const excludedCount = allPhones.filter(c => {
    const e164 = normalizeToE164(c.phoneNumber)
    return e164 !== '' && blockedE164Set.has(e164)
  }).length
  const recipientCount = totalCount - excludedCount

  const sampleContact = contacts[0]
  const sampleMessage =
    sampleContact && body.mergeFields !== false
      ? applyMergeFields(textTemplate, sampleContact, business.name || 'our team')
      : textTemplate

  return NextResponse.json({
    recipientCount,
    sampleMessage,
    excluded: excludedCount,
  })
}

