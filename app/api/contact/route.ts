import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { findOrCreateContact } from '@/lib/crm-utils'

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, phone, message, smsConsent, businessId, businessSlug, email } = body

    if (!name || !smsConsent) {
      return NextResponse.json(
        { error: 'Name and consent are required' },
        { status: 400, headers: CORS_HEADERS }
      )
    }

    console.log('Contact form submission:', { name, phone, message, smsConsent })

    const bid = typeof businessId === 'string' ? businessId.trim() || null : null
    const slug = typeof businessSlug === 'string' ? businessSlug.trim() || null : null

    // Only notify Jacob for unattributed submissions (marketing page). Client-tenant
    // leads are saved to the DB silently — their own notification flows handle alerts.
    if (!bid && !slug && process.env.RESEND_API_KEY && process.env.YOUR_EMAIL) {
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

    // CRM: link contact for client websites when businessId or businessSlug is provided (background, no effect on response)
    if (bid || slug) {
      void (async () => {
        const business = bid
          ? await db.business.findUnique({ where: { id: bid } })
          : await db.business.findUnique({ where: { slug: slug! } })
        if (business) {
          await findOrCreateContact({
            businessId: business.id,
            phoneNumber: typeof phone === 'string' ? phone.trim() || undefined : undefined,
            email: typeof email === 'string' ? email.trim() || undefined : undefined,
            name: typeof name === 'string' ? name.trim() : undefined,
            source: 'website_form',
            notes: typeof message === 'string' ? message.trim() || undefined : undefined,
          })
        }
      })().catch(() => {})
    }

    // Save as a website lead for dashboard visibility
    if (bid || slug) {
      void (async () => {
        try {
          const business = bid
            ? await db.business.findUnique({ where: { id: bid } })
            : await db.business.findUnique({ where: { slug: slug! } })
          if (business) {
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
          }
        } catch (err) {
          console.error('Failed to save website lead:', err)
        }
      })()
    }

    return NextResponse.json({ success: true }, { headers: CORS_HEADERS })
  } catch (error) {
    console.error('Contact form error:', error)
    return NextResponse.json({ success: false }, { status: 500, headers: CORS_HEADERS })
  }
}
