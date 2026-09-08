import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getAdminBusinesses } from '@/lib/admin-stats'

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
