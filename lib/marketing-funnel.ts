// ===========================================
// MARKETING FUNNEL SHARED HELPERS (/book)
// ===========================================
// Shared by /api/marketing-bookings (completed bookings) and
// /api/marketing-bookings/partial (contact captured, no slot picked yet).
//
// Scope note: this is the Align and Acquire marketing funnel only. It does not
// touch client-tenant booking, which goes through lib/create-booking.ts.

import { db } from '@/lib/db'
import { normalizeToE164, phonesMatch } from '@/lib/phone-utils'

/** Resolve the business used for /book bookings. MARKETING_BUSINESS_ID or MARKETING_BUSINESS_SLUG. */
export async function getMarketingBusiness() {
  const id = process.env.MARKETING_BUSINESS_ID
  if (id) {
    const b = await db.business.findUnique({ where: { id } })
    if (b) return b
  }
  const slug = process.env.MARKETING_BUSINESS_SLUG
  if (slug) {
    const b = await db.business.findUnique({ where: { slug } })
    if (b) return b
  }
  return null
}

type OwnerNotifyParams = {
  subject: string
  html: string
  /** Retained so callers need not change. Unused: owner alerts are email only. */
  smsText?: string
  ownerEmailFallback?: string | null
  /** Unused, kept for call-site compatibility. */
  ownerPhoneFallback?: string | null
}

/**
 * Owner email (Resend) + owner SMS (Telnyx) for a marketing funnel event.
 * Never throws: a notification failure must not fail the lead or the booking.
 */
export async function notifyOwnerOfMarketingEvent({
  subject,
  html,
  ownerEmailFallback,
}: OwnerNotifyParams): Promise<void> {
  const ownerEmail = process.env.YOUR_EMAIL || ownerEmailFallback || 'jacob@alignandacquire.com'

  if (!process.env.RESEND_API_KEY) {
    console.error(`[owner-notify] SKIP email template=${subject.slice(0, 40)} reason=RESEND_API_KEY missing`)
  }
  if (!ownerEmail) {
    console.error(`[owner-notify] SKIP email reason=no recipient (YOUR_EMAIL and business.ownerEmail both empty)`)
  }
  if (process.env.RESEND_API_KEY && ownerEmail) {
    try {
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Align and Acquire <onboarding@resend.dev>',
          to: ownerEmail,
          subject,
          html,
        }),
      })
      const payload = (await emailRes.json().catch(() => ({}))) as { id?: string; message?: string }
      if (emailRes.ok) {
        console.log(`[owner-notify] SENT email to=${ownerEmail} template=${subject.slice(0, 48)} providerId=${payload.id ?? 'unknown'}`)
      } else {
        console.error(`[owner-notify] FAILED email to=${ownerEmail} status=${emailRes.status} error=${payload.message ?? 'unknown'}`)
      }
    } catch (err) {
      console.error(`[owner-notify] FAILED email to=${ownerEmail} error=${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Owner notifications are EMAIL ONLY, deliberately.
  //
  // The owner SMS was removed rather than fixed: it required OWNER_PHONE or
  // business.ownerPhone, both of which were empty in production, so it had
  // never actually sent. Email works and is the channel that matters. smsText
  // is still accepted so callers do not all have to change, and is unused.
  //
  // debug, not error: this is the designed state, not a misconfiguration.
  console.debug('[owner-notify] sms intentionally disabled, email is the only owner channel')
}

const PARTIAL_LOOKBACK_DAYS = 60

/**
 * Find an open partial lead for this phone number so a completed booking
 * upgrades the existing row instead of creating a duplicate.
 *
 * Phone match is two-pass: exact E.164 first (that is how this funnel writes
 * them), then a last-10-digit comparison across recent partials to catch rows
 * written in any other format.
 */
export async function findPartialLeadByPhone(businessId: string, phone: string) {
  const e164 = normalizeToE164(phone)

  const exact = await db.websiteLead.findFirst({
    where: { businessId, status: 'partial', phone: e164 },
    orderBy: { createdAt: 'desc' },
  })
  if (exact) return exact

  const since = new Date(Date.now() - PARTIAL_LOOKBACK_DAYS * 24 * 60 * 60 * 1000)
  const recent = await db.websiteLead.findMany({
    where: { businessId, status: 'partial', createdAt: { gte: since } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
  return recent.find((lead) => lead.phone && phonesMatch(lead.phone, phone)) ?? null
}
