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
// The confirmation email and the calendar invite live in lib/demo-booker-copy.ts
// and share the helpers below. The two pre-booking lead texts live in
// lib/lead-sms.ts, which sends them.
//
// All of it is GSM-7: straight quotes and apostrophes, no dashes, no emoji. One
// character outside that alphabet turns a whole text into UCS-2 and roughly
// doubles its segment count. lib/demo-booker-copy.test.ts asserts it for every text.
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

/**
 * " Marcus" from "Marcus Vandenberg", for "Hey Marcus," / "Hi Marcus,". Empty
 * when there is nothing usable, so the line reads "Hey," with no name.
 *
 * Guards the banked-lead placeholder, where the stored "name" is the phone
 * number: "Hey +16165551234," is worse than no name at all.
 */
export function greetingName(raw: string | null | undefined): string {
  const first = raw?.trim().split(/\s+/)[0] ?? ''
  if (!first || first.length < 2 || /\d/.test(first)) return ''
  return ` ${first}`
}

export type DemoSmsParams = {
  scheduledAt: Date
  /** The booker's name as stored. Only the first word is used. */
  firstName?: string | null
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

export function demoWhen(params: DemoSmsParams) {
  return bookerWhen(params.scheduledAt, { timeZone: params.timeZone, source: params.timeZoneSource })
}

/** Sent by /api/demo-book the moment the slot is taken. */
export function confirmationText(params: DemoSmsParams): string {
  const when = demoWhen(params)
  const phone = formatReschedulePhone(params.ownerPhone)
  return (
    `Hey${greetingName(params.firstName)}, it's Jacob from Align and Acquire. ` +
    `You're booked for ${when.dateShort} at ${when.timeMarked}.` +
    (params.meetLink ? ` Join here: ${params.meetLink}` : '') +
    '\n\n' +
    (phone ? `Need to move it? Text or call my cell at ${phone}. ` : '') +
    'Reply STOP to opt out.'
  )
}

/**
 * Sent by the reminder cron at 6:30 PM the day before, in the booker's zone.
 * "Reply YES" lands in the marketing-line branch of the SMS webhook, which
 * forwards it to Jacob and auto-replies nothing. YES is not an opt-in keyword
 * there (only START and UNSTOP are).
 */
export function nightBeforeText(params: DemoSmsParams): string {
  const when = demoWhen(params)
  const phone = formatReschedulePhone(params.ownerPhone)
  return (
    `Hey${greetingName(params.firstName)}, Jacob from Align and Acquire. ` +
    `Looking forward to our call tomorrow at ${when.timeMarked}. ` +
    `Reply YES so I know you're still good.` +
    (phone ? ` If you need a different time, text or call my cell at ${phone}.` : '')
  )
}

/**
 * Sent by the reminder cron roughly an hour out. The bare time, without
 * "(your time)": an hour out, the marker is noise.
 */
export function hourBeforeText(params: DemoSmsParams): string {
  const when = demoWhen(params)
  return (
    `Hey${greetingName(params.firstName)}, Jacob from Align and Acquire. ` +
    `We're on at ${when.time}, about an hour from now.` +
    (params.meetLink ? ` Join here: ${params.meetLink}` : '')
  )
}
