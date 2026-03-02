// ===========================================
// OWNER NOTIFICATIONS - Booking created
// ===========================================
// Sends SMS (Telnyx) and email (nodemailer/Gmail) to business owner

import Telnyx from 'telnyx'
import nodemailer from 'nodemailer'
import { TZDate } from '@date-fns/tz'
import { normalizeToE164 } from '@/lib/phone-utils'
import type { Business, Appointment } from '@prisma/client'

/** Parse "YYYY-MM-DD HH:mm" as business local time (not UTC). */
function parseDatetimeInTimezone(datetimeStr: string, tz: string): Date {
  const match = datetimeStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/)
  if (!match) return new Date(datetimeStr)
  const [, y, m, d, h, min, sec] = match
  const d2 = new TZDate(
    parseInt(y!, 10),
    parseInt(m!, 10) - 1,
    parseInt(d!, 10),
    parseInt(h!, 10),
    parseInt(min!, 10),
    parseInt(sec || '0', 10),
    0,
    tz
  )
  return new Date(d2.getTime())
}

const baseUrl =
  process.env.NEXT_PUBLIC_APP_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://alignandacquire.com')

function formatDate(d: Date, timeZone?: string): string {
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(timeZone && { timeZone }),
  })
}

function formatTime(d: Date, timeZone?: string): string {
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    ...(timeZone && { timeZone }),
  })
}

type BusinessWithPhone = Pick<
  Business,
  | 'id'
  | 'name'
  | 'slug'
  | 'telnyxPhoneNumber'
  | 'forwardingNumber'
  | 'ownerEmail'
  | 'ownerPhone'
  | 'notifyBySms'
  | 'notifyByEmail'
  | 'timezone'
>

export type BookingSource = 'website' | 'sms'

export type NotifyOwnerResult = { smsSent: boolean; emailSent: boolean }

export async function notifyOwnerOnBookingCreated(
  business: BusinessWithPhone,
  appointment: Pick<Appointment, 'id' | 'customerName' | 'customerPhone' | 'customerEmail' | 'serviceType' | 'scheduledAt' | 'notes'> & { customerAddress?: string | null; source?: BookingSource }
): Promise<NotifyOwnerResult> {
  const result: NotifyOwnerResult = { smsSent: false, emailSent: false }
  console.error('[NOTIFY OWNER] notifyOwnerOnBookingCreated called', { businessId: business.id, appointmentId: appointment.id })

  const scheduledAt = new Date(appointment.scheduledAt)
  const tz = business.timezone ?? 'America/New_York'
  const dateStr = formatDate(scheduledAt, tz)
  const timeStr = formatTime(scheduledAt, tz)
  const dashboardUrl = 'https://alignandacquire.com/dashboard/appointments'
  const sourceLabel = appointment.source === 'sms' ? 'Missed Call' : 'Website'
  const notesTruncated = appointment.notes
    ? (appointment.notes.length > 100 ? appointment.notes.slice(0, 100) + '...' : appointment.notes)
    : ''

  // SMS
  if (business.notifyBySms) {
    console.error('[NOTIFY OWNER] SMS enabled, checking phone numbers...')
    const rawPhone = business.ownerPhone || business.forwardingNumber
    const toPhone = rawPhone ? normalizeToE164(rawPhone.trim()) : ''
    if (!toPhone) {
      console.error('[NOTIFY OWNER] SMS SKIP: No ownerPhone or forwardingNumber set for business (or invalid format)', { businessId: business.id, ownerPhone: business.ownerPhone ?? 'null', forwardingNumber: business.forwardingNumber ?? 'null' })
    } else if (!business.telnyxPhoneNumber) {
      console.error('[NOTIFY OWNER] SMS SKIP: No telnyxPhoneNumber set for business', { businessId: business.id })
    } else {
      const addressLine = appointment.customerAddress ? `\n📍 Address: ${appointment.customerAddress}` : ''
      const smsText = `📅 New Quote Request! ${appointment.customerName} wants a quote for ${appointment.serviceType} on ${dateStr} at ${timeStr}.\nPhone: ${appointment.customerPhone}${addressLine}${notesTruncated ? `\nNotes: ${notesTruncated}` : ''}\nFull details in your email and dashboard.`
      console.error('[NOTIFY OWNER] Sending SMS to', toPhone, 'from', business.telnyxPhoneNumber)
      try {
        const telnyx = new Telnyx({ apiKey: process.env.TELNYX_API_KEY! })
        const response = await telnyx.messages.send({
          from: business.telnyxPhoneNumber,
          to: toPhone,
          text: smsText,
        })
        console.error('[NOTIFY OWNER] SMS sent successfully', { to: toPhone, telnyxResponse: JSON.stringify(response.data) })
        result.smsSent = true
      } catch (err) {
        console.error('[NOTIFY OWNER] SMS FAILED:', {
          to: toPhone,
          from: business.telnyxPhoneNumber,
          error: err instanceof Error ? err.message : String(err),
          fullError: err,
        })
      }
    }
  } else {
    console.error('[NOTIFY OWNER] SMS disabled (notifyBySms=false)')
  }

  // Email
  if (business.notifyByEmail && business.ownerEmail) {
    console.error('[NOTIFY OWNER] Email enabled, sending to', business.ownerEmail)
    const subject = `New Quote Visit - ${appointment.customerName} - ${appointment.serviceType} - ${dateStr}`
    const body = [
      `A new quote visit has been scheduled for ${business.name}.`,
      '',
      `Source: ${sourceLabel} Lead`,
      '',
      'Customer details:',
      `  Name: ${appointment.customerName}`,
      `  Phone: ${appointment.customerPhone}`,
      appointment.customerEmail ? `  Email: ${appointment.customerEmail}` : null,
      appointment.customerAddress ? `  Address: ${appointment.customerAddress}` : null,
      '',
      `Service (quote requested): ${appointment.serviceType}`,
      `Date and time: ${dateStr} at ${timeStr}`,
      '',
      appointment.notes ? `Notes / context from customer:\n${appointment.notes}` : null,
      '',
      `View and manage quote visits: ${dashboardUrl}`,
      '',
      'Booked via MissedCall AI - Align and Acquire',
    ]
      .filter(Boolean)
      .join('\n')

    try {
      await sendEmail(business.ownerEmail, subject, body)
      console.error('[NOTIFY OWNER] Email sent successfully to', business.ownerEmail)
      result.emailSent = true
    } catch (err) {
      console.error('[NOTIFY OWNER] Email FAILED:', {
        to: business.ownerEmail,
        error: err instanceof Error ? err.message : String(err),
        fullError: err,
      })
    }
  } else {
    if (!business.notifyByEmail) {
      console.error('[NOTIFY OWNER] Email disabled (notifyByEmail=false)')
    } else if (!business.ownerEmail) {
      console.error('[NOTIFY OWNER] Email SKIP: No ownerEmail set for business', { businessId: business.id })
    }
  }
  return result
}

// ── Booking request (no calendar) ───────────────────────────────────
// For businesses without calendar integration: AI tagged [APPOINTMENT_BOOKED]
// but no Google Calendar event was created — owner must confirm manually.

export type ConversationMessage = { direction: string; content: string; createdAt: Date }

export async function notifyOwnerOnBookingRequestNoCalendar(
  business: BusinessWithPhone,
  params: {
    customerName: string
    customerPhone: string
    service: string
    datetime: string
    notes?: string | null
    customerAddress?: string | null
    conversationTranscript: ConversationMessage[]
  }
): Promise<void> {
  const { customerName, customerPhone, service, datetime, notes, customerAddress, conversationTranscript } = params
  const dashboardUrl = `${baseUrl}/dashboard/appointments`
  const tz = business.timezone ?? 'America/New_York'
  const dateObj = typeof datetime === 'string' ? parseDatetimeInTimezone(datetime, tz) : datetime
  const dateStr = formatDate(dateObj, tz)
  const timeStr = formatTime(dateObj, tz)
  const dateTimeLabel = `${dateStr} at ${timeStr}`

  // SMS
  if (business.notifyBySms) {
    const toPhone = business.ownerPhone || business.forwardingNumber
    if (toPhone && business.telnyxPhoneNumber) {
      const addressLine = customerAddress ? `\n📍 Address: ${customerAddress}` : ''
      const smsText = `📅 New Quote Request! ${customerName} wants a quote for ${service} around ${dateTimeLabel}. Phone: ${customerPhone}${addressLine}. Check your dashboard for details.`
      try {
        const telnyx = new Telnyx({ apiKey: process.env.TELNYX_API_KEY! })
        await telnyx.messages.send({
          from: business.telnyxPhoneNumber,
          to: toPhone.trim(),
          text: smsText,
        })
        console.error('[NOTIFY OWNER] Booking request (no calendar) SMS sent to', toPhone.trim())
      } catch (err) {
        console.error('[NOTIFY OWNER] Booking request SMS FAILED:', err instanceof Error ? err.message : String(err))
      }
    }
  }

  // Email
  if (business.notifyByEmail && business.ownerEmail) {
    const subject = `New Quote Request - ${customerName} - ${service}`
    const transcriptText = conversationTranscript
      .map((m) => {
        const label = m.direction === 'inbound' ? 'Customer' : business.name
        const ts = m.createdAt instanceof Date ? m.createdAt.toLocaleString('en-US', { timeZone: tz }) : ''
        return `[${ts}] ${label}: ${m.content}`
      })
      .join('\n\n')

    const body = [
      `A new quote request has come in for ${business.name}.`,
      '',
      'Customer details:',
      `  Name: ${customerName}`,
      `  Phone: ${customerPhone}`,
      `  Service requested: ${service}`,
      `  Preferred date/time: ${dateTimeLabel}`,
      notes ? `  Notes: ${notes}` : null,
      customerAddress ? `  Address: ${customerAddress}` : null,
      '',
      'Full conversation transcript:',
      '─'.repeat(40),
      transcriptText,
      '─'.repeat(40),
      '',
      '⚠️ This quote visit has NOT been added to your calendar. Please confirm the time with the customer directly.',
      '',
      `View your dashboard: ${dashboardUrl}`,
      '',
      'Powered by MissedCall AI - Align and Acquire',
    ]
      .filter(Boolean)
      .join('\n')

    try {
      await sendEmail(business.ownerEmail, subject, body)
      console.error('[NOTIFY OWNER] Booking request (no calendar) email sent to', business.ownerEmail)
    } catch (err) {
      console.error('[NOTIFY OWNER] Booking request email FAILED:', err instanceof Error ? err.message : String(err))
    }
  }
}

// ── Lead captured (no calendar) ─────────────────────────────────────
// For businesses without calendar: collect name, email, address, timeframe; notify owner.

export async function notifyOwnerOnLeadCaptured(
  business: BusinessWithPhone,
  params: {
    customerName: string
    customerPhone: string
    service: string
    customerEmail?: string
    customerAddress?: string
    customerTimeframe?: string
    conversationTranscript: ConversationMessage[]
    conversationId: string
  }
): Promise<void> {
  const {
    customerName,
    customerPhone,
    service,
    customerEmail,
    customerAddress,
    customerTimeframe,
    conversationTranscript,
    conversationId,
  } = params
  const conversationUrl = `${baseUrl}/dashboard/conversations/${conversationId}`
  const tz = business.timezone ?? 'America/New_York'

  // SMS: "New lead! [Name] wants [service] around [timeframe]. Address: [address]. Phone: [phone]. Email: [email]. Check your email for the full conversation."
  if (business.notifyBySms) {
    const toPhone = business.ownerPhone || business.forwardingNumber
    if (toPhone && business.telnyxPhoneNumber) {
      const timeframePart = customerTimeframe ? ` around ${customerTimeframe}` : ''
      const parts = [
        `New lead! ${customerName} wants ${service}${timeframePart}.`,
        `Address: ${customerAddress || 'N/A'}.`,
        `Phone: ${customerPhone}.`,
        `Email: ${customerEmail || 'N/A'}.`,
        'Check your email for the full conversation.',
      ]
      const smsText = parts.join(' ')
      try {
        const telnyx = new Telnyx({ apiKey: process.env.TELNYX_API_KEY! })
        await telnyx.messages.send({
          from: business.telnyxPhoneNumber,
          to: toPhone.trim(),
          text: smsText,
        })
        console.error('[NOTIFY OWNER] Lead captured SMS sent to', toPhone.trim())
      } catch (err) {
        console.error('[NOTIFY OWNER] Lead captured SMS FAILED:', err instanceof Error ? err.message : String(err))
      }
    }
  }

  // Email: Subject "New Lead - [Name] - [Service]", all customer info + full transcript
  if (business.notifyByEmail && business.ownerEmail) {
    const subject = `New Lead - ${customerName} - ${service}`
    const transcriptText = conversationTranscript
      .map((m) => {
        const label = m.direction === 'inbound' ? 'Customer' : business.name
        const ts = m.createdAt instanceof Date ? m.createdAt.toLocaleString('en-US', { timeZone: tz }) : ''
        return `[${ts}] ${label}: ${m.content}`
      })
      .join('\n\n')

    const details = [
      `Name: ${customerName}`,
      `Phone: ${customerPhone}`,
      ...(customerEmail ? [`Email: ${customerEmail}`] : []),
      ...(customerAddress ? [`Address: ${customerAddress}`] : []),
      `Service: ${service}`,
      ...(customerTimeframe ? [`Preferred timeframe: ${customerTimeframe}`] : []),
    ]

    const body = [
      `A new lead has been captured for ${business.name}.`,
      '',
      'Customer details:',
      ...details.map((d) => `  ${d}`),
      '',
      'Full conversation transcript:',
      '─'.repeat(40),
      transcriptText,
      '─'.repeat(40),
      '',
      'Please reach out to this customer directly to discuss their needs.',
      '',
      `View this conversation: ${conversationUrl}`,
      '',
      'Powered by MissedCall AI - Align and Acquire',
    ]
      .filter(Boolean)
      .join('\n')

    try {
      await sendEmail(business.ownerEmail, subject, body)
      console.error('[NOTIFY OWNER] Lead captured email sent to', business.ownerEmail)
    } catch (err) {
      console.error('[NOTIFY OWNER] Lead captured email FAILED:', err instanceof Error ? err.message : String(err))
    }
  }
}

// ── Human needed ────────────────────────────────────────────────────
// When AI flags [HUMAN_NEEDED] — customer needs personal follow-up.

export async function notifyOwnerOnHumanNeeded(
  business: BusinessWithPhone,
  params: {
    customerName: string
    customerPhone: string
    reason?: string | null
    conversationTranscript: ConversationMessage[]
    conversationId: string
  }
): Promise<void> {
  const { customerName, customerPhone, reason, conversationTranscript, conversationId } = params
  const conversationUrl = `${baseUrl}/dashboard/conversations/${conversationId}`
  const tz = business.timezone ?? 'America/New_York'

  // SMS
  if (business.notifyBySms) {
    const toPhone = business.ownerPhone || business.forwardingNumber
    if (toPhone && business.telnyxPhoneNumber) {
      const smsText = `⚠️ A customer needs your help! ${customerName} (${customerPhone}) needs a personal follow-up. Check your email for the full conversation.`
      try {
        const telnyx = new Telnyx({ apiKey: process.env.TELNYX_API_KEY! })
        await telnyx.messages.send({
          from: business.telnyxPhoneNumber,
          to: toPhone.trim(),
          text: smsText,
        })
        console.error('[NOTIFY OWNER] Human needed SMS sent to', toPhone.trim())
      } catch (err) {
        console.error('[NOTIFY OWNER] Human needed SMS FAILED:', err instanceof Error ? err.message : String(err))
      }
    }
  }

  // Email
  if (business.notifyByEmail && business.ownerEmail) {
    const subject = `Follow-Up Needed - ${customerName}`
    const transcriptText = conversationTranscript
      .map((m) => {
        const label = m.direction === 'inbound' ? 'Customer' : business.name
        const ts = m.createdAt instanceof Date ? m.createdAt.toLocaleString('en-US', { timeZone: tz }) : ''
        return `[${ts}] ${label}: ${m.content}`
      })
      .join('\n\n')

    const body = [
      `A customer needs your personal follow-up.`,
      '',
      'Customer details:',
      `  Name: ${customerName}`,
      `  Phone: ${customerPhone}`,
      reason ? `\nWhy the AI flagged this: ${reason}\n` : null,
      '',
      'Full conversation transcript:',
      '─'.repeat(40),
      transcriptText,
      '─'.repeat(40),
      '',
      'Please reach out to this customer directly.',
      '',
      `View this conversation: ${conversationUrl}`,
      '',
      'Powered by MissedCall AI - Align and Acquire',
    ]
      .filter(Boolean)
      .join('\n')

    try {
      await sendEmail(business.ownerEmail, subject, body)
      console.error('[NOTIFY OWNER] Human needed email sent to', business.ownerEmail)
    } catch (err) {
      console.error('[NOTIFY OWNER] Human needed email FAILED:', err instanceof Error ? err.message : String(err))
    }
  }
}

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null

function getTransporter() {
  if (transporter) return transporter
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  const host = process.env.SMTP_HOST || 'smtp.gmail.com'
  const port = Number(process.env.SMTP_PORT) || 587

  console.error('[NOTIFY OWNER] SMTP config check:', {
    SMTP_HOST: host,
    SMTP_PORT: port,
    SMTP_USER: user ? '(set)' : 'MISSING',
    SMTP_PASS: pass ? '(set)' : 'MISSING',
  })

  if (!user || !pass) {
    const missing = [(!user && 'SMTP_USER'), (!pass && 'SMTP_PASS')].filter(Boolean)
    console.error('[NOTIFY OWNER] SMTP FAIL: Missing env vars:', missing)
    throw new Error(`SMTP_USER and SMTP_PASS must be set for email notifications. Missing: ${missing.join(', ')}`)
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  })
  return transporter
}

async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@alignandacquire.com'
  console.error('[NOTIFY OWNER] sendEmail called', { to, subject: subject.slice(0, 50) + '...' })
  try {
    const result = await getTransporter().sendMail({
      from,
      to,
      subject,
      text,
    })
    console.error('[NOTIFY OWNER] sendMail result:', { messageId: result.messageId })
  } catch (err) {
    console.error('[NOTIFY OWNER] sendMail FAILED - full SMTP error:', err)
    throw err
  }
}
