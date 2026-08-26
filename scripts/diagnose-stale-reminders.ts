// ===========================================
// DIAGNOSTIC: why do cancelled bookings still get reminder texts?
// ===========================================
// Read-only. Sends nothing, writes nothing.
//
// Distinguishes the two candidate causes:
//   A: cancelled in-app, DB says 'cancelled', but the reminder never rechecked
//      status at send time.
//   B: cancelled directly in Google Calendar, the DB never learned, status is
//      still 'confirmed', and the reminder fires against stale state.
//
// Run: npx tsx scripts/diagnose-stale-reminders.ts

import * as dotenv from 'dotenv'
import { PrismaClient } from '@prisma/client'
import { google } from 'googleapis'

// lib/google-calendar.ts imports 'server-only', which cannot load under tsx, so
// the Google client is rebuilt here from the same stored OAuth tokens.
async function makeCalendar(refreshToken: string, accessToken: string | null) {
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )
  oauth2.setCredentials({ refresh_token: refreshToken, access_token: accessToken ?? undefined })
  return google.calendar({ version: 'v3', auth: oauth2 })
}

dotenv.config({ path: '.env' })
const db = new PrismaClient()

async function main() {
  const businessId = process.env.MARKETING_BUSINESS_ID
  if (!businessId) throw new Error('MARKETING_BUSINESS_ID not set')

  const business = await db.business.findUnique({
    where: { id: businessId },
    select: { name: true, googleCalendarConnected: true, googleRefreshToken: true, googleAccessToken: true },
  })
  if (!business?.googleRefreshToken) throw new Error('No Google refresh token on the marketing business')
  const calendar = await makeCalendar(business.googleRefreshToken, business.googleAccessToken)
  console.log(`Business: ${business?.name} (calendar connected: ${business?.googleCalendarConnected})`)
  console.log('')

  // ── Evidence for A ────────────────────────────────────────────────────────
  // A cancelled booking that already has a reminder flag set means a text went
  // out and THEN it was cancelled, or it was cancelled and texted anyway.
  const cancelledWithReminders = await db.appointment.findMany({
    where: {
      businessId,
      status: { in: ['cancelled', 'canceled'] },
      OR: [
        { reminderNightBeforeSentAt: { not: null } },
        { reminderHourBeforeSentAt: { not: null } },
      ],
    },
    select: {
      id: true, customerName: true, scheduledAt: true, updatedAt: true,
      reminderNightBeforeSentAt: true, reminderHourBeforeSentAt: true,
    },
    orderBy: { scheduledAt: 'desc' },
  })

  console.log('=== SCENARIO A: cancelled in-app, reminder flag already set ===')
  console.log(`matches: ${cancelledWithReminders.length}`)
  for (const a of cancelledWithReminders) {
    const night = a.reminderNightBeforeSentAt
    const hour = a.reminderHourBeforeSentAt
    // If the reminder timestamp is AFTER the cancellation, the send raced the cancel.
    const sentAfterCancel = [night, hour].some((t) => t && t.getTime() > a.updatedAt.getTime())
    console.log(
      `  ${a.id} ${JSON.stringify(a.customerName)} scheduled=${a.scheduledAt.toISOString().slice(0, 16)} ` +
        `cancelledAt~=${a.updatedAt.toISOString().slice(0, 16)} ` +
        `night=${night ? night.toISOString().slice(0, 16) : '-'} hour=${hour ? hour.toISOString().slice(0, 16) : '-'} ` +
        `${sentAfterCancel ? '<-- SENT AFTER CANCEL' : ''}`
    )
  }
  console.log('')

  // ── Evidence for B ────────────────────────────────────────────────────────
  // Confirmed + upcoming, but the Google event is gone. Only a direct Google
  // cancellation produces this state.
  const confirmedUpcoming = await db.appointment.findMany({
    where: {
      businessId,
      status: 'confirmed',
      scheduledAt: { gt: new Date() },
      googleCalendarEventId: { not: null },
    },
    select: {
      id: true, customerName: true, scheduledAt: true, googleCalendarEventId: true,
      reminderNightBeforeSentAt: true, reminderHourBeforeSentAt: true,
    },
    orderBy: { scheduledAt: 'asc' },
  })

  console.log('=== SCENARIO B: DB says confirmed, checking Google for each ===')
  console.log(`upcoming confirmed bookings with a Google event id: ${confirmedUpcoming.length}`)
  let ghosts = 0
  for (const a of confirmedUpcoming) {
    let exists = true
    let cancelledInGoogle = false
    try {
      const ev = await calendar.events.get({ calendarId: 'primary', eventId: a.googleCalendarEventId! })
      // Google keeps cancelled events retrievable with status 'cancelled'.
      if (ev.data.status === 'cancelled') { exists = false; cancelledInGoogle = true }
    } catch {
      exists = false
    }
    if (!exists) {
      ghosts++
      console.log(
        `  GHOST ${a.id} ${JSON.stringify(a.customerName)} scheduled=${a.scheduledAt.toISOString().slice(0, 16)} ` +
          `-- DB confirmed, Google says ${cancelledInGoogle ? "'cancelled'" : 'not found'}. Reminders WILL fire.`
      )
    }
  }
  if (ghosts === 0) console.log('  no ghosts: every confirmed upcoming booking still exists in Google')
  console.log('')

  console.log('=== VERDICT ===')
  const aHits = cancelledWithReminders.length
  if (aHits === 0 && ghosts === 0) {
    console.log('Neither pattern is present in current data.')
    console.log('The reminder system shipped recently, so there may simply be no history yet.')
  } else {
    if (aHits > 0) console.log(`A present: ${aHits} cancelled booking(s) carry reminder flags.`)
    if (ghosts > 0) console.log(`B present: ${ghosts} booking(s) are confirmed in the DB but gone from Google.`)
  }

  await db.$disconnect()
}

main().catch((e) => {
  console.error('ERROR:', e instanceof Error ? e.message : e)
  process.exit(1)
})
