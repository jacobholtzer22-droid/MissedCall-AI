import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    
    const name = formData.get('name') as string
    const business = formData.get('business') as string
    const email = formData.get('email') as string
    const phone = formData.get('phone') as string
    const businessType = formData.get('businessType') as string

    // Send email using Resend (free tier: 100 emails/day)
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'MissedCall AI <onboarding@resend.dev>',
        to: process.env.YOUR_EMAIL,
        subject: `🎯 New Demo Request: ${business}`,
        html: `
          <h2>New Demo Request!</h2>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Business:</strong> ${business}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Phone:</strong> ${phone}</p>
          <p><strong>Industry:</strong> ${businessType}</p>
          <hr />
          <p>Reach out to schedule a Zoom call!</p>
        `,
      }),
    })

    if (!response.ok) {
      console.error('Email send failed:', await response.text())
    }

    // Redirect to thank you page
    return NextResponse.redirect(new URL('/demo-requested', request.url))

  } catch (error) {
    console.error('Demo booking error:', error)
    return NextResponse.redirect(new URL('/demo-requested', request.url))
  }
}