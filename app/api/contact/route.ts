import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { findOrCreateContact } from '@/lib/crm-utils'
import { notifyOwnerOnWebsiteLead } from '@/lib/notify-owner'

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

async function verifyTurnstile(token: string): Promise<{ pass: boolean; error?: boolean }> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) {
    console.warn('[Turnstile] TURNSTILE_SECRET_KEY not set — skipping verification')
    return { pass: true }
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
      console.error('[Turnstile] siteverify returned', res.status)
      return { pass: true, error: true }
    }

    const data = await res.json()
    console.log('[Turnstile] siteverify result:', { success: data.success })
    return { pass: !!data.success }
  } catch (err) {
    console.error('[Turnstile] siteverify fetch failed (fail open):', err)
    return { pass: true, error: true }
  }
}

function detectSpam(body: Record<string, unknown>): { isSpam: boolean; reason?: string } {
  const { website, turnstileToken } = body
  const enforce = process.env.TURNSTILE_ENFORCE === 'true'

  if (typeof website === 'string' && website.trim() !== '') {
    return { isSpam: true, reason: 'honeypot' }
  }

  if (enforce && !turnstileToken) {
    return { isSpam: true, reason: 'missing_turnstile_token' }
  }

  return { isSpam: false }
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

    console.log('Contact form submission:', { name, phone, message, smsConsent })

    // --- Spam detection ---
    const spamCheck = detectSpam(body)
    let isSpam = spamCheck.isSpam

    if (!isSpam && typeof turnstileToken === 'string') {
      const turnstile = await verifyTurnstile(turnstileToken)
      if (!turnstile.pass) {
        if (process.env.TURNSTILE_ENFORCE === 'true') {
          isSpam = true
          console.log('[SPAM] Turnstile verification failed (enforcing)', { name, phone, email })
        } else {
          console.log('[SPAM-WARN] Turnstile verification failed (not enforcing)', { name, phone, email })
        }
      }
    }

    if (isSpam && spamCheck.reason) {
      console.log(`[SPAM] Detected via ${spamCheck.reason}:`, { name, phone, email, message })
    }

    const bid = typeof businessId === 'string' ? businessId.trim() || null : null
    const slug = typeof businessSlug === 'string' ? businessSlug.trim() || null : null

    // Marketing path (no businessId/businessSlug): on spam, skip email + log the payload.
    if (!bid && !slug) {
      if (isSpam) {
        console.log('[SPAM] Marketing form blocked:', { name, phone, email, message, reason: spamCheck.reason })
        return NextResponse.json({ success: true }, { headers: CORS_HEADERS })
      }

      if (process.env.RESEND_API_KEY && process.env.YOUR_EMAIL) {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'Align and Acquire <onboarding@resend.dev>',
            to: process.env.YOUR_EMAIL,
            subject: `New Contact Form: ${escapeHtml(name)}`,
            html: `
              <h2>New Contact Form Submission</h2>
              <p><strong>Name:</strong> ${escapeHtml(name)}</p>
              <p><strong>Phone:</strong> ${escapeHtml(phone || 'Not provided')}</p>
              <p><strong>Email:</strong> ${escapeHtml(email || 'Not provided')}</p>
              <p><strong>Message:</strong> ${escapeHtml(message || 'No message')}</p>
              <p><strong>SMS Consent:</strong> ${smsConsent ? 'Yes' : 'No'}</p>
            `,
          }),
        })
      }

      return NextResponse.json({ success: true }, { headers: CORS_HEADERS })
    }

    // --- Tenant path (businessId or businessSlug provided) ---
    // CRM + dashboard persistence. These MUST be awaited before returning: on
    // Vercel the function freezes after the response, so unawaited background
    // work is intermittently dropped. Run sequentially to avoid exhausting the
    // Prisma connection pool.
    const business = bid
      ? await db.business.findUnique({ where: { id: bid } })
      : await db.business.findUnique({ where: { slug: slug! } })

    if (!business) {
      console.error('[/api/contact] LEAD DROPPED — no business matched', {
        businessId: bid,
        businessSlug: slug,
        lead: { name, phone, email, message },
      })
      return NextResponse.json(
        {
          success: false,
          error: `No business found for ${bid ? `businessId "${bid}"` : `businessSlug "${slug}"`}`,
        },
        { status: 404, headers: CORS_HEADERS }
      )
    }

    if (isSpam) {
      // Record the lead for admin visibility but skip Contact creation and
      // owner notifications. Identical 200 response so bots learn nothing.
      await db.websiteLead.create({
        data: {
          businessId: business.id,
          name: typeof name === 'string' ? name.trim() : 'Unknown',
          phone: typeof phone === 'string' ? phone.trim() || null : null,
          email: typeof email === 'string' ? email.trim() || null : null,
          message: typeof message === 'string' ? message.trim() || null : null,
          status: 'spam',
        },
      })
      return NextResponse.json({ success: true }, { headers: CORS_HEADERS })
    }

    // Contact (CRM)
    await findOrCreateContact({
      businessId: business.id,
      phoneNumber: typeof phone === 'string' ? phone.trim() || undefined : undefined,
      email: typeof email === 'string' ? email.trim() || undefined : undefined,
      name: typeof name === 'string' ? name.trim() : undefined,
      source: 'website_form',
      notes: typeof message === 'string' ? message.trim() || undefined : undefined,
    })

    // WebsiteLead (dashboard visibility)
    await db.websiteLead.create({
      data: {
        businessId: business.id,
        name: typeof name === 'string' ? name.trim() : 'Unknown',
        phone: typeof phone === 'string' ? phone.trim() || null : null,
        email: typeof email === 'string' ? email.trim() || null : null,
        message: typeof message === 'string' ? message.trim() || null : null,
        status: 'new',
      },
    })

    // Notify the business owner. The lead is already saved above, so a notify
    // failure must NOT fail the request — log it and continue.
    try {
      const result = await notifyOwnerOnWebsiteLead(business, {
        name: typeof name === 'string' ? name.trim() : 'Unknown',
        phone: typeof phone === 'string' ? phone.trim() || null : null,
        email: typeof email === 'string' ? email.trim() || null : null,
        message: typeof message === 'string' ? message.trim() || null : null,
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
