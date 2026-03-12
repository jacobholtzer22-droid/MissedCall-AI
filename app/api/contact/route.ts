import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { findOrCreateContact } from '@/lib/crm-utils'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, phone, message, smsConsent, businessId, businessSlug, email } = body

    if (!name || !smsConsent) {
      return NextResponse.json(
        { error: 'Name and consent are required' },
        { status: 400 }
      )
    }

    console.log('Contact form submission:', { name, phone, message, smsConsent })

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
          subject: `New Contact Form: ${name}`,
          html: `
            <h2>New Contact Form Submission</h2>
            <p><strong>Name:</strong> ${name}</p>
            <p><strong>Phone:</strong> ${phone || 'Not provided'}</p>
            <p><strong>Message:</strong> ${message || 'No message'}</p>
            <p><strong>SMS Consent:</strong> ${smsConsent ? 'Yes' : 'No'}</p>
          `,
        }),
      })
    }

    // CRM: link contact for client websites when businessId or businessSlug is provided (background, no effect on response)
    const bid = typeof businessId === 'string' ? businessId.trim() || null : null
    const slug = typeof businessSlug === 'string' ? businessSlug.trim() || null : null
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

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Contact form error:', error)
    return NextResponse.json({ success: false }, { status: 500 })
  }
}
