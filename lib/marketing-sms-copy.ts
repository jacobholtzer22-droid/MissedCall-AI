// ===========================================
// MARKETING DEMO SMS COPY (/book)
// ===========================================
// The three texts a booked prospect receives: confirmation at booking time,
// a reminder the night before, a reminder an hour out.
//
// One module because they drifted. The confirmation lived in /api/demo-book and
// the two reminders in /api/cron/appointment-reminders, each with its own
// formatter, so the wording, the timezone label and the Meet link handling were
// three near-copies. Every one of them now renders through lib/booker-time, in
// the BOOKER's zone with its abbreviation ("1:00 PM PDT"). They used to say
// "ET" to everyone, so a prospect in California was texted 4:00 PM for a call
// they had picked at 1:00 PM on the calendar.
//
// The reschedule number is ALWAYS derived from business.ownerPhone. Never write
// a literal phone number into this file: the row is the source of truth, and a
// hardcoded number silently outlives the day it changes.

import { bookerWhen } from '@/lib/booker-time'

/**
 * "+15175809709" renders as "517-580-9709".
 *
 * Dashes, not the (517) 580-9709 of lib/utils formatPhoneNumber: this is read
 * aloud off a phone screen and tapped, and the bare form is what the rest of the
 * funnel copy uses. Anything that is not a 10-digit US number after stripping is
 * returned as-is rather than mangled.
 */
export function formatReschedulePhone(phone: string | null | undefined): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
  if (ten.length !== 10) return phone.trim() || null
  return `${ten.slice(0, 3)}-${ten.slice(3, 6)}-${ten.slice(6)}`
}

export type DemoSmsParams = {
  scheduledAt: Date
  /** Google Meet link. Omitted from the copy entirely when absent. */
  meetLink?: string | null
  /** business.ownerPhone. The reschedule line is omitted when absent. */
  ownerPhone?: string | null
  /**
   * Appointment.customerTimezone / customerTimezoneSource. Absent renders ET
   * with its abbreviation; an 'ip' source renders the guess AND ET.
   */
  timeZone?: string | null
  timeZoneSource?: string | null
}

function when(params: DemoSmsParams) {
  return bookerWhen(params.scheduledAt, { timeZone: params.timeZone, source: params.timeZoneSource })
}

/** "Join here: <link>. " or nothing. Never renders a dangling "Join here: ." */
function joinSentence(meetLink: string | null | undefined): string {
  return meetLink ? ` Join here: ${meetLink}.` : ''
}

/** "Need to reschedule? ..." or nothing, so a missing ownerPhone cannot leak. */
function rescheduleSentence(ownerPhone: string | null | undefined, verb: string): string {
  const phone = formatReschedulePhone(ownerPhone)
  return phone ? ` Need to reschedule? ${verb} ${phone}.` : ''
}

/** Sent by /api/demo-book the moment the slot is taken. */
export function confirmationText(params: DemoSmsParams): string {
  const { day, date, time } = when(params)
  return (
    `You're booked with Jacob at Align and Acquire: ${day} ${date} at ${time}.` +
    joinSentence(params.meetLink) +
    rescheduleSentence(params.ownerPhone, 'Text or call Jacob at') +
    ' Reply STOP to opt out.'
  )
}

/** Sent by the reminder cron at 6:30 PM the day before, in the booker's zone. */
export function nightBeforeText(params: DemoSmsParams): string {
  const { time } = when(params)
  return (
    `Reminder: your demo with Jacob at Align and Acquire is tomorrow at ${time}.` +
    joinSentence(params.meetLink) +
    rescheduleSentence(params.ownerPhone, 'Text or call Jacob at')
  )
}

/** Sent by the reminder cron roughly an hour out. */
export function hourBeforeText(params: DemoSmsParams): string {
  const { time } = when(params)
  return (
    `Your demo with Jacob is at ${time}, about an hour from now.` +
    joinSentence(params.meetLink) +
    rescheduleSentence(params.ownerPhone, 'Text or call')
  )
}
