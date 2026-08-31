// ===========================================
// /book GATE: LEAD CAPTURE
// ===========================================
// POSTed when the gate modal is completed, before the video plays. This is the
// highest value moment in the funnel: someone gave us a real mobile number and
// is about to watch. Qualified leads notify the owner immediately.
//
// Writes follow the /api/contact precedent: a Contact (which has a real source
// column) plus a WebsiteLead row so it surfaces in the Leads dashboard. No
// schema change.

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
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

type Payload = {
  name?: string
  phone?: string
  trade?: string
  qualified?: boolean
  watchedSeconds?: number
  landingPath?: string
  attribution?: unknown
  website?: string // honeypot
}

export async function POST(request: NextRequest) {
  try {
    const limit = rateLimit(`demo-lead:${getClientIp(request)}`, 8, 60_000)
    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Give it a moment and try again.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
      )
    }

    const body = (await request.json()) as Payload

    // Honeypot. Bots fill every field they find; humans never see this one.
    if (typeof body.website === 'string' && body.website.trim() !== '') {
      console.log('[demo-lead] honeypot tripped, dropping silently')
      // Look identical to success so bots learn nothing.
      return NextResponse.json({ success: true })
    }

    const name = body.name?.trim() ?? ''
    const trade = body.trade?.trim() ?? ''
    const landingPath = body.landingPath?.trim().slice(0, 300) ?? '/book'
    const watchedSeconds =
      typeof body.watchedSeconds === 'number' && isFinite(body.watchedSeconds)
        ? Math.max(0, Math.round(body.watchedSeconds))
        : 0
    const attribution = sanitizeAttribution(body.attribution)
    const variant = request.cookies.get(VARIANT_COOKIE)?.value ?? null
    const funnelVariant = request.cookies.get(FUNNEL_VARIANT_COOKIE)?.value ?? null
    const visitorId = request.cookies.get(VISITOR_COOKIE)?.value ?? ''

    if (!name || !trade) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const phoneCheck = validateUsMobile(body.phone)
    if (!phoneCheck.ok) {
      return NextResponse.json({ error: phoneCheck.reason, field: 'phone' }, { status: 400 })
    }

    // Server decides qualification. Never trust the client's boolean.
    const qualified = trade !== NOT_AN_OWNER

    const business = await getMarketingBusiness()
    if (!business) {
      console.error('[demo-lead] no marketing business configured')
      return NextResponse.json({ error: 'Lead capture unavailable' }, { status: 503 })
    }

    const message = [
      qualified
        ? 'Gate lead from /book. Watched-video gate completed.'
        : 'Gate lead from /book. NOT a service business owner.',
      '',
      `Trade: ${trade}`,
      `Qualified: ${qualified ? 'yes' : 'no'}`,
      `Source: ${LEAD_SOURCE}`,
      `Landing path: ${landingPath}`,
      variant ? `Variant: ${variant}` : null,
      watchedSeconds > 0 ? `Watched before gate: ${watchedSeconds}s` : null,
      '',
      formatAttributionBlock(attribution),
    ]
      .filter((line) => line !== null)
      .join('\n')

    // CRM record. Contact carries a real source column.
    await findOrCreateContact({
      businessId: business.id,
      phoneNumber: phoneCheck.e164,
      name,
      source: LEAD_SOURCE,
      notes: `${trade}${qualified ? '' : ' (not an owner)'}`,
    }).catch((err) => {
      // Contact bookkeeping must never cost us the lead.
      console.error('[demo-lead] findOrCreateContact failed:', err)
    })

    // Dashboard-visible lead row. Re-submitting updates rather than duplicating.
    const existing = await findPartialLeadByPhone(business.id, phoneCheck.e164)
    const lead = existing
      ? await db.websiteLead.update({
          where: { id: existing.id },
          data: { name, phone: phoneCheck.e164, message, variant, funnelVariant },
        })
      : await db.websiteLead.create({
          data: {
            businessId: business.id,
            name,
            phone: phoneCheck.e164,
            message,
            status: 'partial',
            variant,
            funnelVariant,
          },
        })

    if (visitorId) {
      await db.couponClaim
        .updateMany({ where: { visitorId, leadId: null }, data: { leadId: lead.id } })
        .catch((err) => console.error('[demo-lead] coupon bind failed:', err))
    }

    // Only qualified leads are worth interrupting the owner for. In `nogate`
    // this fires mid-wizard, which is the point: someone who gave a number and
    // then abandoned is still callable.
    if (qualified && !existing) {
      await notifyOwnerOfMarketingEvent({
        ownerEmailFallback: business.ownerEmail,
        ownerPhoneFallback: business.ownerPhone,
        subject: `Call now: ${name} (${trade})${variant ? ` [${variant}]` : ''}`,
        html: `
          <h2>New gated demo lead</h2>
          <p>They gave their number and started the video. Call while they are still watching.</p>
          <p><strong>Name:</strong> ${escapeHtml(name)}</p>
          <p><strong>Mobile:</strong> ${escapeHtml(phoneCheck.e164)}</p>
          <p><strong>Trade:</strong> ${escapeHtml(trade)}</p>
          <p><strong>Landing path:</strong> ${escapeHtml(landingPath)}</p>
          <p><strong>Variant:</strong> ${escapeHtml(variant ?? 'unassigned')}</p>
          <pre style="font-family:inherit;white-space:pre-wrap;margin:0">${escapeHtml(formatAttributionBlock(attribution))}</pre>
        `,
        smsText: `Call now. ${name} (${trade}) gave their number on /book.\nMobile: ${phoneCheck.e164}\nVariant: ${variant ?? 'n/a'}\n${formatAttributionLine(attribution)}`,
      })
    }

    console.log(
      `[demo-lead] ${qualified ? 'QUALIFIED' : 'unqualified'} leadId=${lead.id} variant=${variant ?? 'none'} trade=${JSON.stringify(trade)} phone=${phoneCheck.e164}`
    )

    const res = NextResponse.json({ success: true, leadId: lead.id, qualified })
    // httpOnly on purpose: the page reads gate state server-side, so the cookie
    // never needs to be readable by client JS.
    res.cookies.set(GATE_COOKIE, lead.id, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: GATE_COOKIE_MAX_AGE,
    })
    return res
  } catch (error) {
    console.error('[demo-lead] failed:', error)
    return NextResponse.json({ error: 'Could not save that. Please try again.' }, { status: 500 })
  }
}
