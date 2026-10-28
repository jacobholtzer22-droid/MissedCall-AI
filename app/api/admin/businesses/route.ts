import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getAdminBusinesses } from '@/lib/admin-stats'
import { db } from '@/lib/db'
import { createBusinessRow } from '@/lib/ops/clients'
import { SERVICE_KEYS } from '@/lib/ops/types'
import { BadRequest, listOf, nullableString, readJsonObject, rejectUnknownKeys } from '@/lib/ops/validate'

const ADMIN_USER_ID = process.env.ADMIN_USER_ID

export async function GET() {
  const { userId } = await auth()

  if (!userId || userId !== ADMIN_USER_ID) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  try {
    const businesses = await getAdminBusinesses()
    return NextResponse.json({ businesses })
  } catch (error) {
    console.error('Admin: Failed to fetch businesses:', error)
    return NextResponse.json({ error: 'Failed to fetch businesses' }, { status: 500 })
  }
}

/**
 * Create a platform Business without a signup (no Clerk user):
 * { name, ownerEmail?, ownerPhone?, businessType?, timezone?, services? }.
 * Every flag at its default; missedCallAiEnabled only when services includes
 * missedcall; subscriptionStatus 'active'. The owner claims it by signing up
 * with the same verified email.
 */
export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId || userId !== ADMIN_USER_ID) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }
  try {
    const body = readJsonObject(await request.json())
    rejectUnknownKeys(body, ['name', 'ownerEmail', 'ownerPhone', 'businessType', 'timezone', 'services'])
    const name = nullableString(body.name, 'name', 200)
    if (!name) throw new BadRequest('name is required')
    const services = body.services === undefined ? [] : listOf(body.services, SERVICE_KEYS, 'services')
    const business = await db.$transaction((tx) =>
      createBusinessRow(
        tx,
        {
          name,
          ownerEmail: nullableString(body.ownerEmail, 'ownerEmail', 200),
          ownerPhone: nullableString(body.ownerPhone, 'ownerPhone', 40),
          businessType: nullableString(body.businessType, 'businessType', 100),
          timezone: nullableString(body.timezone, 'timezone', 64),
        },
        services
      )
    )
    return NextResponse.json({ business })
  } catch (error) {
    if (error instanceof BadRequest) return NextResponse.json({ error: error.message }, { status: 400 })
    console.error('Admin: Failed to create business:', error)
    return NextResponse.json({ error: 'Failed to create business' }, { status: 500 })
  }
}
