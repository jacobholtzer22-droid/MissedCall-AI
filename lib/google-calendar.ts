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

  // Only mark connected when a refresh token is actually usable: either Google returned
  // one now, or we still hold one from a previous consent. Without this, a consent that
  // returns only an access token flags the business connected but every later call fails.
  const existing = await db.business.findUnique({
    where: { id: businessId },
    select: { googleRefreshToken: true },
  })
  const hasRefreshToken = Boolean(tokens.refresh_token || existing?.googleRefreshToken)

  const updateData: { googleAccessToken: string | null; googleRefreshToken?: string; googleCalendarConnected: boolean } = {
    googleAccessToken: tokens.access_token ?? null,
    googleCalendarConnected: Boolean(tokens.access_token && hasRefreshToken),
  }
  if (tokens.refresh_token) {
    updateData.googleRefreshToken = tokens.refresh_token
  }

  await db.business.update({
    where: { id: businessId },
    data: updateData,
  })

  if (!updateData.googleCalendarConnected) {
    throw new Error('Google did not return a usable refresh token. Please try connecting again.')
  }

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

  // googleapis types declare refreshAccessToken() as void but it returns credentials at runtime
  type RefreshResult = { credentials: { access_token?: string | null; refresh_token?: string | null } }
  let tokenResult: RefreshResult
  try {
    tokenResult = await oauth2.refreshAccessToken() as unknown as RefreshResult
  } catch (error) {
    console.error('[CALENDAR] OAuth token refresh failed for business', businessId, error)
    try {
      await db.business.update({
        where: { id: businessId },
        data: { googleCalendarConnected: false },
      })
    } catch (e) {
      console.error('[CALENDAR] Failed to flag business as disconnected:', e)
    }
    throw error
  }
  const { credentials } = tokenResult

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

export async function getAvailableSlotsWithMeta(
  businessId: string,
  startStr: string,
  endStr: string
): Promise<{ slots: TimeSlot[]; noMoreAvailabilityToday?: boolean; calendarError?: boolean }> {
  const result = await getAvailableSlotsInternal(businessId, startStr, endStr, false)
  return {
    slots: result.slots,
    noMoreAvailabilityToday: result.noMoreAvailabilityToday,
    calendarError: result.calendarError,
  }
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
): Promise<{ slots: TimeSlot[]; debug?: AvailableSlotsDebug; noMoreAvailabilityToday?: boolean; calendarError?: boolean }> {
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
  console.log('[google-calendar] freebusy range', { startStr, endStr, timezone: tz, timeMin, timeMax })

  let busy: { start: string; end: string }[] = []
  let googleCalendarError: string | undefined

  try {
    busy = await getBusyTimesWithRange(businessId, timeMin, timeMax)
    debug.googleCalendarBusyTimes = busy
  } catch (err) {
    googleCalendarError = err instanceof Error ? err.message : String(err)
    debug.googleCalendarError = googleCalendarError
  }

  // FAIL CLOSED: if we couldn't read the owner's Google Calendar, offer NO slots rather
  // than offering every business-hours slot as free — that would let customers book on
  // top of the owner's existing calendar events. Callers surface this via calendarError.
  if (googleCalendarError !== undefined) {
    console.error('[google-calendar] freebusy unavailable — failing closed (no slots offered):', googleCalendarError)
    return withDebug
      ? { slots: [], debug, calendarError: true }
      : { slots: [], calendarError: true }
  }

  // DB safety net: merge confirmed DB appointments into busy times. Covers appointments
  // that never made it into Google Calendar (calendarSyncFailed rows).
  try {
    const dbAppointments = await db.appointment.findMany({
      where: {
        businessId,
        status: { not: 'cancelled' },
        scheduledAt: {
          gte: new Date(timeMin),
          lte: new Date(timeMax),
        },
      },
      select: { scheduledAt: true, duration: true },
    })
    for (const appt of dbAppointments) {
      busy.push({
        start: appt.scheduledAt.toISOString(),
        end: addMinutes(appt.scheduledAt, appt.duration).toISOString(),
      })
    }
  } catch (dbErr) {
    console.error('[google-calendar] Failed to load DB appointments for busy merge:', dbErr)
  }

  // Expand busy periods by buffer: can't start a slot until buffer minutes after an event ends
  const busyWithBuffer = bufferMins > 0
    ? busy.map(b => ({
        start: b.start,
        end: addMinutes(new Date(b.end), bufferMins).toISOString(),
      }))
    : busy

  const slots: TimeSlot[] = []
  // Use "now" in business timezone for past filter: a slot at "3pm Eastern today" might appear
  // as "tomorrow" in UTC, so we must compare against business-time "now"
  const nowInTz = new TZDate(new Date(), tz)
  const nowMs = nowInTz.getTime()
  let slotsBeforeFiltering = 0
  let slotsAfterPastFilter = 0
  const todayStrTz = `${nowInTz.getFullYear()}-${String(nowInTz.getMonth() + 1).padStart(2, '0')}-${String(nowInTz.getDate()).padStart(2, '0')}`
  let todaySlotsBeforePast = 0
  let todaySlotsAfterPast = 0

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

    const cursorDateStr = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`
    const isToday = cursorDateStr === todayStrTz

    while (slotStart.getTime() < dayEndMs) {
      const slotEnd = addMinutes(slotStart, slotMins)
      if (slotEnd.getTime() <= dayEndMs) {
        slotsBeforeFiltering++
        if (isToday) todaySlotsBeforePast++
        const overlapsBusy = slotOverlapsBusy(slotStart, slotEnd, busyWithBuffer)
        const isPast = slotStart.getTime() < nowMs
        if (!overlapsBusy && !isPast) {
          slotsAfterPastFilter++
          if (isToday) todaySlotsAfterPast++
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

  const noMoreAvailabilityToday =
    startStr === endStr &&
    startStr === todayStrTz &&
    todaySlotsBeforePast > 0 &&
    todaySlotsAfterPast === 0

  return withDebug ? { slots, debug, noMoreAvailabilityToday } : { slots, noMoreAvailabilityToday }
}

/** Check if a specific date/time slot is available. Returns the matching slot if free, null if taken or invalid. */
export async function isSpecificSlotAvailable(
  businessId: string,
  dateStr: string,
  hour: number,
  minute: number,
  tz: string
): Promise<TimeSlot | null> {
  const slots = await getAvailableSlots(businessId, dateStr, dateStr)
  for (const slot of slots) {
    const d = new Date(slot.start)
    const slotHour = parseInt(d.toLocaleTimeString('en-US', { hour: 'numeric', hour12: false, timeZone: tz }), 10)
    const slotMinute = parseInt(d.toLocaleTimeString('en-US', { minute: 'numeric', timeZone: tz }), 10)
    if (slotHour === hour && slotMinute === minute) return slot
  }
  return null
}

/** Get the 2 closest available slots on a day to a target time. Returns up to 2 slots, sorted by proximity. */
export async function getTwoClosestSlotsOnDay(
  businessId: string,
  dateStr: string,
  targetHour: number,
  targetMinute: number,
  tz: string
): Promise<TimeSlot[]> {
  const slots = await getAvailableSlots(businessId, dateStr, dateStr)
  if (slots.length === 0) return []
  const targetMins = targetHour * 60 + targetMinute
  const withDist = slots.map((s) => {
    const d = new Date(s.start)
    const h = parseInt(d.toLocaleTimeString('en-US', { hour: 'numeric', hour12: false, timeZone: tz }), 10)
    const m = parseInt(d.toLocaleTimeString('en-US', { minute: 'numeric', timeZone: tz }), 10)
    const slotMins = h * 60 + m
    return { slot: s, dist: Math.abs(slotMins - targetMins) }
  })
  withDist.sort((a, b) => a.dist - b.dist)
  return withDist.slice(0, 2).map((x) => x.slot)
}

/** Get busy times from Google Calendar freebusy API - used by getAvailableSlots.
 * Throws when the calendar client can't be built (no usable token) so callers fail
 * closed instead of treating an unreadable calendar as a fully free calendar. */
async function getBusyTimesWithRange(
  businessId: string,
  timeMin: string,
  timeMax: string
): Promise<{ start: string; end: string }[]> {
  const calendar = await getCalendarClient(businessId)
  if (!calendar) {
    throw new Error('Google Calendar client unavailable (no usable OAuth token)')
  }

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
  options: { customerEmail?: string | null; notes?: string | null; customerAddress?: string | null; source?: CalendarEventSource } = {}
): Promise<string | null> {
  const { customerEmail, notes, customerAddress, source = 'website' } = options

  const calendar = await getCalendarClient(businessId)
  if (!calendar) return null

  const business = await db.business.findUnique({
    where: { id: businessId },
    select: { timezone: true },
  })
  const tz = business?.timezone ?? 'America/New_York'

  const sourceLabel = source === 'sms' ? '📱 ' : '🌐 '
  const summary = `${sourceLabel}${customerName} - Free Quote (${serviceType})`

  const sourceDesc = source === 'sms' ? 'Source: Missed Call SMS - In-person quote visit' : 'Source: Website - In-person quote visit'
  const descriptionLines = [
    sourceDesc,
    `Customer: ${customerName}`,
    `Phone: ${customerPhone}`,
    customerEmail ? `Email: ${customerEmail}` : null,
    customerAddress ? `Address: ${customerAddress}` : null,
    `Service: ${serviceType}`,
    notes ? `Notes: ${notes}` : null,
    '',
    'Booked via MissedCall AI - Align and Acquire',
  ].filter(Boolean)
  const description = descriptionLines.join('\n')

  const eventBody: { summary: string; description: string; location?: string; start: { dateTime: string; timeZone: string }; end: { dateTime: string; timeZone: string } } = {
    summary,
    description,
    start: { dateTime: start.toISOString(), timeZone: tz },
    end: { dateTime: end.toISOString(), timeZone: tz },
  }
  if (customerAddress?.trim()) {
    eventBody.location = customerAddress.trim()
  }

  const event = await calendar.events.insert({
    calendarId: 'primary',
    requestBody: eventBody,
  })

  return event.data.id ?? null
}

/** Options for marketing (/book) discovery call calendar events. */
export type CreateMarketingCalendarEventOptions = {
  customerPhone: string
  customerEmail?: string | null
  businessName: string
  servicesInterested: string[] // interests from form
  serviceType?: string | null // derived booking type — used in the event title when present
  message?: string | null
  /**
   * Invite the prospect as a Google Calendar attendee. When set, Google emails
   * them a real invite with Yes/No/Maybe and it lands on their own calendar.
   * The event `description` becomes visible to them, so anything private must
   * go in `privateNotes` instead.
   */
  attendeeEmail?: string | null
  /**
   * Owner-only data (ad attribution). Written to extendedProperties.private,
   * which attendees never receive. Deliberately NOT in the description.
   */
  privateNotes?: string | null
}

/**
 * Creates a Google Calendar event for a marketing discovery call booking.
 * Title: "Discovery Call — [customer name]", 15-minute reminder, description with contact/details.
 */
/** Google event id plus the owner-facing link to open it. */
export type MarketingCalendarEventResult = { id: string | null; htmlLink: string | null }

export async function createMarketingCalendarEvent(
  businessId: string,
  start: Date,
  end: Date,
  customerName: string,
  options: CreateMarketingCalendarEventOptions
): Promise<MarketingCalendarEventResult> {
  const {
    customerPhone,
    customerEmail,
    businessName,
    servicesInterested,
    serviceType,
    message,
    attendeeEmail,
    privateNotes,
  } = options

  const calendar = await getCalendarClient(businessId)
  if (!calendar) return { id: null, htmlLink: null }

  const business = await db.business.findUnique({
    where: { id: businessId },
    select: { timezone: true },
  })
  const tz = business?.timezone ?? 'America/New_York'

  const summary = serviceType?.trim()
    ? `${serviceType.trim()} — ${customerName}`
    : `Discovery Call — ${customerName}`
  const descriptionLines = [
    `Name: ${customerName}`,
    `Phone: ${customerPhone}`,
    customerEmail ? `Email: ${customerEmail}` : null,
    `Business: ${businessName}`,
    servicesInterested.length > 0 ? `Services interested in: ${servicesInterested.join(', ')}` : null,
    message?.trim() ? `Message: ${message.trim()}` : null,
    '',
    'Booked via /book (Align and Acquire)',
  ].filter(Boolean)
  const description = descriptionLines.join('\n')

  const invitee = attendeeEmail?.trim()

  const eventBody = {
    summary,
    // Visible to the prospect once they are an attendee. Keep it to what they
    // should see: no ad attribution, no internal notes.
    description,
    start: { dateTime: start.toISOString(), timeZone: tz },
    end: { dateTime: end.toISOString(), timeZone: tz },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup' as const, minutes: 15 },
        { method: 'email' as const, minutes: 15 },
      ],
    },
    ...(invitee
      ? {
          attendees: [{ email: invitee, displayName: customerName }],
          // One prospect per call. Don't leak the guest list or let them add others.
          guestsCanInviteOthers: false,
          guestsCanSeeOtherGuests: false,
          guestsCanModify: false,
        }
      : {}),
    ...(privateNotes?.trim()
      ? {
          extendedProperties: {
            // Owner-only. Not delivered to attendees in the invite.
            private: { attribution: privateNotes.trim().slice(0, 1024) },
          },
        }
      : {}),
  }

  const event = await calendar.events.insert({
    calendarId: 'primary',
    requestBody: eventBody,
    // 'all' makes Google actually email the invite. Without it the attendee is
    // attached silently and never hears about it.
    sendUpdates: invitee ? 'all' : 'none',
  })

  return { id: event.data.id ?? null, htmlLink: event.data.htmlLink ?? null }
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
