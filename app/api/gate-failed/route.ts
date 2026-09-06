// ===========================================
// POST /api/gate-failed — nobody disappears at the phone screen
// ===========================================
// Every dead end after the phone screen ends here: a number that cannot receive
// a text and did not take the call, five wrong codes, an expired code, or the
// resend cap. Before this, all four ended at a red error message and the person
// was gone — they had already given a trade, a name, a number and an email, and
// none of it was written down anywhere.
//
// This writes the lead as needs_call and tells Jacob to phone them.
//
// It deliberately does NOT fire the Lead pixel event. Lead means a verified
// number and nothing else; a gate failure is a person to call, not a conversion
// to optimise an ad account against.

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { validateUsMobile } from '@/lib/phone-utils'
import { rateLimit, getClientIp } from '@/lib/rate-limit'
import { getMarketingBusiness, notifyOwnerOfMarketingEvent, findPartialLeadByPhone } from '@/lib/marketing-funnel'
import { logFunnelEvent } from '@/lib/funnel-log'
import { isTestPhone } from '@/lib/test-allowlist'
import { VARIANT_COOKIE, VISITOR_COOKIE } from '@/lib/variant'
import { FUNNEL_VARIANT_COOKIE } from '@/lib/funnel-variant'
import { ATTRIBUTION_COOKIE, parseAttributionCookie } from '@/lib/attribution-cookie'
import { describeJourney, sanitizeTouch } from '@/lib/attribution'

export const dynamic = 'force-dynamic'

/** Reasons the gate can end without a verified number. */
// Not exported: a Next.js route file may only export handlers and config.
const GATE_FAIL_REASONS = ['not_routable', 'lockout', 'expired', 'resend_cap', 'call_failed'] as const
type GateFailReason = (typeof GATE_FAIL_REASONS)[number]

const REASON_LABELS: Record<GateFailReason, string> = {
  not_routable: 'number cannot receive texts',
  lockout: '5 wrong codes',
  expired: 'code expired without verifying',
  resend_cap: 'hit the resend cap',
  call_failed: 'voice call could not be placed',
}

const visitorIdOf = (request: NextRequest): string | null =>
  request.cookies.get(VISITOR_COOKIE)?.value ?? null

function escapeHtml(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export async function POST(request: NextRequest) {
  try {
    if (!rateLimit(`gate-failed:${getClientIp(request)}`, 10, 60_000).allowed) {
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    const body = (await request.json()) as {
      reason?: string
      phone?: string
      firstName?: string
      trade?: string
      email?: string
    }

    const reason = (GATE_FAIL_REASONS as readonly string[]).includes(body.reason ?? '')
      ? (body.reason as GateFailReason)
      : null
    if (!reason) return NextResponse.json({ error: 'unknown reason' }, { status: 400 })

    // What the visitor typed, screen by screen. The client sends what it has;
    // this is the backstop for the paths where it does not — a closed tab, a
    // reload, a browser that dropped the keepalive. It only fills gaps.
    const visitorId = visitorIdOf(request)
    const draft = visitorId
      ? await db.gateDraft.findUnique({ where: { visitorId } }).catch(() => null)
      : null

    // A number is the whole point of the row: it is what Jacob will ring. If the
    // body has none, the draft may.
    const fromBody = validateUsMobile(body.phone)
    const fromDraft = draft?.phone ? validateUsMobile(draft.phone) : null
    const phone = fromBody.ok ? fromBody.e164 : fromDraft?.ok ? fromDraft.e164 : null
    if (!phone) return NextResponse.json({ error: 'no usable number' }, { status: 400 })

    const business = await getMarketingBusiness()
    if (!business) {
      console.error('[gate-failed] no marketing business configured; lead NOT saved', { reason, phone })
      return NextResponse.json({ ok: false }, { status: 503 })
    }

    const firstName = body.firstName?.trim().slice(0, 80) || draft?.firstName || ''
    const trade = body.trade?.trim().slice(0, 80) || draft?.trade || ''
    const email = body.email?.trim().slice(0, 160) || draft?.email || ''
    const arm = request.cookies.get(FUNNEL_VARIANT_COOKIE)?.value ?? draft?.arm ?? null
    const variant = request.cookies.get(VARIANT_COOKIE)?.value ?? null
    const touches = parseAttributionCookie(request.cookies.get(ATTRIBUTION_COOKIE)?.value)
    const isTest = isTestPhone(phone)

    const message = [
      `GATE FAILED: ${REASON_LABELS[reason]}`,
      '',
      `Trade: ${trade || 'not given'}`,
      `First name: ${firstName || 'not given'}`,
      `Email: ${email || 'not given'}`,
      `Funnel arm: ${arm ?? 'unassigned'}`,
      `Source: meta_demo_video`,
      `Landing path: ${draft?.landingPath ?? 'not captured'}`,
      `Screens completed: ${draft?.lastStep ? `through ${draft.lastStep}` : 'not recorded'}`,
      '',
      describeJourney(touches, null),
    ].join('\n')

    // Keyed on phone like every other funnel write, so a person who fails twice
    // enriches one row instead of spawning two.
    const existing = await findPartialLeadByPhone(business.id, phone)
    const lead = existing
      ? await db.websiteLead.update({
          where: { id: existing.id },
          data: {
            status: 'needs_call',
            ...(firstName ? { name: firstName } : {}),
            ...(email ? { email } : {}),
            phone,
            message,
            variant,
            funnelVariant: arm,
            ...(sanitizeTouch(existing.attributionFirst) ? {} : touches.first ? { attributionFirst: touches.first } : {}),
            ...(touches.last ? { attributionLast: touches.last } : {}),
          },
        })
      : await db.websiteLead.create({
          data: {
            businessId: business.id,
            name: firstName || phone,
            phone,
            email: email || null,
            message,
            status: 'needs_call',
            variant,
            funnelVariant: arm,
            ...(touches.first ? { attributionFirst: touches.first } : {}),
            ...(touches.last ? { attributionLast: touches.last } : {}),
          },
        })

    console.log(`[gate-failed] LEAD ${lead.id} reason=${reason} phone=${phone} arm=${arm ?? '-'}${isTest ? ' test=true' : ''}`)

    void logFunnelEvent({
      name: 'gate_failed',
      step: 'otp_failed',
      visitorId,
      variant,
      funnelVariant: arm,
      metadata: { reason },
    })

    await notifyOwnerOfMarketingEvent({
      test: isTest,
      ownerEmailFallback: business.ownerEmail,
      ownerPhoneFallback: business.ownerPhone,
      subject: `GATE FAILED: ${REASON_LABELS[reason]} — call ${firstName || phone}`,
      smsText:
        `GATE FAILED: ${REASON_LABELS[reason]}. Call this one: ` +
        `${firstName || 'no name'} ${phone}${trade ? ` (${trade})` : ''}`,
      html: `
        <h2>Gate failed — call this one</h2>
        <p><strong>Reason:</strong> ${escapeHtml(REASON_LABELS[reason])}</p>
        <p><strong>Name:</strong> ${escapeHtml(firstName || 'not given')}</p>
        <p><strong>Phone:</strong> ${escapeHtml(phone)}</p>
        <p><strong>Email:</strong> ${escapeHtml(email || 'not given')}</p>
        <p><strong>Trade:</strong> ${escapeHtml(trade || 'not given')}</p>
        <p><strong>Funnel arm:</strong> ${escapeHtml(arm ?? 'unassigned')}</p>
        <p><strong>How they got here:</strong> ${escapeHtml(describeJourney(touches, null))}</p>
        <p>They gave all of this and never got a working code. They are expecting a call.</p>
      `,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[gate-failed] unexpected:', err)
    // 200 on purpose: the visitor sees "I'll call you shortly" either way, and
    // a 500 here would turn a rescued lead into a second error message.
    return NextResponse.json({ ok: false }, { status: 200 })
  }
}
