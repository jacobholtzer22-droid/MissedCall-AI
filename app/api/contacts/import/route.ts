// ===========================================
// CONTACTS IMPORT API
// ===========================================
// POST /api/contacts/import
//
// Accepts a contact list and bulk-inserts numbers into the business's
// exclusion list (BlockedNumber with source="contact") so those callers
// won't receive an automated text when the client doesn't answer.
//
// Supported input formats (Content-Type: application/json):
//   { contacts: [{ phone: "+12025551234", name: "John Doe" }, ...] }
//   { phones: ["+12025551234", "202-555-5678", ...] }
//
// Supported input formats (Content-Type: text/plain or text/csv):
//   One phone number per line (optionally with a name after a comma)
//   e.g. "+12025551234,John Doe"
//
// Supported input formats (Content-Type: text/vcard or .vcf file upload):
//   Standard vCard format exported from iOS/Android contacts

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// ---------------------------------------------------------------------------
// Phone number normalizer
// ---------------------------------------------------------------------------
// Returns E.164 string (+XXXXXXXXXXX) or null if the number is unusable.
function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')

  if (digits.length === 10) {
    // Assume US number missing country code
    const areaCode = digits.substring(0, 3)
    if (areaCode.startsWith('0') || areaCode.startsWith('1')) return null
    return `+1${digits}`
  }

  if (digits.length === 11 && digits.startsWith('1')) {
    // US number with leading 1
    const areaCode = digits.substring(1, 4)
    if (areaCode.startsWith('0') || areaCode.startsWith('1')) return null
    return `+${digits}`
  }

  if (digits.length >= 8 && digits.length <= 15) {
    // International or other format — keep as-is with + prefix
    return `+${digits}`
  }

  return null
}

// ---------------------------------------------------------------------------
// Format parsers
// ---------------------------------------------------------------------------

interface ParsedContact {
  phone: string
  name?: string
}

function parsePlainText(text: string): ParsedContact[] {
  const results: ParsedContact[] = []
  const lines = text.split(/[\r\n]+/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    // Support "phone,name" or just "phone"
    const [rawPhone, ...rest] = trimmed.split(',')
    const phone = normalizePhone(rawPhone.trim())
    if (phone) {
      results.push({ phone, name: rest.join(',').trim() || undefined })
    }
  }
  return results
}

// Extract TEL fields from vCard format
function parseVCard(text: string): ParsedContact[] {
  const results: ParsedContact[] = []
  const cards = text.split(/BEGIN:VCARD/i)
  for (const card of cards) {
    if (!card.trim()) continue
    // Extract name (FN field)
    const fnMatch = card.match(/^FN[^:]*:(.+)$/im)
    const name = fnMatch ? fnMatch[1].trim() : undefined
    // Extract all TEL fields
    const telMatches = card.matchAll(/^TEL[^:]*:(.+)$/gim)
    for (const match of telMatches) {
      const phone = normalizePhone(match[1].trim())
      if (phone) {
        results.push({ phone, name })
      }
    }
  }
  return results
}

function parseJsonBody(body: unknown): ParsedContact[] {
  const results: ParsedContact[] = []

  if (!body || typeof body !== 'object') return results

  // { contacts: [{ phone, name }, ...] }
  if (Array.isArray((body as { contacts?: unknown }).contacts)) {
    for (const item of (body as { contacts: unknown[] }).contacts) {
      if (typeof item === 'object' && item !== null) {
        const entry = item as Record<string, unknown>
        const rawPhone =
          typeof entry.phone === 'string'
            ? entry.phone
            : typeof entry.phoneNumber === 'string'
              ? entry.phoneNumber
              : null
        if (!rawPhone) continue
        const phone = normalizePhone(rawPhone)
        if (phone) {
          results.push({
            phone,
            name: typeof entry.name === 'string' ? entry.name : undefined,
          })
        }
      }
    }
    return results
  }

  // { phones: ["+1...", ...] }
  if (Array.isArray((body as { phones?: unknown }).phones)) {
    for (const item of (body as { phones: unknown[] }).phones) {
      if (typeof item === 'string') {
        const phone = normalizePhone(item)
        if (phone) results.push({ phone })
      }
    }
    return results
  }

  return results
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------
export async function POST(request: Request) {
  // Auth: must be a logged-in dashboard user
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await db.user.findUnique({
    where: { clerkId: userId },
    include: { business: true },
  })
  const business = user?.business
  if (!business) {
    return NextResponse.json({ error: 'No business found' }, { status: 404 })
  }

  // Parse the incoming contact list
  let contacts: ParsedContact[] = []
  const contentType = request.headers.get('content-type') ?? ''

  try {
    if (contentType.includes('application/json')) {
      const body = await request.json()
      contacts = parseJsonBody(body)
    } else if (
      contentType.includes('text/plain') ||
      contentType.includes('text/csv') ||
      contentType.includes('text/vcard') ||
      contentType.includes('text/x-vcard')
    ) {
      const text = await request.text()
      if (text.toUpperCase().includes('BEGIN:VCARD')) {
        contacts = parseVCard(text)
      } else {
        contacts = parsePlainText(text)
      }
    } else if (contentType.includes('multipart/form-data')) {
      // File upload
      const formData = await request.formData()
      const file = formData.get('file')
      if (file && file instanceof Blob) {
        const text = await file.text()
        if (text.toUpperCase().includes('BEGIN:VCARD')) {
          contacts = parseVCard(text)
        } else {
          contacts = parsePlainText(text)
        }
      }
      // Also support pasted numbers in the same request
      const pasted = formData.get('numbers')
      if (typeof pasted === 'string' && pasted.trim()) {
        contacts = contacts.concat(parsePlainText(pasted))
      }
    } else {
      // Fall back: try plain text
      const text = await request.text()
      if (text.toUpperCase().includes('BEGIN:VCARD')) {
        contacts = parseVCard(text)
      } else {
        contacts = parsePlainText(text)
      }
    }
  } catch (err) {
    console.error('Failed to parse contacts:', err)
    return NextResponse.json({ error: 'Failed to parse contact list' }, { status: 400 })
  }

  if (contacts.length === 0) {
    return NextResponse.json(
      { error: 'No valid phone numbers found in the provided data' },
      { status: 400 }
    )
  }

  // Deduplicate within the submitted list
  const seen = new Set<string>()
  const unique = contacts.filter(({ phone }) => {
    if (seen.has(phone)) return false
    seen.add(phone)
    return true
  })

  // Bulk upsert into BlockedNumber with source="contact"
  let imported = 0
  let skipped = 0

  for (const { phone, name } of unique) {
    try {
      await db.blockedNumber.upsert({
        where: {
          businessId_phoneNumber: { businessId: business.id, phoneNumber: phone },
        },
        create: {
          businessId: business.id,
          phoneNumber: phone,
          label: name ?? null,
          source: 'contact',
        },
        update: {
          // If the number already existed (e.g., manually blocked), keep its source
          // but update the label if we now have a name for it
          ...(name ? { label: name } : {}),
        },
      })
      imported++
    } catch {
      skipped++
    }
  }

  console.log(
    `📋 Imported ${imported} personal contacts for business ${business.id} (${skipped} skipped)`
  )

  return NextResponse.json({
    ok: true,
    imported,
    skipped,
    total: unique.length,
    message: `${imported} contact${imported !== 1 ? 's' : ''} imported. These numbers won't receive automated texts.`,
  })
}
