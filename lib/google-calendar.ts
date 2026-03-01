// ===========================================
// GOOGLE CALENDAR HELPERS
// ===========================================
// Token refresh, OAuth, and Calendar API helpers
// Server-only: uses Node.js modules (googleapis) - never import in client components

import 'server-only'
import { google } from 'googleapis'
import { addMinutes } from 'date-fns'
import { TZDate } from '@date-fns/tz'
import { db } from '@/lib/db'
import { DEFAULT_BUSINESS_HOURS } from '@/lib/business-hours'

const SCOPES = ['https://www.googleapis.com/auth/calendar']
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI!

export function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    REDIRECT_URI
  )
}

export function getAuthUrl(state: string): string {
  const oauth2 = getOAuth2Client()
  return oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // Force consent to get refresh token every time
    scope: SCOPES,
    state,
  })
}

export async function exchangeCodeForTokens(code: string, businessId: string) {
  const oauth2 = getOAuth2Client()
  const { tokens } = await oauth2.getToken(code)

  const updateData: { googleAccessToken: string | null; googleRefreshToken?: string; googleCalendarConnected: boolean } = {
    googleAccessToken: tokens.access_token ?? null,
    googleCalendarConnected: !!(tokens.access_token && (tokens.refresh_token ?? true)),
  }
  if (tokens.refresh_token) {
    updateData.googleRefreshToken = tokens.refresh_token
  }

  await db.business.update({
    where: { id: businessId },
    data: updateData,
  })

  return tokens
}

export async function getValidAccessToken(businessId: string): Promise<string | null> {
  const business = await db.business.findUnique({
    where: { id: businessId },
    select: { googleAccessToken: true, googleRefreshToken: true },
  })

  if (!business?.googleRefreshToken) return null

  const oauth2 = getOAuth2Client()
  oauth2.setCredentials({
    access_token: business.googleAccessToken,
    refresh_token: business.googleRefreshToken,
  })

  const { credentials } = await oauth2.refreshAccessToken()

  if (credentials.access_token) {
    await db.business.update({
      where: { id: businessId },
      data: {
        googleAccessToken: credentials.access_token,
        googleRefreshToken: credentials.refresh_token ?? business.googleRefreshToken,
      },
    })
    return credentials.access_token
  }

  return null
}

export async function getCalendarClient(businessId: string) {
  const accessToken = await getValidAccessToken(businessId)
  if (!accessToken) return null

  const oauth2 = getOAuth2Client()
  oauth2.setCredentials({ access_token: accessToken })

  return google.calendar({ version: 'v3', auth: oauth2 })
}

// Re-export for server-side consumers that already import from this file
export { DEFAULT_BUSINESS_HOURS } from '@/lib/business-hours'

export function parseBusinessHours(hours: unknown): Record<string, { open: string; close: string } | null> {
  if (!hours || typeof hours !== 'object') return DEFAULT_BUSINESS_HOURS

  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  const result: Record<string, { open: string; close: string } | null> = {}

  for (const day of days) {
    const dayData = (hours as Record<string, unknown>)[day]
    if (dayData && typeof dayData === 'object' && dayData !== null && 'open' in dayData && 'close' in dayData) {
      const d = dayData as { open: string; close: string }
      if (typeof d.open === 'string' && typeof d.close === 'string') {
        result[day] = { open: d.open, close: d.close }
      } else {
        // Invalid format: fall back to default for this day
        result[day] = DEFAULT_BUSINESS_HOURS[day]
      }
    } else {
      // Null/empty: use default for this day (Mon-Fri 9-5, Sat-Sun closed)
      result[day] = DEFAULT_BUSINESS_HOURS[day]
    }
  }

  return result
}

export interface TimeSlot {
  start: string // ISO datetime
  end: string
  display: string // e.g. "9:00 AM"
}

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const

function slotOverlapsBusy(
  slotStart: Date,
  slotEnd: Date,
  busy: { start: string; end: string }[]
): boolean {
  const slotStartMs = slotStart.getTime()
  const slotEndMs = slotEnd.getTime()
  for (const b of busy) {
    const bStart = new Date(b.start).getTime()
    const bEnd = new Date(b.end).getTime()
    if (slotStartMs < bEnd && slotEndMs > bStart) return true
  }
  return false
}

/** Parse YYYY-MM-DD into year, month (1-12), day for TZDate (month 0-indexed in constructor) */
function parseDateString(dateStr: string): { year: number; month: number; day: number } | null {
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  return { year: parseInt(m[1], 10), month: parseInt(m[2], 10) - 1, day: parseInt(m[3], 10) }
}

/**
 * Availability logic: Business hours minus Google Calendar conflicts = available slots.
 * All date logic uses the business's timezone.
 * Accepts Date or YYYY-MM-DD strings. When given Dates, extracts date in UTC for consistency.
 */
export async function getAvailableSlots(
  businessId: string,
  startDate: Date | string,
  endDate: Date | string
): Promise<TimeSlot[]> {
  const startStr = typeof startDate === 'string' ? startDate.slice(0, 10) : startDate.toISOString().slice(0, 10)
  const endStr = typeof endDate === 'string' ? endDate.slice(0, 10) : endDate.toISOString().slice(0, 10)
  const result = await getAvailableSlotsInternal(businessId, startStr, endStr, false)
  return result.slots
}

export interface AvailableSlotsDebug {
  businessId: string
  businessSlug?: string
  calendarEnabled: boolean
  googleCalendarConnected: boolean
  tokensExist: boolean
  businessHours: Record<string, { open: string; close: string } | null>
  timezone: string
  dateRangeQueried: { start: string; end: string }
  timeMin: string
  timeMax: string
  googleCalendarBusyTimes: { start: string; end: string }[]
  googleCalendarError?: string
  slotsBeforeFiltering: number
  slotsAfterPastFilter: number
  finalSlotCount: number
  finalSlots: TimeSlot[]
}

export async function getAvailableSlotsWithDebug(
  businessId: string,
  startStr: string,
  endStr: string,
  businessSlug?: string
): Promise<{ slots: TimeSlot[]; debug: AvailableSlotsDebug }> {
  const result = await getAvailableSlotsInternal(businessId, startStr, endStr, true, businessSlug)
  return { slots: result.slots, debug: result.debug! }
}

async function getAvailableSlotsInternal(
  businessId: string,
  startStr: string,
  endStr: string,
  withDebug: boolean,
  businessSlug?: string
): Promise<{ slots: TimeSlot[]; debug?: AvailableSlotsDebug }> {
  const business = await db.business.findUnique({
    where: { id: businessId },
    select: {
      businessHours: true,
      slotDurationMinutes: true,
      bufferMinutes: true,
      timezone: true,
      googleCalendarConnected: true,
      calendarEnabled: true,
      googleAccessToken: true,
      googleRefreshToken: true,
    },
  })

  const tz = business?.timezone ?? 'America/New_York'
  const hours = parseBusinessHours(business?.businessHours)
  const slotMins = business?.slotDurationMinutes ?? 30
  const bufferMins = business?.bufferMinutes ?? 0
  const tokensExist = !!(business?.googleAccessToken || business?.googleRefreshToken)

  const debug: AvailableSlotsDebug = {
    businessId,
    businessSlug,
    calendarEnabled: !!business?.calendarEnabled,
    googleCalendarConnected: !!business?.googleCalendarConnected,
    tokensExist,
    businessHours: hours,
    timezone: tz,
    dateRangeQueried: { start: startStr, end: endStr },
    timeMin: '',
    timeMax: '',
    googleCalendarBusyTimes: [],
    slotsBeforeFiltering: 0,
    slotsAfterPastFilter: 0,
    finalSlotCount: 0,
    finalSlots: [],
  }

  if (!business?.googleCalendarConnected) {
    return withDebug ? { slots: [], debug } : { slots: [] }
  }

  // Build timeMin/timeMax in business TZ: start-of-day to end-of-day for the date range
  const startParsed = parseDateString(startStr)
  const endParsed = parseDateString(endStr)
  if (!startParsed || !endParsed) {
    return withDebug ? { slots: [], debug } : { slots: [] }
  }

  const timeMinTZ = new TZDate(startParsed.year, startParsed.month, startParsed.day, 0, 0, 0, 0, tz)
  const timeMaxTZ = new TZDate(endParsed.year, endParsed.month, endParsed.day, 23, 59, 59, 999, tz)
  const timeMin = timeMinTZ.toISOString()!
  const timeMax = timeMaxTZ.toISOString()!

  debug.timeMin = timeMin
  debug.timeMax = timeMax

  let busy: { start: string; end: string }[] = []
  let googleCalendarError: string | undefined

  try {
    busy = await getBusyTimesWithRange(businessId, timeMin, timeMax)
    debug.googleCalendarBusyTimes = busy
  } catch (err) {
    googleCalendarError = err instanceof Error ? err.message : String(err)
    debug.googleCalendarError = googleCalendarError
  }

  // Expand busy periods by buffer: can't start a slot until buffer minutes after an event ends
  const busyWithBuffer = bufferMins > 0
    ? busy.map(b => ({
        start: b.start,
        end: addMinutes(new Date(b.end), bufferMins).toISOString(),
      }))
    : busy

  const slots: TimeSlot[] = []
  const now = new Date()
  let slotsBeforeFiltering = 0
  let slotsAfterPastFilter = 0

  const slotStepMins = slotMins + bufferMins // next slot starts slotMins + bufferMins after previous

  const cursor = new TZDate(startParsed.year, startParsed.month, startParsed.day, 0, 0, 0, 0, tz)
  const endCursor = new TZDate(endParsed.year, endParsed.month, endParsed.day, 23, 59, 59, 999, tz)

  while (cursor <= endCursor) {
    const dayName = DAY_NAMES[cursor.getDay()]
    const dayHours = hours[dayName]
    if (!dayHours) {
      cursor.setDate(cursor.getDate() + 1)
      continue
    }

    const [openH, openM] = dayHours.open.split(':').map(Number)
    const [closeH, closeM] = dayHours.close.split(':').map(Number)
    const dayStart = new TZDate(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), openH, openM, 0, 0, tz)
    const dayEnd = new TZDate(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), closeH, closeM, 0, 0, tz)

    let slotStart = new Date(dayStart.getTime())
    const dayEndMs = dayEnd.getTime()

    while (slotStart.getTime() < dayEndMs) {
      const slotEnd = addMinutes(slotStart, slotMins)
      if (slotEnd.getTime() <= dayEndMs) {
        slotsBeforeFiltering++
        const overlapsBusy = slotOverlapsBusy(slotStart, slotEnd, busyWithBuffer)
        const isPast = slotStart < now
        if (!overlapsBusy && !isPast) {
          slotsAfterPastFilter++
          slots.push({
            start: slotStart.toISOString(),
            end: slotEnd.toISOString(),
            display: slotStart.toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
              timeZone: tz,
            }),
          })
        }
      }
      slotStart = addMinutes(slotStart, slotStepMins)
    }
    cursor.setDate(cursor.getDate() + 1)
  }

  debug.slotsBeforeFiltering = slotsBeforeFiltering
  debug.slotsAfterPastFilter = slotsAfterPastFilter
  debug.finalSlotCount = slots.length
  debug.finalSlots = slots

  return withDebug ? { slots, debug } : { slots }
}

/** Get busy times from Google Calendar freebusy API - used by getAvailableSlots */
async function getBusyTimesWithRange(
  businessId: string,
  timeMin: string,
  timeMax: string
): Promise<{ start: string; end: string }[]> {
  const calendar = await getCalendarClient(businessId)
  if (!calendar) return []

  const freeBusy = await calendar.freebusy.query({
    requestBody: {
      timeMin,
      timeMax,
      items: [{ id: 'primary' }],
    },
  })

  const busy = freeBusy.data.calendars?.primary?.busy ?? []
  return busy.map(b => ({ start: b.start!, end: b.end! }))
}

export async function getBusyTimes(
  businessId: string,
  startDate: Date,
  endDate: Date
): Promise<{ start: string; end: string }[]> {
  const timeMin = startDate.toISOString()
  const timeMax = endDate.toISOString()
  return getBusyTimesWithRange(businessId, timeMin, timeMax)
}

export type CalendarEventSource = 'website' | 'sms'

export async function createCalendarEvent(
  businessId: string,
  start: Date,
  end: Date,
  customerName: string,
  serviceType: string,
  customerPhone: string,
  options: { customerEmail?: string | null; notes?: string | null; source?: CalendarEventSource } = {}
): Promise<string | null> {
  const { customerEmail, notes, source = 'website' } = options

  const calendar = await getCalendarClient(businessId)
  if (!calendar) return null

  const business = await db.business.findUnique({
    where: { id: businessId },
    select: { timezone: true },
  })
  const tz = business?.timezone ?? 'America/New_York'

  const sourceLabel = source === 'sms' ? '📱 Missed Call Lead' : '🌐 Website Lead'
  const summary = `${sourceLabel} ${customerName} - ${serviceType}`

  const sourceDesc = source === 'sms' ? 'Source: Missed Call SMS Booking' : 'Source: Website Booking'
  const descriptionLines = [
    sourceDesc,
    `Customer: ${customerName}`,
    `Phone: ${customerPhone}`,
    customerEmail ? `Email: ${customerEmail}` : null,
    `Service: ${serviceType}`,
    notes ? `Notes: ${notes}` : null,
    '',
    'Booked via MissedCall AI - Align and Acquire',
  ].filter(Boolean)
  const description = descriptionLines.join('\n')

  const event = await calendar.events.insert({
    calendarId: 'primary',
    requestBody: {
      summary,
      description,
      start: { dateTime: start.toISOString(), timeZone: tz },
      end: { dateTime: end.toISOString(), timeZone: tz },
    },
  })

  return event.data.id ?? null
}

export async function deleteCalendarEvent(businessId: string, eventId: string): Promise<boolean> {
  const calendar = await getCalendarClient(businessId)
  if (!calendar) return false

  try {
    await calendar.events.delete({ calendarId: 'primary', eventId })
    return true
  } catch {
    return false
  }
}

/** Returns true if the event exists in Google Calendar, false if not found or error */
export async function calendarEventExists(businessId: string, eventId: string): Promise<boolean> {
  const calendar = await getCalendarClient(businessId)
  if (!calendar) return false

  try {
    await calendar.events.get({ calendarId: 'primary', eventId })
    return true
  } catch {
    return false
  }
}
