import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { prepareBusinessPatch } from '@/lib/admin-business-patch'

const ADMIN_USER_ID = process.env.ADMIN_USER_ID

export async function PATCH(
  request: Request,
  context: { params: { id: string } }
) {
  const { id } = context.params
  const { userId } = await auth()

  if (!userId || userId !== ADMIN_USER_ID) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  try {
    const body = await request.json()

    // Allowlist and normalisation live in lib/admin-business-patch.ts (shared with the Ops chief).
    const prepared = await prepareBusinessPatch(body)
    if (!prepared.ok) return NextResponse.json({ error: prepared.error }, { status: 400 })
    const data = prepared.data

    const business = await db.business.update({
      where: { id },
      data,
    })

    return NextResponse.json({ business })
  } catch (error) {
    console.error('Admin: Failed to update business:', error)
    return NextResponse.json({ error: 'Failed to update business' }, { status: 500 })
  }
}