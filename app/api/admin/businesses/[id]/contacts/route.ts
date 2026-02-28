import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { normalizePhoneNumber } from '@/lib/phone-utils'

const ADMIN_USER_ID = process.env.ADMIN_USER_ID

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
}

export async function GET(
  _request: Request,
  context: { params: { id: string } }
) {
  const { userId } = await auth()
  if (!userId || userId !== ADMIN_USER_ID) return unauthorized()

  const businessId = context.params.id
  try {
    const contacts = await db.contact.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json({ contacts })
  } catch (error) {
    console.error('Admin: Failed to fetch contacts:', error)
    return NextResponse.json(
      { error: 'Failed to fetch contacts' },
      { status: 500 }
    )
  }
}

export async function POST(
  request: Request,
  context: { params: { id: string } }
) {
  const { userId } = await auth()
  if (!userId || userId !== ADMIN_USER_ID) return unauthorized()

  const businessId = context.params.id
  try {
    const body = await request.json()
    const rawPhone = typeof body.phoneNumber === 'string' ? body.phoneNumber.trim() : ''
    const name = typeof body.name === 'string' ? body.name.trim() || null : null

    if (!rawPhone) {
      return NextResponse.json(
        { error: 'phoneNumber is required' },
        { status: 400 }
      )
    }

    const business = await db.business.findUnique({ where: { id: businessId } })
    if (!business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    const phoneNumber = normalizePhoneNumber(rawPhone)
    if (phoneNumber.length < 10) {
      return NextResponse.json(
        { error: 'Invalid phone number' },
        { status: 400 }
      )
    }

    const contact = await db.contact.upsert({
      where: {
        businessId_phoneNumber: { businessId, phoneNumber },
      },
      create: { businessId, phoneNumber, name },
      update: { name },
    })
    return NextResponse.json({ contact })
  } catch (error) {
    console.error('Admin: Failed to add contact:', error)
    return NextResponse.json(
      { error: 'Failed to add contact' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: { id: string } }
) {
  const { userId } = await auth()
  if (!userId || userId !== ADMIN_USER_ID) return unauthorized()

  const businessId = context.params.id
  let body: { id?: string; phoneNumber?: string } = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Request body must be valid JSON' },
      { status: 400 }
    )
  }

  const contactId = typeof body.id === 'string' ? body.id.trim() || null : null
  const phoneNumber = typeof body.phoneNumber === 'string' ? body.phoneNumber.trim() || null : null

  if (!contactId && !phoneNumber) {
    return NextResponse.json(
      { error: 'Request body must include id or phoneNumber' },
      { status: 400 }
    )
  }

  try {
    let deleted = 0

    if (contactId) {
      const result = await db.contact.deleteMany({
        where: { businessId, id: contactId },
      })
      deleted = result.count
    }

    if (deleted === 0 && phoneNumber) {
      const normalized = normalizePhoneNumber(phoneNumber)
      if (normalized.length >= 10) {
        const result = await db.contact.deleteMany({
          where: { businessId, phoneNumber: normalized },
        })
        deleted = result.count
      }
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Admin: Failed to remove contact:', error)
    return NextResponse.json(
      { error: 'Failed to remove contact' },
      { status: 500 }
    )
  }
}
