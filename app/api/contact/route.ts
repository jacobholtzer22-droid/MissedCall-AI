import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { findOrCreateContact } from '@/lib/crm-utils'
import { notifyOwnerOnWebsiteLead } from '@/lib/notify-owner'
import { getMarketingBusiness } from '@/lib/marketing-funnel'
import { getClientIp } from '@/lib/rate-limit'
import { getVelocityCounts } from '@/lib/spam-velocity'
import {
  scoreSubmission,
  HONEYPOT_FIELD,
  LEGACY_HONEYPOT_FIELD,
  type SpamVerdict,
} from '@/lib/spam-score'

// CORS — open for now so client tenant websites (e.g. bernal-landscaping.vercel.app)
// can POST cross-origin. Lock this down to known origins later.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
} as const

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

async function sendResendEmail(subject: string, html: string, to?: string) {
  const recipient = to || process.env.YOUR_EMAIL
  if (!process.env.RESEND_API_KEY || !recipient) return
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Align and Acquire <onboarding@resend.dev>',
      to: recipient,
      subject,
      html,
    }),
  })
}

// ---------------------------------------------------------------------------
// Dropped-lead alerting
// ---------------------------------------------------------------------------
//
// A submission naming a business we cannot resolve is a real lead we cannot
// store — there is no valid businessId to hang a WebsiteLead row off, so no
// schema change can rescue it. It must not stay silent: a typo'd slug in a client
// site config loses 100% of that site's leads, invisibly.
//
// THROTTLE: one alert per failed slug per hour, with an occurrence count when it
// fires again. This is a module-scope Map, so on Vercel it is PER LAMBDA INSTANCE
// and therefore approximate — several instances can each send their own first
// alert for the same slug. Approximate is the right trade here: the goal is to
// stop a bot hammering a bad slug from burying the signal under hundreds of
// emails, not to guarantee exactly-once delivery.

type DropRecord = { count: number; lastAlertAt: number }
const droppedLeadAlerts = new Map<string, DropRecord>()
const DROP_ALERT_INTERVAL_MS = 60 * 60 * 1000

function shouldAlertForDroppedLead(key: string): { alert: boolean; count: number } {
  const now = Date.now()
  const existing = droppedLeadAlerts.get(key)
  if (!existing) {
    droppedLeadAlerts.set(key, { count: 1, lastAlertAt: now })
    return { alert: true, count: 1 }
  }
  existing.count += 1
  if (now - existing.lastAlertAt >= DROP_ALERT_INTERVAL_MS) {
    existing.lastAlertAt = now
    return { alert: true, count: existing.count }
  }
  return { alert: false, count: existing.count }
}

// ---------------------------------------------------------------------------
// Turnstile
// ---------------------------------------------------------------------------
//
// ⚠️ DO NOT SET `TURNSTILE_ENFORCE=true`. No form on the platform or on any client
// site emits a Turnstile token, and no Turnstile widget script is deployed
// anywhere. `TURNSTILE_SECRET_KEY` and `TURNSTILE_ENFORCE` are both absent from
// Vercel production. Setting `TURNSTILE_ENFORCE=true` today would mark EVERY real
// lead from EVERY client as spam and suppress ALL owner notifications
// platform-wide. It may only be enabled after a Turnstile widget is confirmed live
// on every form that POSTs to /api/contact — including the client-site repos,
// which deploy independently of this one.
//
// The old `enforce && !turnstileToken` auto-condemn branch has been REMOVED for
// exactly that reason: it was a platform-wide kill switch one env var away from
// firing. A missing token is now worth nothing at all, and only an explicit
// siteverify `success:false` contributes score (SPAM_WEIGHTS.TURNSTILE_FAILED),
// which on its own can never condemn a submission.

/** @returns true only on an explicit siteverify success:false. Network failures
 *  and a missing secret both return false — never lose a real lead to an outage. */
async function turnstileExplicitlyFailed(token: unknown): Promise<boolean> {
  if (typeof token !== 'string' || token.trim() === '') return false

  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) {
    console.warn('[Turnstile] TURNSTILE_SECRET_KEY not set — skipping verification')
    return false
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 4000)
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token }),
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!res.ok) {
      console.error('[Turnstile] siteverify returned', res.status, '— failing open')
      return false
    }
    const data = await res.json()
    console.log('[Turnstile] siteverify result:', { success: data.success })
    return data.success === false
  } catch (err) {
    console.error('[Turnstile] siteverify fetch failed (fail open):', err)
    return false
  }
}

// ---------------------------------------------------------------------------

function logVerdict(scope: string, verdict: SpamVerdict, who: Record<string, unknown>) {
  const tag = verdict.isSpam ? '[SPAM]' : '[SPAM-SCORE]'
  console.log(`${tag} ${scope} score=${verdict.score}/${verdict.threshold}`, {
    reasons: verdict.reasons,
    detail: verdict.detail,
    ...who,
  })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, phone, message, smsConsent, businessId, businessSlug, email, turnstileToken } = body

    // smsConsent is recorded, not required. Gating on it silently discarded real
    // leads from external client sites that don't send the field.
    if (!name) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400, headers: CORS_HEADERS }
      )
    }

    const sourceIp = getClientIp(request)
    const userAgent = request.headers.get('user-agent')?.slice(0, 1024) || null

    console.log('Contact form submission:', { name, phone, message, smsConsent, sourceIp })

    const str = (v: unknown): string | null =>
      typeof v === 'string' ? v.trim() || null : null

    // --- Spam scoring ---
    // Every submission is scored, including ones that pass. The score and reasons
    // are stored on the row so false positives can be audited from /admin/spam —
    // a view that only showed condemned rows could never show a real lead that
    // scored 85 and got through, which is the row that matters most.
    const turnstileFailed = await turnstileExplicitlyFailed(turnstileToken)
    const velocity = await getVelocityCounts(str(email), sourceIp)
    const verdict = scoreSubmission(
      {
        name: String(name),
        phone: str(phone),
        email: str(email),
        message: str(message),
        // Both honeypot names accepted: hp_7d3a_ref is the current field, and
        // `website` is what /api/demo-lead already uses.
        honeypot:
          typeof body[HONEYPOT_FIELD] === 'string' && body[HONEYPOT_FIELD].trim() !== ''
            ? body[HONEYPOT_FIELD]
            : body[LEGACY_HONEYPOT_FIELD],
        turnstileFailed,
      },
      velocity
    )

    const bid = str(businessId)
    const slug = str(businessSlug)

    const leadFields = {
      name: typeof name === 'string' ? name.trim() : 'Unknown',
      phone: str(phone),
      email: str(email),
      message: str(message),
      spamScore: verdict.score,
      spamReasons: verdict.reasons,
      sourceIp,
      userAgent,
    }

    // ------------------------------------------------------------------
    // Marketing path (no businessId/businessSlug).
    // ------------------------------------------------------------------
    if (!bid && !slug) {
      logVerdict('marketing', verdict, { name, phone, email })

      // Persist against the marketing business so /admin/spam covers this path
      // too. /api/demo-lead already writes WebsiteLead rows here, so this is the
      // established home for marketing-funnel rows rather than a new concept.
      const marketingBusiness = await getMarketingBusiness()
      if (marketingBusiness) {
        await db.websiteLead.create({
          data: {
            businessId: marketingBusiness.id,
            ...leadFields,
            status: verdict.isSpam ? 'spam' : 'new',
          },
        })
      } else {
        // No MARKETING_BUSINESS_ID/SLUG configured: there is no valid FK to write
        // against, so log the whole payload loudly rather than adding a table.
        console.error(
          '[/api/contact] marketing submission NOT persisted — no marketing business configured ' +
            '(set MARKETING_BUSINESS_ID or MARKETING_BUSINESS_SLUG)',
          { lead: { name, phone, email, message }, score: verdict.score, reasons: verdict.reasons }
        )
      }

      if (verdict.isSpam) {
        // Identical 200 so bots learn nothing from the response.
        return NextResponse.json({ success: true }, { headers: CORS_HEADERS })
      }

      await sendResendEmail(
        `New Contact Form: ${escapeHtml(String(name))}`,
        `
          <h2>New Contact Form Submission</h2>
          <p><strong>Name:</strong> ${escapeHtml(String(name))}</p>
          <p><strong>Phone:</strong> ${escapeHtml(phone || 'Not provided')}</p>
          <p><strong>Email:</strong> ${escapeHtml(email || 'Not provided')}</p>
          <p><strong>Message:</strong> ${escapeHtml(message || 'No message')}</p>
          <p><strong>SMS Consent:</strong> ${smsConsent ? 'Yes' : 'No'}</p>
        `
      )

      return NextResponse.json({ success: true }, { headers: CORS_HEADERS })
    }

    // ------------------------------------------------------------------
    // Tenant path (businessId or businessSlug provided).
    // ------------------------------------------------------------------
    // CRM + dashboard persistence. These MUST be awaited before returning: on
    // Vercel the function freezes after the response, so unawaited background
    // work is intermittently dropped. Run sequentially to avoid exhausting the
    // Prisma connection pool.
    const business = bid
      ? await db.business.findUnique({ where: { id: bid } })
      : await db.business.findUnique({ where: { slug: slug! } })

    if (!business) {
      const key = bid ? `id:${bid}` : `slug:${slug}`
      const { alert, count } = shouldAlertForDroppedLead(key)

      console.error('[/api/contact] LEAD DROPPED — no business matched', {
        businessId: bid,
        businessSlug: slug,
        occurrencesSinceFirstSeen: count,
        lead: { name, phone, email, message },
        sourceIp,
      })

      if (alert) {
        try {
          await sendResendEmail(
            `[ALERT] Lead dropped — no business for ${bid ? `id "${bid}"` : `slug "${slug}"`}`,
            `
              <h2>A website lead could not be saved</h2>
              <p>A contact form submitted a business reference that does not resolve to any
              business, so there was no valid record to attach the lead to. The full payload
              is below — this is the only copy.</p>
              <p><strong>Failed reference:</strong> ${escapeHtml(key)}</p>
              <p><strong>Occurrences since first seen:</strong> ${count}</p>
              <hr />
              <p><strong>Name:</strong> ${escapeHtml(String(name))}</p>
              <p><strong>Phone:</strong> ${escapeHtml(phone || 'Not provided')}</p>
              <p><strong>Email:</strong> ${escapeHtml(email || 'Not provided')}</p>
              <p><strong>Message:</strong> ${escapeHtml(message || 'No message')}</p>
              <hr />
              <p><strong>Spam score:</strong> ${verdict.score}/${verdict.threshold}
                 (${escapeHtml(verdict.reasons.join(', ') || 'no signals')})</p>
              <p><strong>Source IP:</strong> ${escapeHtml(sourceIp)}</p>
              <p><strong>User agent:</strong> ${escapeHtml(userAgent || 'unknown')}</p>
              <p><strong>Time:</strong> ${new Date().toISOString()}</p>
              <p style="color:#666">Further alerts for this same reference are throttled to one
              per hour per server instance.</p>
            `
          )
        } catch (err) {
          // The 404 still has to go back to the caller even if Resend is down.
          console.error('[/api/contact] dropped-lead alert failed to send:', err)
        }
      }

      return NextResponse.json(
        {
          success: false,
          error: `No business found for ${bid ? `businessId "${bid}"` : `businessSlug "${slug}"`}`,
        },
        { status: 404, headers: CORS_HEADERS }
      )
    }

    logVerdict(`tenant ${business.slug}`, verdict, { name, phone, email })

    if (verdict.isSpam) {
      // Record the lead for admin visibility but skip Contact creation and owner
      // notifications. The row is ALWAYS written — a high score suppresses the
      // notification, it never discards the record. Identical 200 response so
      // bots learn nothing.
      await db.websiteLead.create({
        data: { businessId: business.id, ...leadFields, status: 'spam' },
      })
      return NextResponse.json({ success: true }, { headers: CORS_HEADERS })
    }

    // Contact (CRM)
    await findOrCreateContact({
      businessId: business.id,
      phoneNumber: str(phone) ?? undefined,
      email: str(email) ?? undefined,
      name: typeof name === 'string' ? name.trim() : undefined,
      source: 'website_form',
      notes: str(message) ?? undefined,
    })

    // WebsiteLead (dashboard visibility)
    await db.websiteLead.create({
      data: { businessId: business.id, ...leadFields, status: 'new' },
    })

    // Notify the business owner. The lead is already saved above, so a notify
    // failure must NOT fail the request — log it and continue.
    try {
      const result = await notifyOwnerOnWebsiteLead(business, {
        name: typeof name === 'string' ? name.trim() : 'Unknown',
        phone: str(phone),
        email: str(email),
        message: str(message),
        smsConsent: Boolean(smsConsent),
      })
      console.log('Website lead owner notification result:', {
        businessId: business.id,
        smsSent: result.smsSent,
        emailSent: result.emailSent,
      })
    } catch (err) {
      console.error('Failed to notify owner of website lead:', err)
    }

    return NextResponse.json({ success: true }, { headers: CORS_HEADERS })
  } catch (error) {
    console.error('Contact form error:', error)
    return NextResponse.json({ success: false }, { status: 500, headers: CORS_HEADERS })
  }
}
