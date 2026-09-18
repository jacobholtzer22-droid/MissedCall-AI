// ===========================================
// PREVIEW: EVERY MESSAGE A /book BOOKER RECEIVES
// ===========================================
// Renders the lead texts, the confirmation text, both reminders, the
// confirmation email and the calendar invite for a spread of time zones, with
// character counts, GSM-7 checks and segment counts, plus when each reminder
// would go out in the booker's local time.
//
// Sends nothing and touches no database. It calls the SAME builders production
// calls (lib/lead-sms, lib/marketing-sms-copy, lib/demo-booker-copy) and the
// SAME reminder timing function the cron calls (lib/demo-reminder-schedule), so
// what prints here is what goes out. It never calls a send function.
//
// Run:
//   npx tsx scripts/preview-booker-messages.ts
//
// No .env is needed. Links render against production so character and segment
// counts match what goes out; set PREVIEW_APP_URL to render another host.
// (NEXT_PUBLIC_APP_URL is deliberately NOT honoured: importing lib/lead-sms
// pulls in the Prisma client, which loads the project .env, where that variable
// is http://localhost:3000.)

import { followUpBody, leadTextBody } from '@/lib/lead-sms'
import { confirmationText, hourBeforeText, nightBeforeText } from '@/lib/marketing-sms-copy'
import { confirmationEmail, demoEmailEnvelope, demoInviteDescription, demoInviteTitle } from '@/lib/demo-booker-copy'
import { bookerWhen } from '@/lib/booker-time'
import { decideReminder, type ReminderAppointment } from '@/lib/demo-reminder-schedule'
import { earliestFollowUpAt } from '@/lib/lead-follow-up-window'
import { getDemoVideoAbsoluteUrl } from '@/lib/demo-video'

// Belt and braces: nothing here sends or queries, and nothing could with these
// blank. Runs after the imports above, which is why the Prisma client's .env
// load cannot put them back.
for (const key of ['TELNYX_API_KEY', 'RESEND_API_KEY', 'META_CAPI_ACCESS_TOKEN', 'DATABASE_URL', 'DIRECT_URL']) {
  process.env[key] = ''
}
process.env.NEXT_PUBLIC_APP_URL = process.env.PREVIEW_APP_URL || 'https://www.alignandacquire.com'

// ── Sample inputs ─────────────────────────────────────────────────────────────
// ownerPhone and ownerEmail mirror business.ownerPhone / business.ownerEmail on
// the marketing business; production reads them from the row. The Meet link and
// token are shaped like real ones so the character counts are honest.
const OWNER_PHONE = '+15175809709'
const OWNER_EMAIL = 'jacob@alignandacquire.com'
const MEET = 'https://meet.google.com/abc-defg-hij'
const CAL_TOKEN = 'Ab3dEf6hIj9kLm2n'
const FIRST_NAME = 'Marcus Vandenberg'
const COMPANY = 'Vandenberg Roofing'
const TRADE = 'Roofing'
const VIDEO = getDemoVideoAbsoluteUrl()

// 4:00 PM ET on a Tuesday, once in daylight time and once in standard time.
// Each booked at noon ET two days earlier, so both reminders are in play.
const DATES = [
  { label: 'September (EDT)', at: new Date('2026-09-22T20:00:00Z'), booked: new Date('2026-09-20T16:00:00Z') },
  { label: 'January (EST)', at: new Date('2027-01-12T21:00:00Z'), booked: new Date('2027-01-10T17:00:00Z') },
]

const ZONES: { timeZone: string | null; source: string | null }[] = [
  { timeZone: 'America/Los_Angeles', source: 'widget' },
  { timeZone: 'America/Denver', source: 'widget' },
  { timeZone: 'America/Phoenix', source: 'widget' },
  { timeZone: 'America/Chicago', source: 'widget' },
  { timeZone: 'America/New_York', source: 'widget' },
  { timeZone: 'America/Los_Angeles', source: 'ip' },
  { timeZone: null, source: null },
]

// ── SMS accounting ────────────────────────────────────────────────────────────
const GSM_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà'
const GSM_EXT = '^{}\\[~]|€\f'

function smsStats(text: string): string {
  const chars = Array.from(text)
  const bad = chars.filter((c) => !GSM_BASIC.includes(c) && !GSM_EXT.includes(c))
  if (bad.length) {
    const units = text.length
    const segs = units <= 70 ? 1 : Math.ceil(units / 67)
    return `${chars.length} chars | GSM-7 FAIL (${JSON.stringify(Array.from(new Set(bad)).join(''))}) | ${segs} segment(s) as UCS-2`
  }
  const septets = chars.reduce((n, c) => n + (GSM_EXT.includes(c) ? 2 : 1), 0)
  const segs = septets <= 160 ? 1 : Math.ceil(septets / 153)
  return `${chars.length} chars | GSM-7 PASS | ${segs} segment(s)`
}

function printSms(label: string, text: string) {
  console.log(`\n[${label}] ${smsStats(text)}`)
  console.log(indent(text))
}

function indent(s: string, pad = '    '): string {
  return s
    .split('\n')
    .map((l) => pad + l)
    .join('\n')
}

// ── Reminder timing, via the cron's own decision function ─────────────────────
function fmt(d: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: tz,
    timeZoneName: 'short',
  })
    .format(d)
    .replace(/[\u202f\u00a0]/g, ' ')
}

type Timing = { night: string; hour: string }

/**
 * Walk every 15-minute cron run from booking to call, exactly as vercel.json
 * schedules it, and ask decideReminder what it would do at each one.
 */
function simulateReminders(scheduledAt: Date, createdAt: Date, timeZone: string | null): Timing {
  const state: ReminderAppointment = {
    scheduledAt,
    createdAt,
    customerTimezone: timeZone,
    reminderNightBeforeSentAt: null,
    reminderHourBeforeSentAt: null,
  }
  const local = timeZone ?? 'America/New_York'
  const out: Timing = { night: '', hour: '' }
  const skips = { night: new Set<string>(), hour: new Set<string>() }
  const step = 15 * 60 * 1000
  let t = Math.ceil(createdAt.getTime() / step) * step
  for (; t < scheduledAt.getTime(); t += step) {
    const now = new Date(t)
    const d = decideReminder(state, now)
    const inLastHour = scheduledAt.getTime() - t <= 60 * 60 * 1000
    if (d.skip) (inLastHour && !/night-before/.test(d.skip) ? skips.hour : skips.night).add(d.skip)
    if (d.kind === 'night_before' && !out.night) {
      state.reminderNightBeforeSentAt = now
      out.night = `SENDS ${fmt(now, local)}${timeZone && timeZone !== 'America/New_York' ? `  (${fmt(now, 'America/New_York')})` : ''}`
    }
    if (d.kind === 'hour_before' && !out.hour) {
      state.reminderHourBeforeSentAt = now
      out.hour = `SENDS ${fmt(now, local)}${timeZone && timeZone !== 'America/New_York' ? `  (${fmt(now, 'America/New_York')})` : ''}`
    }
  }
  if (!out.night) out.night = `SKIPPED: ${Array.from(skips.night).join('; ') || 'no run fell inside its window'}`
  if (!out.hour) out.hour = `SKIPPED: ${Array.from(skips.hour).join('; ') || 'no run fell inside its window'}`
  return out
}

// ── Render ────────────────────────────────────────────────────────────────────
const rule = (c = '=') => console.log(c.repeat(78))

function renderBooking(scheduledAt: Date, createdAt: Date, zone: { timeZone: string | null; source: string | null }) {
  const params = {
    scheduledAt,
    firstName: FIRST_NAME,
    meetLink: MEET,
    ownerPhone: OWNER_PHONE,
    timeZone: zone.timeZone,
    timeZoneSource: zone.source,
  }
  const when = bookerWhen(scheduledAt, { timeZone: zone.timeZone, source: zone.source })
  console.log(`{date}=${JSON.stringify(when.dateShort)}  {longDate}=${JSON.stringify(when.dateLong)}  {time}=${JSON.stringify(when.timeMarked)}  MSG 8 {time}=${JSON.stringify(when.time)}`)

  printSms('MSG 4 confirmation SMS', confirmationText(params))
  printSms('MSG 7 night-before SMS', nightBeforeText(params))
  printSms('MSG 8 hour-before SMS', hourBeforeText(params))

  const timing = simulateReminders(scheduledAt, createdAt, zone.timeZone)
  console.log(`\n[Reminder timing] booked ${fmt(createdAt, zone.timeZone ?? 'America/New_York')}, call ${fmt(scheduledAt, zone.timeZone ?? 'America/New_York')}`)
  console.log(`    night-before: ${timing.night}`)
  console.log(`    hour-before:  ${timing.hour}`)

  const mail = confirmationEmail({ ...params, videoUrl: VIDEO })
  const envelope = demoEmailEnvelope(OWNER_EMAIL)
  console.log(`\n[MSG 5 email] From: ${envelope.from}`)
  console.log(`              Reply-To (reply_to): ${envelope.reply_to ?? '(omitted)'}`)
  console.log(`              Subject: ${mail.subject}`)
  console.log(indent(mail.text))

  console.log(`\n[MSG 6 invite] Title: ${demoInviteTitle(FIRST_NAME, COMPANY)}`)
  console.log(
    indent(
      demoInviteDescription({
        ...params,
        videoUrl: VIDEO,
        details: {
          customerName: FIRST_NAME,
          customerPhone: '+16165551234',
          customerEmail: 'marcus@example.com',
          businessName: COMPANY,
          servicesInterested: [],
          message: `Company: ${COMPANY}\nTrade: ${TRADE}`,
        },
      })
    )
  )
  return { when, timing }
}

rule()
console.log('BOOKER MESSAGE PREVIEW. Nothing is sent. Nothing is read from or written to a database.')
console.log(`Owner phone ${OWNER_PHONE}, Meet ${MEET}, video ${VIDEO}`)
rule()

console.log('\nPRE-BOOKING LEAD TEXTS (no time in the copy, identical for every zone)')
rule('-')
const leadCtx = { firstName: FIRST_NAME, businessName: COMPANY, calendarToken: CAL_TOKEN, watchArm: 'A' as const }
printSms('MSG 2 lead text after OTP', leadTextBody(leadCtx))
printSms('MSG 2 fallback: no name, no company', leadTextBody({ calendarToken: CAL_TOKEN, watchArm: 'A' }))
printSms('MSG 3 24h follow-up', followUpBody(leadCtx))
printSms('MSG 3 fallback: no name, no company', followUpBody({ calendarToken: CAL_TOKEN, watchArm: 'A' }))

console.log('\n[MSG 3 send window] 11:00 AM to 7:00 PM ET, earliest allowed send:')
for (const iso of ['2026-09-21T23:00:00-04:00', '2026-09-21T14:30:00-04:00', '2026-09-21T08:15:00-04:00']) {
  const otp = new Date(iso)
  const at = earliestFollowUpAt(otp)
  const hours = at ? ((at.getTime() - otp.getTime()) / 3_600_000).toFixed(1) : '-'
  console.log(`    OTP ${fmt(otp, 'America/New_York')} -> ${at ? fmt(at, 'America/New_York') : 'never'} (${hours}h after OTP)`)
}

console.log('\n[MSG 6 invite title variants]')
const titleCases: [string, string | null, string | null][] = [
  ['name + company', FIRST_NAME, COMPANY],
  ['name only', FIRST_NAME, null],
  ['company only', null, COMPANY],
  ['neither', null, null],
  ['phone placeholder as name + company', '+16165551234', COMPANY],
  ['phone placeholder as name, no company', '+16165551234', null],
]
for (const [label, n, c] of titleCases) {
  console.log(`    ${label.padEnd(40)}${demoInviteTitle(n, c)}`)
}

console.log('\n[MSG 5 email Reply-To]')
for (const e of [OWNER_EMAIL, null, '']) {
  console.log(`    business.ownerEmail=${JSON.stringify(e)} -> ${JSON.stringify(demoEmailEnvelope(e))}`)
}

const phoenix: Record<string, { when: ReturnType<typeof bookerWhen>; timing: Timing }> = {}

for (const date of DATES) {
  for (const zone of ZONES) {
    console.log('\n')
    rule()
    console.log(`${date.label} | ${zone.timeZone ?? 'NO ZONE'} | source=${zone.source ?? 'none'}`)
    rule()
    const r = renderBooking(date.at, date.booked, zone)
    if (zone.timeZone === 'America/Phoenix') phoenix[date.label] = r
  }
}

console.log('\n')
rule()
console.log('SAME-DAY BOOKING, MADE 80 MINUTES BEFORE THE CALL | America/Los_Angeles | source=widget')
rule()
renderBooking(new Date('2026-09-22T20:00:00Z'), new Date('2026-09-22T18:40:00Z'), {
  timeZone: 'America/Los_Angeles',
  source: 'widget',
})

console.log('\n')
rule()
console.log('AMERICA/PHOENIX SIDE BY SIDE (Arizona has no daylight time, so its offset from ET changes)')
rule()
const [sep, jan] = DATES.map((d) => phoenix[d.label])
const rows: [string, string, string][] = [
  ['4:00 PM ET call shows as', sep.when.timeMarked, jan.when.timeMarked],
  ['{date}', sep.when.dateShort, jan.when.dateShort],
  ['night-before', sep.timing.night, jan.timing.night],
  ['hour-before', sep.timing.hour, jan.timing.hour],
]
console.log(`${''.padEnd(26)}${DATES[0].label.padEnd(64)}${DATES[1].label}`)
for (const [k, a, b] of rows) console.log(`${k.padEnd(26)}${a.padEnd(64)}${b}`)
console.log('')
