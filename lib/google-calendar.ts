// ===========================================
// GOOGLE CALENDAR HELPERS
// ===========================================
// Token refresh, OAuth, and Calendar API helpers

import { google } from 'googleapis'
import { db } from '@/lib/db'

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

// Default business hours: Mon-Fri 9am-5pm
export const DEFAULT_BUSINESS_HOURS: Record<string, { open: string; close: string } | null> = {
  monday: { open: '09:00', close: '17:00' },
  tuesday: { open: '09:00', close: '17:00' },
  wednesday: { open: '09:00', close: '17:00' },
  thursday: { open: '09:00', close: '17:00' },
  friday: { open: '09:00', close: '17:00' },
  saturday: null,
  sunday: null,
}

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
        result[day] = null
      }
    } else {
      result[day] = null
    }
  }

  return { ...DEFAULT_BUSINESS_HOURS, ...result }
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

export async function getAvailableSlots(
  businessId: string,
  startDate: Date,
  endDate: Date
): Promise<TimeSlot[]> {
  const business = await db.business.findUnique({
    where: { id: businessId },
    select: { businessHours: true, slotDurationMinutes: true, timezone: true, googleCalendarConnected: true },
  })
  if (!business?.googleCalendarConnected) return []

  const hours = parseBusinessHours(business.businessHours)
  const slotMins = business.slotDurationMinutes ?? 30
  const tz = business.timezone ?? 'America/New_York'

  const busy = await getBusyTimes(businessId, startDate, endDate)
  const slots: TimeSlot[] = []
  const cursor = new Date(startDate)
  cursor.setHours(0, 0, 0, 0)

  while (cursor <= endDate) {
    const dayName = DAY_NAMES[cursor.getDay()]
    const dayHours = hours[dayName]
    if (!dayHours) {
      cursor.setDate(cursor.getDate() + 1)
      continue
    }

    const [openH, openM] = dayHours.open.split(':').map(Number)
    const [closeH, closeM] = dayHours.close.split(':').map(Number)
    const dayStart = new Date(cursor)
    dayStart.setHours(openH, openM, 0, 0)
    const dayEnd = new Date(cursor)
    dayEnd.setHours(closeH, closeM, 0, 0)

    let slotStart = new Date(dayStart)
    while (slotStart < dayEnd) {
      const slotEnd = new Date(slotStart.getTime() + slotMins * 60 * 1000)
      if (slotEnd <= dayEnd && !slotOverlapsBusy(slotStart, slotEnd, busy) && slotStart >= new Date()) {
        slots.push({
          start: slotStart.toISOString(),
          end: slotEnd.toISOString(),
          display: slotStart.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
        })
      }
      slotStart = slotEnd
    }
    cursor.setDate(cursor.getDate() + 1)
  }

  return slots
}

export async function getBusyTimes(
  businessId: string,
  startDate: Date,
  endDate: Date
): Promise<{ start: string; end: string }[]> {
  const calendar = await getCalendarClient(businessId)
  if (!calendar) return []

  const business = await db.business.findUnique({
    where: { id: businessId },
    select: { timezone: true },
  })
  const tz = business?.timezone ?? 'America/New_York'

  const freeBusy = await calendar.freebusy.query({
    requestBody: {
      timeMin: startDate.toISOString(),
      timeMax: endDate.toISOString(),
      items: [{ id: 'primary' }],
    },
  })

  const busy = freeBusy.data.calendars?.primary?.busy ?? []
  return busy.map(b => ({ start: b.start!, end: b.end! }))
}

export async function createCalendarEvent(
  businessId: string,
  start: Date,
  end: Date,
  summary: string,
  description: string
): Promise<string | null> {
  const calendar = await getCalendarClient(businessId)
  if (!calendar) return null

  const business = await db.business.findUnique({
    where: { id: businessId },
    select: { timezone: true },
  })
  const tz = business?.timezone ?? 'America/New_York'

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
