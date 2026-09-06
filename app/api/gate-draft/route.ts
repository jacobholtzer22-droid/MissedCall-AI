// ===========================================
// POST /api/gate-draft — save each screen as it is answered
// ===========================================
// Fired after every wizard screen. Upserted on the visitor cookie, so the four
// screens build one row and a dead end at the code step still has the trade,
// the name, the number and the email the person actually typed.
//
// Before this, nothing the gate collected was written down until AFTER the
// phone was verified. Anyone who could not receive a code — a landline, five
// wrong digits, an expired code — disappeared with all of it.
//
// Never blocks the wizard: every failure path returns 200 and the visitor sees
// nothing. This is a safety net, not a step.

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { rateLimit, getClientIp } from '@/lib/rate-limit'
import { validateUsMobile } from '@/lib/phone-utils'
import { VARIANT_COOKIE, VISITOR_COOKIE } from '@/lib/variant'
import { FUNNEL_VARIANT_COOKIE } from '@/lib/funnel-variant'
import { ATTRIBUTION_COOKIE, parseAttributionCookie } from '@/lib/attribution-cookie'

export const dynamic = 'force-dynamic'

const STEPS = ['trade', 'firstName', 'phone', 'email'] as const

function clean(v: unknown, max: number): string | undefined {
  if (typeof v !== 'string') return undefined
  const t = v.replace(/[\r\n]+/g, ' ').trim().slice(0, max)
  return t || undefined
}

export async function POST(request: NextRequest) {
  try {
    // Four screens plus retries per visitor; generous enough not to drop a real
    // one, tight enough that this cannot be used to write rows in bulk.
    if (!rateLimit(`gate-draft:${getClientIp(request)}`, 30, 60_000).allowed) {
      return NextResponse.json({ ok: true })
    }

    const visitorId = request.cookies.get(VISITOR_COOKIE)?.value
    if (!visitorId) {
      // No cookie, no key to upsert on. Nothing to do and nothing to report:
      // the wizard is not waiting on this.
      return NextResponse.json({ ok: true, skipped: 'no_visitor' })
    }

    const body = (await request.json()) as {
      step?: string
      trade?: string
      firstName?: string
      phone?: string
      email?: string
      landingPath?: string
    }

    const lastStep = (STEPS as readonly string[]).includes(body.step ?? '') ? body.step : undefined
    const trade = clean(body.trade, 80)
    const firstName = clean(body.firstName, 80)
    const email = clean(body.email, 160)
    const landingPath = clean(body.landingPath, 1000)
    // Stored E.164 when it parses, raw otherwise: a half-typed number is still
    // better than nothing on a row whose job is "call this person".
    const rawPhone = clean(body.phone, 40)
    const parsed = rawPhone ? validateUsMobile(rawPhone) : null
    const phone = parsed?.ok ? parsed.e164 : rawPhone

    const touches = parseAttributionCookie(request.cookies.get(ATTRIBUTION_COOKIE)?.value)
    const arm = request.cookies.get(FUNNEL_VARIANT_COOKIE)?.value ?? null
    const variant = request.cookies.get(VARIANT_COOKIE)?.value ?? null

    // Only ever fills gaps. A later screen sending a blank must not wipe an
    // earlier answer — going back and forth in the wizard is normal.
    const fields = {
      ...(trade ? { trade } : {}),
      ...(firstName ? { firstName } : {}),
      ...(phone ? { phone } : {}),
      ...(email ? { email } : {}),
      ...(lastStep ? { lastStep } : {}),
      ...(landingPath ? { landingPath } : {}),
      ...(arm ? { arm } : {}),
      ...(variant ? { variant } : {}),
      ...(touches.last ? { attributionLast: touches.last } : {}),
    }

    await db.gateDraft.upsert({
      where: { visitorId },
      create: {
        visitorId,
        ...fields,
        ...(touches.first ? { attributionFirst: touches.first } : {}),
      },
      update: fields,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[gate-draft] failed:', err)
    // 200 on purpose. A draft that did not save must never surface to someone
    // filling in a form.
    return NextResponse.json({ ok: false }, { status: 200 })
  }
}
