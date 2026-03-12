// ===========================================
// CLIENT DASHBOARD: CONTACTS — list & create
// ===========================================

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireDashboardBusiness } from '@/lib/dashboard-auth'
import { normalizeToE164 } from '@/lib/phone-utils'

const PLACEHOLDER_PHONE_PREFIX = '__email_only__'

export async function GET(request: Request) {
  const authResult = await requireDashboardBusiness()
  if (authResult instanceof NextResponse) return authResult
  const { business } = authResult

  const { searchParams } = new URL(request.url)
  const search = searchParams.get('search')?.trim() || ''
  const status = searchParams.get('status')?.trim() || ''

  const where: { businessId: string; status?: string; OR?: Array<{ name?: { contains: string; mode: 'insensitive' }; phoneNumber?: { contains: string }; email?: { contains: string; mode: 'insensitive' } }> } = {
    businessId: business.id,
  }

  if (status && status !== 'all') {
    where.status = status
  }

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { phoneNumber: { contains: search } },
      { email: { contains: search, mode: 'insensitive' } },
    ]
  }

  const contacts = await db.contact.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    include: {
      contactTags: { include: { tag: true } },
    },
  })

  const list = contacts.map((c) => ({
    id: c.id,
    name: c.name,
    phoneNumber: c.phoneNumber,
    email: c.email,
    source: c.source,
    status: c.status ?? 'new',
    tags: c.contactTags.map((ct) => ({ id: ct.tag.id, name: ct.tag.name, color: ct.tag.color })),
    lastContactedAt: c.lastContactedAt,
    totalRevenue: c.totalRevenue ?? 0,
    updatedAt: c.updatedAt,
  }))

  return NextResponse.json({ contacts: list, total: list.length })
}

export async function POST(request: Request) {
  const authResult = await requireDashboardBusiness()
  if (authResult instanceof NextResponse) return authResult
  const { business } = authResult

  let body: {
    name?: string
    phone?: string
    email?: string
    address?: string
    city?: string
    state?: string
    zip?: string
    source?: string
    notes?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const phoneRaw = body.phone?.trim()
  const email = body.email?.trim() || null
  const hasPhone = phoneRaw && phoneRaw.replace(/\D/g, '').length >= 10
  if (!hasPhone && !email) {
    return NextResponse.json({ error: 'Phone or email is required' }, { status: 400 })
  }

  const phoneNumber = hasPhone
    ? (normalizeToE164(phoneRaw!) || phoneRaw!)
    : `${PLACEHOLDER_PHONE_PREFIX}${Date.now().toString(36)}`

  const contact = await db.contact.create({
    data: {
      businessId: business.id,
      phoneNumber,
      name: body.name?.trim() || null,
      email: email || null,
      address: body.address?.trim() || null,
      city: body.city?.trim() || null,
      state: body.state?.trim() || null,
      zip: body.zip?.trim() || null,
      source: body.source?.trim() || 'manual',
      notes: body.notes?.trim() || null,
      status: 'new',
    },
    include: {
      contactTags: { include: { tag: true } },
    },
  })

  await db.activity.create({
    data: {
      businessId: business.id,
      contactId: contact.id,
      type: 'manual',
      description: 'Contact added manually',
    },
  })

  return NextResponse.json({
    contact: {
      id: contact.id,
      name: contact.name,
      phoneNumber: contact.phoneNumber,
      email: contact.email,
      source: contact.source,
      status: contact.status ?? 'new',
      tags: contact.contactTags.map((ct) => ({ id: ct.tag.id, name: ct.tag.name, color: ct.tag.color })),
      lastContactedAt: contact.lastContactedAt,
      totalRevenue: contact.totalRevenue ?? 0,
    },
  })
}
