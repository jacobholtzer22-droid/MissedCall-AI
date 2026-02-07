import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    
    const name = formData.get('name') as string
    const business = formData.get('business') as string
    const email = formData.get('email') as string
    const phone = formData.get('phone') as string
    const businessType = formData.get('businessType') as string

    // Log the submission (you can see this in Vercel logs)
    console.log('Demo request:', { name, business, email, phone, businessType })

    // Try to send email via Resend
    if (process.env.RESEND_API_KEY && process.env.YOUR_EMAIL) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'MissedCall AI <onboarding@resend.dev>',
            to: process.env.YOUR_EMAIL,
            subject: `New Demo Request: ${business}`,
            html: `
              <h2>New Demo Request!</h2>
              <p><strong>Name:</strong> ${name}</p>
              <p><strong>Business:</strong> ${business}</p>
              <p><strong>Email:</strong> ${email}</p>
              <p><strong>Phone:</strong> ${phone}</p>
              <p><strong>Industry:</strong> ${businessType}</p>
            `,
          }),
        })
      } catch (emailError) {
        console.error('Email failed:', emailError)
      }
    }

    // Redirect to thank you page
    return NextResponse.redirect(new URL('/demo-requested', request.url))

  } catch (error) {
    console.error('Demo booking error:', error)
    // Still redirect even if there's an error
    return NextResponse.redirect(new URL('/demo-requested', request.url))
  }
}