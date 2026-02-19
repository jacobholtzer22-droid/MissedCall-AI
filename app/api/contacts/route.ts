// ===========================================
// CLIENT CONTACTS API
// ===========================================
// GET  /api/contacts        - List imported personal contacts for the current business
// DELETE /api/contacts?id=X - Remove one contact by its BlockedNumber id
// DELETE /api/contacts?all=1 - Remove ALL imported personal contacts for the business

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

async function getAuthenticatedBusiness() {
  const { userId } = await auth()
  if (!userId) return null

  const user = await db.user.findUnique({
    where: { clerkId: userId },
    include: { business: true },
  })
  return user?.business ?? null
}

export async function GET() {
  const business = await getAuthenticatedBusiness()
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const contacts = await db.blockedNumber.findMany({
      where: { businessId: business.id, source: 'contact' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, phoneNumber: true, label: true, createdAt: true },
    })
    return NextResponse.json({ contacts, total: contacts.length })
  } catch (error) {
    console.error('Failed to fetch contacts:', error)
    return NextResponse.json({ error: 'Failed to fetch contacts' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  const business = await getAuthenticatedBusiness()
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  const all = searchParams.get('all')

  try {
    if (all === '1') {
      const { count } = await db.blockedNumber.deleteMany({
        where: { businessId: business.id, source: 'contact' },
      })
      return NextResponse.json({ ok: true, deleted: count })
    }

    if (id) {
      await db.blockedNumber.deleteMany({
        where: { id, businessId: business.id, source: 'contact' },
      })
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json(
      { error: 'Provide ?id=<id> to delete one or ?all=1 to delete all contacts' },
      { status: 400 }
    )
  } catch (error) {
    console.error('Failed to delete contact(s):', error)
    return NextResponse.json({ error: 'Failed to delete contact(s)' }, { status: 500 })
  }
}
