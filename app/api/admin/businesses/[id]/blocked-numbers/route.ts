import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

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
    const blockedNumbers = await db.blockedNumber.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json({ blockedNumbers })
  } catch (error) {
    console.error('Admin: Failed to fetch blocked numbers:', error)
    return NextResponse.json(
      { error: 'Failed to fetch blocked numbers' },
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
    const phoneNumber = typeof body.phoneNumber === 'string' ? body.phoneNumber.trim() : ''
    const label = typeof body.label === 'string' ? body.label.trim() || null : null

    if (!phoneNumber) {
      return NextResponse.json(
        { error: 'phoneNumber is required' },
        { status: 400 }
      )
    }

    const business = await db.business.findUnique({ where: { id: businessId } })
    if (!business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    const blocked = await db.blockedNumber.upsert({
      where: {
        businessId_phoneNumber: { businessId, phoneNumber },
      },
      create: { businessId, phoneNumber, label },
      update: { label },
    })
    return NextResponse.json({ blockedNumber: blocked })
  } catch (error) {
    console.error('Admin: Failed to add blocked number:', error)
    return NextResponse.json(
      { error: 'Failed to add blocked number' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: Request,
  context: { params: { id: string } }
) {
  const { userId } = await auth()
  if (!userId || userId !== ADMIN_USER_ID) return unauthorized()

  const businessId = context.params.id
  const { searchParams } = new URL(request.url)
  const blockedId = searchParams.get('id')

  if (!blockedId) {
    return NextResponse.json(
      { error: 'Query parameter id is required' },
      { status: 400 }
    )
  }

  try {
    await db.blockedNumber.deleteMany({
      where: { id: blockedId, businessId },
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Admin: Failed to remove blocked number:', error)
    return NextResponse.json(
      { error: 'Failed to remove blocked number' },
      { status: 500 }
    )
  }
}
