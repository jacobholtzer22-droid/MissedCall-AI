// ===========================================
// MARKETING FUNNEL: PARTIAL LEAD CAPTURE
// ===========================================
// POSTed by /book the moment the contact step is submitted, before the calendar
// renders. Anyone who gives us a mobile and then leaves is captured here and is
// callable straight away. Stored as a WebsiteLead with status 'partial' so it
// lands in the existing Leads dashboard with no schema change.
//
// If the visitor goes on to pick a slot, /api/marketing-bookings upgrades this
// same row to 'converted' rather than writing a second one.

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { normalizeToE164 } from '@/lib/phone-utils'
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

type PartialPayload = {
  firstName?: string
  phone?: string
  email?: string
  businessName?: string
  smsConsent?: boolean
  tradeType?: string
  missedCalls?: string
  whoAnswers?: string
  interests?: string[]
  attribution?: unknown
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as PartialPayload

    const firstName = body.firstName?.trim() ?? ''
    const phone = body.phone?.trim() ?? ''
    const email = body.email?.trim() ?? ''
    const businessName = body.businessName?.trim() ?? ''
    const tradeType = body.tradeType?.trim() ?? ''
    const missedCalls = body.missedCalls?.trim() ?? ''
    const whoAnswers = body.whoAnswers?.trim() ?? ''
    const interests = Array.isArray(body.interests)
      ? body.interests.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
      : []
    const attribution = sanitizeAttribution(body.attribution)

    if (!firstName || !phone || !email || !businessName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    if (!body.smsConsent) {
      return NextResponse.json({ error: 'SMS consent is required' }, { status: 400 })
    }

    const business = await getMarketingBusiness()
    if (!business) {
      console.error('[marketing-partial] no marketing business configured')
      return NextResponse.json({ error: 'Lead capture unavailable' }, { status: 503 })
    }

    const e164 = normalizeToE164(phone)

    const message = [
      'Partial lead from /book. Contact captured, no time slot picked yet.',
      '',
      `Business: ${businessName}`,
      tradeType ? `Business type: ${tradeType}` : null,
      missedCalls ? `Missed calls per week: ${missedCalls}` : null,
      whoAnswers ? `Who answers now: ${whoAnswers}` : null,
      interests.length ? `Interested in: ${interests.join(', ')}` : null,
      '',
      formatAttributionBlock(attribution),
    ]
      .filter((line) => line !== null)
      .join('\n')

    // Re-submitting the contact step (back button, refresh) updates the open
    // partial instead of stacking duplicates on the call list.
    const existing = await findPartialLeadByPhone(business.id, phone)

    const lead = existing
      ? await db.websiteLead.update({
          where: { id: existing.id },
          data: { name: firstName, phone: e164, email, message },
        })
      : await db.websiteLead.create({
          data: {
            businessId: business.id,
            name: firstName,
            phone: e164,
            email,
            message,
            status: 'partial',
          },
        })

    // Only notify on a genuinely new partial. A re-submit is not a new lead.
    if (!existing) {
      await notifyOwnerOfMarketingEvent({
        ownerEmailFallback: business.ownerEmail,
        ownerPhoneFallback: business.ownerPhone,
        subject: `Partial lead (call now): ${firstName} at ${businessName}`,
        html: `
          <h2>Partial lead from /book</h2>
          <p>They gave contact details but have not picked a time yet. Best call target.</p>
          <p><strong>Name:</strong> ${escapeHtml(firstName)}</p>
          <p><strong>Mobile:</strong> ${escapeHtml(phone)}</p>
          <p><strong>Email:</strong> ${escapeHtml(email)}</p>
          <p><strong>Business:</strong> ${escapeHtml(businessName)}</p>
          <p><strong>Business type:</strong> ${escapeHtml(tradeType || 'Not specified')}</p>
          <p><strong>Missed calls per week:</strong> ${escapeHtml(missedCalls || 'Not specified')}</p>
          <p><strong>Who answers now:</strong> ${escapeHtml(whoAnswers || 'Not specified')}</p>
          <p><strong>Interested in:</strong> ${escapeHtml(interests.length ? interests.join(', ') : 'Not specified')}</p>
          <pre style="font-family:inherit;white-space:pre-wrap;margin:0">${escapeHtml(formatAttributionBlock(attribution))}</pre>
        `,
        smsText: `New partial lead (no time picked yet).\nName: ${firstName}\nMobile: ${phone}\nBusiness: ${businessName}\nMisses/wk: ${missedCalls || 'n/a'}\n${formatAttributionLine(attribution)}`,
      })
    }

    return NextResponse.json({ success: true, leadId: lead.id })
  } catch (error) {
    console.error('[marketing-partial] failed:', error)
    return NextResponse.json({ error: 'Failed to save lead' }, { status: 500 })
  }
}
