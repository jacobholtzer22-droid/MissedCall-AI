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

type MessagePreview = {
  direction: string
  content: string
}

function formatDateTime(date: Date): string {
  return date.toLocaleString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

function buildConversationHtml(messages: MessagePreview[]): string {
  return messages.map((m) => {
    const isInbound = m.direction === 'inbound'
    const label = isInbound ? 'Caller' : 'AI'
    const bg = isInbound ? '#e8f4fd' : '#f0f0f0'
    const align = isInbound ? 'left' : 'right'
    const labelColor = isInbound ? '#2563eb' : '#6b7280'
    return `
      <div style="margin-bottom: 10px; text-align: ${align};">
        <div style="display: inline-block; max-width: 80%; background: ${bg}; border-radius: 10px; padding: 8px 12px; text-align: left;">
          <div style="font-size: 10px; color: ${labelColor}; font-weight: 600; margin-bottom: 2px;">${label}</div>
          <div style="font-size: 13px; color: #1a1a1a; line-height: 1.4;">${m.content}</div>
        </div>
      </div>`
  }).join('')
}

// =============================================
// Email: New Lead! (caller gave name + contact info)
// =============================================
export async function sendLeadCapturedEmail({
  ownerEmail,
  businessName,
  callerName,
  callerPhone,
  callerEmail,
  missedCallAt,
  messages,
  serviceRequested,
}: {
  ownerEmail: string
  businessName: string
  callerName: string
  callerPhone: string
  callerEmail?: string | null
  missedCallAt: Date
  messages: MessagePreview[]
  serviceRequested?: string | null
}) {
  try {
    const about = serviceRequested || 'General inquiry'
    const conversationHtml = buildConversationHtml(messages)

    await sendEmail(
      ownerEmail,
      `New Lead! ${callerName} — ${businessName}`,
      `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1a1a1a;">

          <div style="margin-bottom: 24px;">
            <h2 style="margin: 0 0 4px 0; font-size: 20px;">New Lead!</h2>
            <p style="margin: 0; color: #6b7280; font-size: 14px;">A qualified lead came in via text at <strong>${businessName}</strong>.</p>
          </div>

          <div style="background: #f9fafb; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 6px 0; color: #6b7280; font-size: 13px; width: 120px;">Name</td>
                <td style="padding: 6px 0; font-weight: 600; font-size: 14px;">${callerName}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #6b7280; font-size: 13px;">Phone</td>
                <td style="padding: 6px 0; font-weight: 600; font-size: 14px;">${callerPhone}</td>
              </tr>
              ${callerEmail ? `
              <tr>
                <td style="padding: 6px 0; color: #6b7280; font-size: 13px;">Email</td>
                <td style="padding: 6px 0; font-weight: 600; font-size: 14px;">${callerEmail}</td>
              </tr>` : ''}
              <tr>
                <td style="padding: 6px 0; color: #6b7280; font-size: 13px;">Missed call</td>
                <td style="padding: 6px 0; font-size: 14px;">${formatDateTime(missedCallAt)}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #6b7280; font-size: 13px;">About</td>
                <td style="padding: 6px 0; font-size: 14px;">${about}</td>
              </tr>
            </table>
          </div>

          <div style="margin-bottom: 20px;">
            <div style="font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 10px;">Conversation Preview</div>
            <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px; background: #fff;">
              ${conversationHtml}
            </div>
          </div>

          <a href="${APP_URL}/dashboard/conversations" style="display: inline-block; padding: 10px 20px; background: #4f46e5; color: #fff; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 500;">
            View Full Conversation
          </a>

          <p style="color: #d1d5db; font-size: 11px; margin-top: 24px; margin-bottom: 0;">Sent by MissedCall AI</p>
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
  missedCallAt,
  messages,
}: {
  ownerEmail: string
  businessName: string
  customerName: string
  customerPhone: string
  service: string
  datetime: string
  notes?: string | null
  missedCallAt: Date
  messages: MessagePreview[]
}) {
  try {
    const conversationHtml = buildConversationHtml(messages)

    await sendEmail(
      ownerEmail,
      `New Appointment: ${customerName} — ${service}`,
      `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1a1a1a;">

          <div style="margin-bottom: 24px;">
            <h2 style="margin: 0 0 4px 0; font-size: 20px;">New Appointment Booked</h2>
            <p style="margin: 0; color: #6b7280; font-size: 14px;">Booked via text conversation at <strong>${businessName}</strong>.</p>
          </div>

          <div style="background: #f9fafb; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 6px 0; color: #6b7280; font-size: 13px; width: 120px;">Customer</td>
                <td style="padding: 6px 0; font-weight: 600; font-size: 14px;">${customerName}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #6b7280; font-size: 13px;">Phone</td>
                <td style="padding: 6px 0; font-weight: 600; font-size: 14px;">${customerPhone}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #6b7280; font-size: 13px;">Missed call</td>
                <td style="padding: 6px 0; font-size: 14px;">${formatDateTime(missedCallAt)}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #6b7280; font-size: 13px;">Service</td>
                <td style="padding: 6px 0; font-weight: 600; font-size: 14px;">${service}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #6b7280; font-size: 13px;">Appointment</td>
                <td style="padding: 6px 0; font-weight: 600; font-size: 14px;">${datetime}</td>
              </tr>
              ${notes ? `
              <tr>
                <td style="padding: 6px 0; color: #6b7280; font-size: 13px;">Notes</td>
                <td style="padding: 6px 0; font-size: 14px;">${notes}</td>
              </tr>` : ''}
            </table>
          </div>

          <div style="margin-bottom: 20px;">
            <div style="font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 10px;">Conversation</div>
            <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px; background: #fff;">
              ${conversationHtml}
            </div>
          </div>

          <a href="${APP_URL}/dashboard/appointments" style="display: inline-block; padding: 10px 20px; background: #4f46e5; color: #fff; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 500;">
            View Appointment
          </a>

          <p style="color: #d1d5db; font-size: 11px; margin-top: 24px; margin-bottom: 0;">Sent by MissedCall AI</p>
        </div>
      `
    )
    console.log('📧 Appointment booked email sent to:', ownerEmail)
  } catch (error) {
    console.error('❌ Failed to send appointment booked email:', error)
  }
}
