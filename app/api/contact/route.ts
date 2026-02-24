import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, phone, message, smsConsent } = body

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
          from: 'Align & Acquire <onboarding@resend.dev>',
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

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Contact form error:', error)
    return NextResponse.json({ success: false }, { status: 500 })
  }
}
