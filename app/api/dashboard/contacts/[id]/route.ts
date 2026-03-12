// ===========================================
// CLIENT DASHBOARD: CONTACT BY ID — get, update, delete
// ===========================================

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireDashboardBusiness } from '@/lib/dashboard-auth'
import { normalizeToE164 } from '@/lib/phone-utils'
import { phonesMatch } from '@/lib/phone-utils'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireDashboardBusiness()
  if (authResult instanceof NextResponse) return authResult
  const { business } = authResult

  const { id } = await params
  const contact = await db.contact.findFirst({
    where: { id, businessId: business.id },
    include: {
      contactTags: { include: { tag: true } },
      activities: { orderBy: { createdAt: 'desc' }, take: 100 },
      jobs: { orderBy: { scheduledDate: 'desc' } },
    },
  })

  if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 })

  // Conversations: same business, caller phone matches contact phone
  const conversations = await db.conversation.findMany({
    where: {
      businessId: business.id,
      messages: { some: {} },
    },
    orderBy: { lastMessageAt: 'desc' },
    include: {
      messages: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  })
  const contactConversations = conversations.filter((c) =>
    phonesMatch(c.callerPhone, contact.phoneNumber)
  )

  return NextResponse.json({
    contact: {
      id: contact.id,
      name: contact.name,
      phoneNumber: contact.phoneNumber,
      email: contact.email,
      address: contact.address,
      city: contact.city,
      state: contact.state,
      zip: contact.zip,
      source: contact.source,
      status: contact.status ?? 'new',
      notes: contact.notes,
      lastContactedAt: contact.lastContactedAt,
      totalRevenue: contact.totalRevenue ?? 0,
      tags: contact.contactTags.map((ct) => ({ id: ct.tag.id, name: ct.tag.name, color: ct.tag.color })),
      activities: contact.activities,
      jobs: contact.jobs,
      conversations: contactConversations.map((conv) => ({
        id: conv.id,
        callerPhone: conv.callerPhone,
        status: conv.status,
        lastMessageAt: conv.lastMessageAt,
        lastMessage: conv.messages[0]?.content,
      })),
    },
  })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireDashboardBusiness()
  if (authResult instanceof NextResponse) return authResult
  const { business } = authResult

  const { id } = await params
  const contact = await db.contact.findFirst({
    where: { id, businessId: business.id },
  })
  if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const allowed = [
    'name', 'phoneNumber', 'email', 'address', 'city', 'state', 'zip',
    'source', 'status', 'notes',
  ] as const
  const data: Record<string, string | null> = {}
  for (const key of allowed) {
    if (body[key] !== undefined) {
      if (key === 'phoneNumber' && typeof body[key] === 'string' && body[key].trim()) {
        const normalized = normalizeToE164(body[key].trim()) || body[key].trim()
        data[key] = normalized
      } else if (typeof body[key] === 'string') {
        data[key] = body[key].trim() || null
      } else if (body[key] === null) {
        data[key] = null
      }
    }
  }

  const updated = await db.contact.update({
    where: { id },
    data,
    include: {
      contactTags: { include: { tag: true } },
    },
  })

  return NextResponse.json({
    contact: {
      id: updated.id,
      name: updated.name,
      phoneNumber: updated.phoneNumber,
      email: updated.email,
      address: updated.address,
      city: updated.city,
      state: updated.state,
      zip: updated.zip,
      source: updated.source,
      status: updated.status ?? 'new',
      notes: updated.notes,
      lastContactedAt: updated.lastContactedAt,
      totalRevenue: updated.totalRevenue ?? 0,
      tags: updated.contactTags.map((ct) => ({ id: ct.tag.id, name: ct.tag.name, color: ct.tag.color })),
    },
  })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireDashboardBusiness()
  if (authResult instanceof NextResponse) return authResult
  const { business } = authResult

  const { id } = await params
  const contact = await db.contact.findFirst({
    where: { id, businessId: business.id },
  })
  if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 })

  await db.contact.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
