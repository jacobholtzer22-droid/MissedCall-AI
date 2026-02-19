import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    const { name, business, email, phone, businessType } = body

    console.log('Demo request:', { name, business, email, phone, businessType })

    if (process.env.RESEND_API_KEY && process.env.YOUR_EMAIL) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'MissedCall AI <notifications@alignandacquire.com>',
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
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Demo booking error:', error)
    return NextResponse.json({ success: false }, { status: 500 })
  }
}