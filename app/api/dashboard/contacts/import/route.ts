// ===========================================
// DASHBOARD: CONTACTS IMPORT
// ===========================================

import { NextResponse } from 'next/server'
import { requireDashboardBusiness } from '@/lib/dashboard-auth'
import { findExistingContact, findOrCreateContact } from '@/lib/crm-utils'

const BATCH_SIZE = 25

type ImportContact = {
  name?: string
  phone?: string
  email?: string
  address?: string
  city?: string
  state?: string
  zip?: string
  notes?: string
  serviceHistory?: string
}

export async function POST(request: Request) {
  const authResult = await requireDashboardBusiness()
  if (authResult instanceof NextResponse) return authResult
  const { business } = authResult

  let body: { source?: string; contacts?: ImportContact[]; dryRun?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const source = typeof body.source === 'string' ? body.source.trim() : ''
  const contacts = Array.isArray(body.contacts) ? body.contacts : []
  const dryRun = body.dryRun === true

  if (!source) {
    return NextResponse.json({ error: 'Source is required' }, { status: 400 })
  }

  if (dryRun) {
    let duplicates = 0
    for (const c of contacts) {
      const phone = c.phone?.trim()
      const email = c.email?.trim()
      const hasPhone = phone && phone.replace(/\D/g, '').length >= 10
      const hasEmail = email && email.includes('@')
      if (!hasPhone && !hasEmail) continue
      const existing = await findExistingContact(business.id, phone || null, email || null)
      if (existing) duplicates += 1
    }
    return NextResponse.json({
      imported: 0,
      duplicates,
      errors: 0,
    })
  }

  let imported = 0
  let duplicates = 0
  let errors = 0

  for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
    const batch = contacts.slice(i, i + BATCH_SIZE)
    for (const c of batch) {
      const phone = c.phone?.trim()
      const email = c.email?.trim()
      const hasPhone = phone && phone.replace(/\D/g, '').length >= 10
      const hasEmail = email && email.includes('@')
      if (!hasPhone && !hasEmail) {
        errors += 1
        continue
      }

      const notes = [c.notes, c.serviceHistory].filter(Boolean).join('\n\n').trim() || undefined

      const result = await findOrCreateContact({
        businessId: business.id,
        phoneNumber: phone || null,
        email: email || null,
        name: c.name?.trim() || null,
        source,
        address: c.address?.trim() || null,
        city: c.city?.trim() || null,
        state: c.state?.trim() || null,
        zip: c.zip?.trim() || null,
        notes: notes || null,
        skipUpdateIfExists: true,
      })

      if (!result) {
        errors += 1
        continue
      }
      if (result.isDuplicate) {
        duplicates += 1
      } else {
        imported += 1
      }
    }
  }

  return NextResponse.json({
    imported,
    duplicates,
    errors,
  })
}
