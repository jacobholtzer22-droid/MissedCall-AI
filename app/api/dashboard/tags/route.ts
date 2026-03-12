// ===========================================
// CLIENT DASHBOARD: TAGS — list & create
// ===========================================

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireDashboardBusiness } from '@/lib/dashboard-auth'

export async function GET() {
  const authResult = await requireDashboardBusiness()
  if (authResult instanceof NextResponse) return authResult
  const { business } = authResult

  const tags = await db.tag.findMany({
    where: { businessId: business.id },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json({ tags })
}

export async function POST(request: Request) {
  const authResult = await requireDashboardBusiness()
  if (authResult instanceof NextResponse) return authResult
  const { business } = authResult

  let body: { name?: string; color?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const name = body.name?.trim()
  if (!name) return NextResponse.json({ error: 'Tag name is required' }, { status: 400 })

  const existing = await db.tag.findUnique({
    where: { businessId_name: { businessId: business.id, name } },
  })
  if (existing) return NextResponse.json({ error: 'Tag with this name already exists' }, { status: 409 })

  const tag = await db.tag.create({
    data: {
      businessId: business.id,
      name,
      color: body.color?.trim() || '#6B7280',
    },
  })

  return NextResponse.json({ tag })
}
