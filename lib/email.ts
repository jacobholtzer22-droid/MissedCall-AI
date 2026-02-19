const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.missedcallai.com'
const FROM_EMAIL = 'MissedCall AI <onboarding@resend.dev>'

async function sendEmail(to: string, subject: string, html: string) {
  if (!process.env.RESEND_API_KEY) {
    console.log('⚠️ RESEND_API_KEY not set, skipping email')
    return
  }
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  })
}

// =============================================
// Email: New lead (caller gave their name)
// =============================================
export async function sendLeadCapturedEmail({
  ownerEmail,
  businessName,
  callerName,
  callerPhone,
}: {
  ownerEmail: string
  businessName: string
  callerName: string
  callerPhone: string
}) {
  try {
    await sendEmail(
      ownerEmail,
      `New Lead: ${callerName} texted ${businessName}`,
      `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #1a1a1a; margin-bottom: 4px;">New Lead Identified</h2>
          <p style="color: #555; margin-top: 4px;">Someone gave their information during a text conversation at <strong>${businessName}</strong>.</p>

          <div style="background: #f9f9f9; border-radius: 8px; padding: 16px; margin-top: 20px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; color: #888; font-size: 14px; width: 100px;">Name</td>
                <td style="padding: 8px 0; color: #1a1a1a; font-weight: 600;">${callerName}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #888; font-size: 14px;">Phone</td>
                <td style="padding: 8px 0; color: #1a1a1a; font-weight: 600;">${callerPhone}</td>
              </tr>
            </table>
          </div>

          <a href="${APP_URL}/dashboard/conversations" style="display: inline-block; margin-top: 20px; padding: 10px 20px; background: #4f46e5; color: #fff; text-decoration: none; border-radius: 6px; font-size: 14px;">
            View Conversation
          </a>

          <p style="color: #aaa; font-size: 11px; margin-top: 24px;">Sent by MissedCall AI</p>
        </div>
      `
    )
    console.log('📧 Lead captured email sent to:', ownerEmail)
  } catch (error) {
    console.error('❌ Failed to send lead captured email:', error)
  }
}

// =============================================
// Email: Appointment booked
// =============================================
export async function sendAppointmentBookedEmail({
  ownerEmail,
  businessName,
  customerName,
  customerPhone,
  service,
  datetime,
  notes,
}: {
  ownerEmail: string
  businessName: string
  customerName: string
  customerPhone: string
  service: string
  datetime: string
  notes?: string | null
}) {
  try {
    await sendEmail(
      ownerEmail,
      `New Appointment: ${customerName} - ${service}`,
      `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #1a1a1a; margin-bottom: 4px;">New Appointment Booked</h2>
          <p style="color: #555; margin-top: 4px;">An appointment was just booked via text at <strong>${businessName}</strong>.</p>

          <div style="background: #f9f9f9; border-radius: 8px; padding: 16px; margin-top: 20px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; color: #888; font-size: 14px; width: 100px;">Customer</td>
                <td style="padding: 8px 0; color: #1a1a1a; font-weight: 600;">${customerName}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #888; font-size: 14px;">Phone</td>
                <td style="padding: 8px 0; color: #1a1a1a; font-weight: 600;">${customerPhone}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #888; font-size: 14px;">Service</td>
                <td style="padding: 8px 0; color: #1a1a1a; font-weight: 600;">${service}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #888; font-size: 14px;">When</td>
                <td style="padding: 8px 0; color: #1a1a1a; font-weight: 600;">${datetime}</td>
              </tr>
              ${notes ? `
              <tr>
                <td style="padding: 8px 0; color: #888; font-size: 14px;">Notes</td>
                <td style="padding: 8px 0; color: #1a1a1a;">${notes}</td>
              </tr>
              ` : ''}
            </table>
          </div>

          <a href="${APP_URL}/dashboard/appointments" style="display: inline-block; margin-top: 20px; padding: 10px 20px; background: #4f46e5; color: #fff; text-decoration: none; border-radius: 6px; font-size: 14px;">
            View Appointment
          </a>

          <p style="color: #aaa; font-size: 11px; margin-top: 24px;">Sent by MissedCall AI</p>
        </div>
      `
    )
    console.log('📧 Appointment booked email sent to:', ownerEmail)
  } catch (error) {
    console.error('❌ Failed to send appointment booked email:', error)
  }
}
