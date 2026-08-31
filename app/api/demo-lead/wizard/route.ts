// ===========================================
// GATE WIZARD — bank the lead early, then enrich it
// ===========================================
// Separate from /api/demo-lead ON PURPOSE. That route requires a name and is
// still called by BookingWizard; its contract is untouched here.
//
// This one is built for a one-question-per-screen gate:
//   stage "phone"  -> create/upsert the lead from trade + phone alone, notify
//                     the owner, send the instant SMS, set the gate cookie.
//   stage "update" -> enrich the SAME row as later screens are answered.
//
// Banking at the phone step is the entire point: someone who gives a number and
// then abandons on "last name" is still a callable lead, and the owner hears
// about them within seconds rather than never.

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { validateUsMobile } from '@/lib/phone-utils'
import { findOrCreateContact } from '@/lib/crm-utils'
import {
  getMarketingBusiness,
  notifyOwnerOfMarketingEvent,
  findPartialLeadByPhone,
} from '@/lib/marketing-funnel'
import {
  sanitizeAttribution,
  formatAttributionBlock,
  formatAttributionLine,
} from '@/lib/attribution'
import { rateLimit, getClientIp } from '@/lib/rate-limit'
import { GATE_COOKIE, GATE_COOKIE_MAX_AGE, NOT_AN_OWNER } from '@/app/book/constants'
import { VARIANT_COOKIE, VISITOR_COOKIE } from '@/lib/variant'
import { FUNNEL_VARIANT_COOKIE } from '@/lib/funnel-variant'

export const dynamic = 'force-dynamic'

const LEAD_SOURCE = 'meta_demo_video'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

type Payload = {
  stage?: 'phone' | 'update'
  trade?: string
  phone?: string
  firstName?: string
  lastName?: string
  company?: string
  email?: string
  landingPath?: string
  attribution?: unknown
  website?: string // honeypot
}

/** Everything captured so far, rendered into the lead body. */
function buildMessage(p: {
  trade: string; qualified: boolean; firstName: string; lastName: string
  company: string; email: string; landingPath: string
  variant: string | null; funnelVariant: string | null; attribution: ReturnType<typeof sanitizeAttribution>
}) {
  return [
    p.qualified
      ? 'Gate lead from /book (step wizard).'
      : 'Gate lead from /book. NOT a service business owner.',
    '',
    `Trade: ${p.trade}`,
    `Qualified: ${p.qualified ? 'yes' : 'no'}`,
    p.firstName ? `First name: ${p.firstName}` : null,
    p.lastName ? `Last name: ${p.lastName}` : null,
    p.company ? `Company: ${p.company}` : null,
    p.email ? `Email: ${p.email}` : null,
    `Source: ${LEAD_SOURCE}`,
    `Landing path: ${p.landingPath}`,
    p.variant ? `Variant: ${p.variant}` : null,
    p.funnelVariant ? `Funnel video: ${p.funnelVariant}` : null,
    '',
    formatAttributionBlock(p.attribution),
  ].filter((l) => l !== null).join('\n')
}

export async function POST(request: NextRequest) {
  try {
    const limit = rateLimit(`demo-lead-wizard:${getClientIp(request)}`, 20, 60_000)
    if (!limit.allowed) {
      return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })
    }

    const body = (await request.json()) as Payload
    if (typeof body.website === 'string' && body.website.trim() !== '') {
      // Honeypot. Look identical to success so bots learn nothing.
      return NextResponse.json({ success: true })
    }

    const phoneCheck = validateUsMobile(body.phone)
    if (!phoneCheck.ok) {
      return NextResponse.json({ error: phoneCheck.reason, field: 'phone' }, { status: 400 })
    }

    const trade = body.trade?.trim() ?? ''
    const firstName = body.firstName?.trim() ?? ''
    const lastName = body.lastName?.trim() ?? ''
    const company = body.company?.trim() ?? ''
    const email = body.email?.trim() ?? ''
    const landingPath = body.landingPath?.trim().slice(0, 300) ?? '/book'
    const attribution = sanitizeAttribution(body.attribution)

    // Server decides qualification. Never trust a client boolean.
    const qualified = trade !== NOT_AN_OWNER && trade !== ''

    const variant = request.cookies.get(VARIANT_COOKIE)?.value ?? null
    const funnelVariant = request.cookies.get(FUNNEL_VARIANT_COOKIE)?.value ?? null
    const visitorId = request.cookies.get(VISITOR_COOKIE)?.value ?? ''

    const business = await getMarketingBusiness()
    if (!business) {
      console.error('[demo-lead/wizard] no marketing business configured')
      return NextResponse.json({ error: 'Lead capture unavailable' }, { status: 503 })
    }

    const message = buildMessage({
      trade, qualified, firstName, lastName, company, email,
      landingPath, variant, funnelVariant, attribution,
    })
    // The lead is keyed on phone, so later screens enrich the same row.
    const existing = await findPartialLeadByPhone(business.id, phoneCheck.e164)
    const isNew = !existing
    const displayName = [firstName, lastName].filter(Boolean).join(' ').trim()

    const lead = existing
      ? await db.websiteLead.update({
          where: { id: existing.id },
          data: {
            // Never blank out a name we already banked with a later empty step.
            ...(displayName ? { name: displayName } : {}),
            ...(email ? { email } : {}),
            phone: phoneCheck.e164,
            message,
            variant,
            funnelVariant,
          },
        })
      : await db.websiteLead.create({
          data: {
            businessId: business.id,
            name: displayName || phoneCheck.e164,
            phone: phoneCheck.e164,
            email: email || null,
            message,
            status: 'partial',
            variant,
            funnelVariant,
          },
        })

    // CRM record. Contact carries a real source column.
    await findOrCreateContact({
      businessId: business.id,
      phoneNumber: phoneCheck.e164,
      name: displayName || undefined,
      email: email || undefined,
      source: LEAD_SOURCE,
      notes: `${trade}${qualified ? '' : ' (not an owner)'}`,
    }).catch((err) => console.error('[demo-lead/wizard] findOrCreateContact failed:', err))

    if (visitorId) {
      await db.couponClaim
        .updateMany({ where: { visitorId, leadId: null }, data: { leadId: lead.id } })
        .catch((err) => console.error('[demo-lead/wizard] coupon bind failed:', err))
    }

    // Owner is notified once, the moment the number lands, and only for a real
    // business owner. Later enrichment steps must not re-notify.
    if (isNew && qualified) {
      await notifyOwnerOfMarketingEvent({
        ownerEmailFallback: business.ownerEmail,
        ownerPhoneFallback: business.ownerPhone,
        subject: `Call now: ${displayName || phoneCheck.e164} (${trade})${funnelVariant ? ` [video ${funnelVariant}]` : ''}`,
        html: `
          <h2>New gated demo lead</h2>
          <p>They gave their number at the gate. Call while they are still on the page.</p>
          <p><strong>Name:</strong> ${escapeHtml(displayName || 'not given yet')}</p>
          <p><strong>Mobile:</strong> ${escapeHtml(phoneCheck.e164)}</p>
          <p><strong>Trade:</strong> ${escapeHtml(trade || 'not given')}</p>
          <p><strong>Company:</strong> ${escapeHtml(company || 'not given yet')}</p>
          <p><strong>Email:</strong> ${escapeHtml(email || 'not given yet')}</p>
          <p><strong>Funnel video:</strong> ${escapeHtml(funnelVariant ?? 'unassigned')}</p>
          <pre style="font-family:inherit;white-space:pre-wrap;margin:0">${escapeHtml(formatAttributionBlock(attribution))}</pre>
        `,
        smsText: `Call now. ${displayName || 'Someone'} (${trade || 'trade n/a'}) gave their number on /book.\nMobile: ${phoneCheck.e164}\nVideo: ${funnelVariant ?? 'n/a'}\n${formatAttributionLine(attribution)}`,
      })
    }

    console.log(
      `[demo-lead/wizard] stage=${body.stage ?? 'update'} ${isNew ? 'CREATED' : 'updated'} leadId=${lead.id} ` +
        `qualified=${qualified} video=${funnelVariant ?? 'none'} phone=${phoneCheck.e164}`
    )

    const res = NextResponse.json({ success: true, leadId: lead.id, qualified, isNew })
    res.cookies.set(GATE_COOKIE, lead.id, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: GATE_COOKIE_MAX_AGE,
    })
    return res
  } catch (error) {
    console.error('[demo-lead/wizard] failed:', error)
    return NextResponse.json({ error: 'Could not save that. Please try again.' }, { status: 500 })
  }
}
