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

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
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
>

export async function notifyOwnerOnBookingCreated(
  business: BusinessWithPhone,
  appointment: Pick<Appointment, 'id' | 'customerName' | 'customerPhone' | 'customerEmail' | 'serviceType' | 'scheduledAt'>
): Promise<void> {
  const scheduledAt = new Date(appointment.scheduledAt)
  const dateStr = formatDate(scheduledAt)
  const timeStr = formatTime(scheduledAt)
  const dashboardUrl = `${baseUrl}/dashboard/appointments`

  // SMS
  if (business.notifyBySms) {
    const toPhone = business.ownerPhone || business.forwardingNumber
    if (toPhone && business.telnyxPhoneNumber) {
      const smsText = `New booking! ${appointment.customerName} booked ${dateStr} at ${timeStr}. Service: ${appointment.serviceType}. Phone: ${appointment.customerPhone}`
      try {
        const telnyx = new Telnyx({ apiKey: process.env.TELNYX_API_KEY! })
        await telnyx.messages.send({
          from: business.telnyxPhoneNumber,
          to: toPhone.trim(),
          text: smsText,
        })
      } catch (err) {
        console.error('Failed to send owner booking SMS:', err)
      }
    }
  }

  // Email
  if (business.notifyByEmail && business.ownerEmail) {
    const subject = `New Booking - ${appointment.customerName} - ${dateStr} ${timeStr}`
    const body = [
      `A new appointment has been booked for ${business.name}.`,
      '',
      'Customer details:',
      `  Name: ${appointment.customerName}`,
      `  Phone: ${appointment.customerPhone}`,
      appointment.customerEmail ? `  Email: ${appointment.customerEmail}` : null,
      '',
      `Service: ${appointment.serviceType}`,
      `Date/Time: ${dateStr} at ${timeStr}`,
      '',
      `View and manage appointments: ${dashboardUrl}`,
    ]
      .filter(Boolean)
      .join('\n')

    try {
      await sendEmail(business.ownerEmail, subject, body)
    } catch (err) {
      console.error('Failed to send owner booking email:', err)
    }
  }
}

export async function notifyOwnerOnBookingCancelled(
  business: BusinessWithPhone,
  appointment: Pick<Appointment, 'id' | 'customerName' | 'customerPhone' | 'customerEmail' | 'serviceType' | 'scheduledAt'>
): Promise<void> {
  const scheduledAt = new Date(appointment.scheduledAt)
  const dateStr = formatDate(scheduledAt)
  const timeStr = formatTime(scheduledAt)
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

  if (!user || !pass) {
    throw new Error('SMTP_USER and SMTP_PASS must be set for email notifications')
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
  await getTransporter().sendMail({
    from,
    to,
    subject,
    text,
  })
}
