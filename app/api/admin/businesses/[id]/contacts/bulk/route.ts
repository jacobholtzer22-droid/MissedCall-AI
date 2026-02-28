import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { normalizePhoneNumber } from '@/lib/phone-utils'

const ADMIN_USER_ID = process.env.ADMIN_USER_ID
const BATCH_SIZE = 100

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
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
    const rawContacts = Array.isArray(body.contacts) ? body.contacts : []

    const business = await db.business.findUnique({ where: { id: businessId } })
    if (!business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    // Normalize and filter valid contacts (dedupe by phone)
    const seen = new Set<string>()
    const valid: { phoneNumber: string; name: string | null }[] = []
    for (const c of rawContacts) {
      const rawPhone = typeof c.phoneNumber === 'string' ? c.phoneNumber.trim() : String(c?.phoneNumber ?? '').trim()
      if (!rawPhone) continue
      const phoneNumber = normalizePhoneNumber(rawPhone)
      if (phoneNumber.length < 10) continue
      if (seen.has(phoneNumber)) continue
      seen.add(phoneNumber)
      const name = typeof c.name === 'string' ? c.name.trim() || null : null
      valid.push({ phoneNumber, name })
    }

    let created = 0
    for (let i = 0; i < valid.length; i += BATCH_SIZE) {
      const batch = valid.slice(i, i + BATCH_SIZE)
      const result = await db.contact.createMany({
        data: batch.map((c) => ({
          businessId,
          phoneNumber: c.phoneNumber,
          name: c.name,
        })),
        skipDuplicates: true,
      })
      created += result.count
    }

    return NextResponse.json({ ok: true, created, total: valid.length })
  } catch (error) {
    console.error('Admin: Failed to bulk import contacts:', error)
    return NextResponse.json(
      { error: 'Failed to import contacts' },
      { status: 500 }
    )
  }
}
