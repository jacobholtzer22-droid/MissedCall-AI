import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getMarketingBusiness } from '@/lib/marketing-funnel'
import { raisePlatformAlert, buildBookDemoFailedAlert, bookDemoFailureStage } from '@/lib/platform-alert'

// Form values arrive as unknown JSON. Anything that is not a non-empty string is null.
const str = (v: unknown, max = 500): string | null =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const { name, business, email, phone, businessType } = body

    console.log('Demo request:', { name, business, email, phone, businessType })

    // 1. Save the request as a lead under the marketing business, the same home the
    //    marketing contact form uses. Before this, the email below was the only copy.
    //    A row here has no otpVerifiedAt, so the funnel's follow-up cron never texts it.
    let leadId: string | null = null
    let persistError: unknown = null
    try {
      const marketingBusiness = await getMarketingBusiness()
      if (!marketingBusiness) {
        throw new Error('no marketing business configured (MARKETING_BUSINESS_ID or MARKETING_BUSINESS_SLUG)')
      }
      const industry = str(businessType, 120)
      const note = str(body.message, 2000)
      const lead = await db.websiteLead.create({
        data: {
          businessId: marketingBusiness.id,
          name: str(name, 200) ?? 'Unknown',
          phone: str(phone, 40),
          email: str(email, 200),
          businessName: str(business, 200),
          message: [`Demo request (website form).${industry ? ` Industry: ${industry}.` : ''}`, note].filter(Boolean).join('\n\n'),
          status: 'new',
        },
        select: { id: true },
      })
      leadId = lead.id
    } catch (err) {
      persistError = err
      console.error('Demo request NOT saved as a lead:', err)
    }

    // 2. Email it. fetch() does not throw on a 4xx/5xx, so the status is read.
    let emailError: unknown = null
    if (process.env.RESEND_API_KEY && process.env.YOUR_EMAIL) {
      try {
        const emailRes = await fetch('https://api.resend.com/emails', {
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
        if (!emailRes.ok) throw new Error(`Resend status=${emailRes.status}`)
      } catch (err) {
        emailError = err
        console.error('Demo request email FAILED:', err)
      }
    } else {
      emailError = new Error(
        `email not attempted: RESEND_API_KEY=${process.env.RESEND_API_KEY ? 'set' : 'MISSING'} YOUR_EMAIL=${process.env.YOUR_EMAIL ? 'set' : 'MISSING'}`
      )
      console.error('Demo request email SKIPPED:', emailError)
    }

    const stage = bookDemoFailureStage({ emailOk: !emailError, persistOk: !persistError })
    if (stage) {
      raisePlatformAlert(buildBookDemoFailedAlert({ stage, error: stage === 'persist' ? persistError : emailError, leadId }))
    }

    // Still 200 even when both failed: DemoForm and WebsiteQuoteForm never read this
    // response and have no error state to show, so a non-200 would change nothing for
    // the visitor. The platform alert is what surfaces a lost request.
    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Demo booking error:', error)
    return NextResponse.json({ success: false }, { status: 500 })
  }
}
