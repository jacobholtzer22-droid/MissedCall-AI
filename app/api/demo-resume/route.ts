// ===========================================
// DEMO RESUME LINK
// ===========================================
// Target of the {link} in the lead-facing demo SMS. Looks the token up, puts
// the visitor back in the state they left: gate satisfied, correct video arm,
// player already unlocked.
//
// A Route Handler rather than middleware because it needs Prisma, and rather
// than the page because only Route Handlers and Server Actions may set cookies.
//
// The token is the credential: following it identifies the browser AS this
// lead and prefills their name and phone. Hence 28 random chars, not the cuid.

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { GATE_COOKIE, GATE_COOKIE_MAX_AGE } from '@/app/book/constants'
import { FUNNEL_VARIANT_COOKIE, FUNNEL_VARIANT_MAX_AGE, isFunnelVariant } from '@/lib/funnel-variant'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('t')?.trim()
  const base = new URL('/book', request.nextUrl.origin)

  if (!token || token.length < 16) {
    console.log('[demo-resume] rejected: missing or short token')
    return NextResponse.redirect(base)
  }

  try {
    const lead = await db.websiteLead.findUnique({
      where: { resumeToken: token },
      select: { id: true, funnelVariant: true },
    })
    if (!lead) {
      console.log('[demo-resume] rejected: token not found')
      return NextResponse.redirect(base)
    }

    // resumed=1 makes the player render already unlocked.
    base.searchParams.set('resumed', '1')
    const res = NextResponse.redirect(base)
    const opts = {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    }
    res.cookies.set(GATE_COOKIE, lead.id, { ...opts, maxAge: GATE_COOKIE_MAX_AGE })
    // Pin them back to the arm they were originally shown, so a returning lead
    // never sees the other video and pollutes the test.
    if (isFunnelVariant(lead.funnelVariant)) {
      res.cookies.set(FUNNEL_VARIANT_COOKIE, lead.funnelVariant, { ...opts, maxAge: FUNNEL_VARIANT_MAX_AGE })
    }
    console.log(`[demo-resume] ok leadId=${lead.id} video=${lead.funnelVariant ?? 'none'}`)
    return res
  } catch (err) {
    console.error('[demo-resume] failed:', err)
    return NextResponse.redirect(base)
  }
}
