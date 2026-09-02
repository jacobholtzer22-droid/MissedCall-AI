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
import Telnyx from 'telnyx'

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
  /** Owner SMS body. When omitted, no text is attempted. */
  smsText?: string
  ownerEmailFallback?: string | null
  ownerPhoneFallback?: string | null
  /**
   * Lead is on TEST_PHONE_ALLOWLIST. Alerts still fire — a test walk that
   * produces no alert is indistinguishable from a broken funnel — but both
   * channels are prefixed [TEST] so a real lead is never mistaken for one.
   */
  test?: boolean
}

/**
 * Owner email (Resend) + owner SMS (Telnyx) for a marketing funnel event.
 * Never throws: a notification failure must not fail the lead or the booking.
 */
export async function notifyOwnerOfMarketingEvent({
  subject: rawSubject,
  html,
  smsText,
  ownerEmailFallback,
  ownerPhoneFallback,
  test,
}: OwnerNotifyParams): Promise<void> {
  const ownerEmail = process.env.YOUR_EMAIL || ownerEmailFallback || 'jacob@alignandacquire.com'
  const tag = test ? ' test=true' : ''
  const subject = test ? `[TEST] ${rawSubject}` : rawSubject

  if (!process.env.RESEND_API_KEY) {
    console.error(`[owner-notify] SKIP email template=${subject.slice(0, 40)} reason=RESEND_API_KEY missing${tag}`)
  }
  if (!ownerEmail) {
    console.error(`[owner-notify] SKIP email reason=no recipient (YOUR_EMAIL and business.ownerEmail both empty)${tag}`)
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
          // Verified domain, NOT onboarding@resend.dev. Resend's sandbox
          // sender only delivers to the Resend account owner's own address, so
          // the moment YOUR_EMAIL points at a team inbox the sandbox sender
          // starts 403ing and the owner silently gets nothing.
          from: 'Align and Acquire <notifications@alignandacquire.com>',
          to: ownerEmail,
          subject,
          html,
        }),
      })
      const payload = (await emailRes.json().catch(() => ({}))) as { id?: string; message?: string }
      if (emailRes.ok) {
        console.log(`[owner-notify] SENT email to=${ownerEmail} template=${subject.slice(0, 48)} providerId=${payload.id ?? 'unknown'}${tag}`)
      } else {
        console.error(`[owner-notify] FAILED email to=${ownerEmail} status=${emailRes.status} error=${payload.message ?? 'unknown'}${tag}`)
      }
    } catch (err) {
      console.error(`[owner-notify] FAILED email to=${ownerEmail} error=${err instanceof Error ? err.message : String(err)}${tag}`)
    }
  }

  // ── Owner SMS ─────────────────────────────────────────────────────────────
  // Restored. It was removed earlier because it had no recipient configured
  // (OWNER_PHONE unset, business.ownerPhone null) and so had never once sent —
  // but "email only" turned out to be the wrong call: an email is easy to miss
  // mid-job, which is exactly when a "call now" alert matters.
  //
  // Sent from the SAME number the lead was texted from, so a reply thread lands
  // somewhere Jacob already watches.
  if (!smsText) return

  const from = process.env.MARKETING_TELNYX_NUMBER?.trim() || null
  const to = normalizeToE164(process.env.OWNER_PHONE || ownerPhoneFallback || '')

  if (!process.env.TELNYX_API_KEY || !from) {
    console.error(
      `[owner-notify] SKIP sms reason=no_sender TELNYX_API_KEY=${process.env.TELNYX_API_KEY ? 'set' : 'MISSING'} ` +
        `MARKETING_TELNYX_NUMBER=${from ? 'set' : 'MISSING'}${tag}`
    )
    return
  }
  if (!to) {
    // Loud on purpose: this is the exact silent failure that made the owner SMS
    // look like it worked for months while sending nothing.
    console.error(
      `[owner-notify] SKIP sms reason=no_recipient (OWNER_PHONE unset and business.ownerPhone empty)${tag}`
    )
    return
  }

  try {
    const telnyx = new Telnyx({ apiKey: process.env.TELNYX_API_KEY })
    const res = await telnyx.messages.send({ from, to, text: test ? `[TEST] ${smsText}` : smsText })
    const providerId = (res as { data?: { id?: string } })?.data?.id ?? 'unknown'
    console.log(`[owner-notify] SENT sms to=${to} from=${from} providerId=${providerId}${tag}`)
  } catch (err) {
    // Never throws: the lead is already written and the email already went.
    console.error(
      `[owner-notify] FAILED sms to=${to} error=${err instanceof Error ? err.message : String(err)}${tag}`
    )
  }
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
