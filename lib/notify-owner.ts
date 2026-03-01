// ===========================================
// OWNER NOTIFICATIONS - Booking created/cancelled
// ===========================================
// Sends SMS (Telnyx) and email (nodemailer/Gmail) to business owner

import Telnyx from 'telnyx'
import nodemailer from 'nodemailer'
import type { Business, Appointment } from '@prisma/client'

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

export async function notifyOwnerOnBookingCreated(
  business: BusinessWithPhone,
  appointment: Pick<Appointment, 'id' | 'customerName' | 'customerPhone' | 'customerEmail' | 'serviceType' | 'scheduledAt' | 'notes'> & { source?: BookingSource }
): Promise<void> {
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
    const toPhone = business.ownerPhone || business.forwardingNumber
    if (!toPhone) {
      console.error('[NOTIFY OWNER] SMS SKIP: No ownerPhone or forwardingNumber set for business', { businessId: business.id })
    } else if (!business.telnyxPhoneNumber) {
      console.error('[NOTIFY OWNER] SMS SKIP: No telnyxPhoneNumber set for business', { businessId: business.id })
    } else {
      const smsText = `📅 New ${sourceLabel} Lead!\n${appointment.customerName} booked ${appointment.serviceType} on ${dateStr} at ${timeStr}.\nPhone: ${appointment.customerPhone}${notesTruncated ? `\nNotes: ${notesTruncated}` : ''}\nFull details in your email and dashboard.`
      console.error('[NOTIFY OWNER] Sending SMS to', toPhone.trim(), 'from', business.telnyxPhoneNumber)
      try {
        const telnyx = new Telnyx({ apiKey: process.env.TELNYX_API_KEY! })
        const response = await telnyx.messages.send({
          from: business.telnyxPhoneNumber,
          to: toPhone.trim(),
          text: smsText,
        })
        console.error('[NOTIFY OWNER] SMS sent successfully', { to: toPhone.trim(), telnyxResponse: JSON.stringify(response.data) })
      } catch (err) {
        console.error('[NOTIFY OWNER] SMS FAILED:', {
          to: toPhone.trim(),
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
    const subject = `New Booking - ${appointment.customerName} - ${appointment.serviceType} - ${dateStr}`
    const body = [
      `A new appointment has been booked for ${business.name}.`,
      '',
      `Source: ${sourceLabel} Lead`,
      '',
      'Customer details:',
      `  Name: ${appointment.customerName}`,
      `  Phone: ${appointment.customerPhone}`,
      appointment.customerEmail ? `  Email: ${appointment.customerEmail}` : null,
      '',
      `Service booked: ${appointment.serviceType}`,
      `Date and time: ${dateStr} at ${timeStr}`,
      '',
      appointment.notes ? `Notes / context from customer:\n${appointment.notes}` : null,
      '',
      `View and manage appointments: ${dashboardUrl}`,
      '',
      'Booked via MissedCall AI - Align and Acquire',
    ]
      .filter(Boolean)
      .join('\n')

    try {
      await sendEmail(business.ownerEmail, subject, body)
      console.error('[NOTIFY OWNER] Email sent successfully to', business.ownerEmail)
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
}

export async function notifyOwnerOnBookingCancelled(
  business: BusinessWithPhone,
  appointment: Pick<Appointment, 'id' | 'customerName' | 'customerPhone' | 'customerEmail' | 'serviceType' | 'scheduledAt'>
): Promise<void> {
  const scheduledAt = new Date(appointment.scheduledAt)
  const tz = business.timezone ?? 'America/New_York'
  const dateStr = formatDate(scheduledAt, tz)
  const timeStr = formatTime(scheduledAt, tz)
  const dashboardUrl = `${baseUrl}/dashboard/appointments`

  // SMS
  if (business.notifyBySms) {
    const toPhone = business.ownerPhone || business.forwardingNumber
    if (toPhone && business.telnyxPhoneNumber) {
      const smsText = `Booking cancelled: ${appointment.customerName} on ${dateStr} at ${timeStr}`
      try {
        const telnyx = new Telnyx({ apiKey: process.env.TELNYX_API_KEY! })
        await telnyx.messages.send({
          from: business.telnyxPhoneNumber,
          to: toPhone.trim(),
          text: smsText,
        })
      } catch (err) {
        console.error('Failed to send owner cancellation SMS:', err)
      }
    }
  }

  // Email
  if (business.notifyByEmail && business.ownerEmail) {
    const subject = `Booking Cancelled - ${appointment.customerName} - ${dateStr} ${timeStr}`
    const body = [
      `An appointment has been cancelled for ${business.name}.`,
      '',
      'Cancelled appointment details:',
      `  Customer: ${appointment.customerName}`,
      `  Phone: ${appointment.customerPhone}`,
      appointment.customerEmail ? `  Email: ${appointment.customerEmail}` : null,
      `  Service: ${appointment.serviceType}`,
      `  Was scheduled: ${dateStr} at ${timeStr}`,
      '',
      `View all appointments: ${dashboardUrl}`,
    ]
      .filter(Boolean)
      .join('\n')

    try {
      await sendEmail(business.ownerEmail, subject, body)
    } catch (err) {
      console.error('Failed to send owner cancellation email:', err)
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
