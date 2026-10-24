// ===========================================
// VERIFY SLUG
// ===========================================
// Answers one question for the AA-Template build gate (scripts/verify.ts
// check 3): is this businessSlug a real Business row?
//
// Public, GET only, no auth. A slug's existence is already observable through
// /api/contact, which is CORS-open to '*' and returns a 404-shaped error for an
// unknown businessSlug, so this endpoint discloses nothing new. It exists
// because a client site's slug is the join key for every lead it sends: a typo
// loses 100% of that site's leads silently, and the gate must be able to catch
// that before launch rather than after the client asks why the phone stopped
// ringing.
//
// The response carries NO business data — only whether the row exists. Keep it
// that way: this is an unauthenticated endpoint, and `ok` is the whole contract.

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
import { db } from '@/lib/db'

// Deliberately looser than the template's own kebab-case rule: this guard only
// has to keep junk out of the query, not canonicalize. An otherwise-valid slug
// that this accepts and the DB does not hold still answers 404.
const SLUG_REGEX = /^[a-z0-9-]{3,80}$/

const NO_STORE = { 'Cache-Control': 'no-store' } as const

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get('slug')

  if (!slug || !SLUG_REGEX.test(slug)) {
    return NextResponse.json({ ok: false, error: 'bad slug' }, { status: 400, headers: NO_STORE })
  }

  const business = await db.business.findUnique({
    where: { slug },
    select: { id: true },
  })

  return NextResponse.json({ ok: Boolean(business) }, { status: business ? 200 : 404, headers: NO_STORE })
}
