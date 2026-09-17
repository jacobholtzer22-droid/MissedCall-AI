// ===========================================
// /book AVAILABILITY (read only)
// ===========================================
// Serves the slot list the funnel calendar renders. Both arms fetch it.
//
// There is deliberately NO POST here. Bookings are written by /api/demo-book,
// which is what BookingWizard and DateCalendar actually call. This route used to
// carry a second, unreachable POST that duplicated the appointment insert, the
// calendar event and the confirmation SMS; it drifted from the live path and was
// removed. A POST now returns 405 from Next rather than writing a booking
// through code nobody exercises.
//
// Slot rules come from lib/marketing-slots.ts. Nothing here hardcodes an hour,
// a step or a window.

import { NextRequest, NextResponse } from 'next/server'
import { TZDate } from '@date-fns/tz'
import { addMinutes } from 'date-fns'
import { getBusyTimes } from '@/lib/google-calendar'
import {
  TIMEZONE,
  START_HOUR,
  lastSlotOffsetMinutes,
  SLOT_MINUTES,
  SLOT_STEP_MINUTES,
  MAX_DAYS_AHEAD,
  getNowInTz,
  isWithinBookingWindow,
  isWithinHours,
  isValidSlotStart,
  formatDisplay,
  sameDay,
  getExistingAppointmentsForRange,
  overlapsWithExisting,
  overlapsWithBusy,
} from '@/lib/marketing-slots'
import { getMarketingBusiness } from '@/lib/marketing-funnel'

// Availability changes with every booking and every calendar edit, so this must
// be computed per request. Without these, Next 14 prerenders a GET-only route
// that never reads the request at BUILD time: the slot list froze at the
// moment of each deploy and Vercel's edge served it from cache. The POST that
// used to live here was silently keeping the route dynamic; removing it
// (ed29979) is what froze the list.
export const dynamic = 'force-dynamic'
export const revalidate = 0

/** No layer (edge, browser, proxy) may keep a copy of the slot list. */
const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' }


type BookingPayload = {
  name: string
  phone: string
  email: string
  businessName: string
  // Pre-qualification answers from /book (marketing flow only)
  tradeType?: string // Q1: what kind of business
  missedCalls?: string // Q2: how many calls missed per week
  whoAnswers?: string // Q3: who answers the phone now
  extraNeeds?: string[] // contact step: optional "what are you interested in"
  interests?: string[] // legacy field — superseded by extraNeeds
  notes?: string
  smsConsent: boolean
  slotStart: string // ISO string in ET
  partialLeadId?: string // WebsiteLead row created at the contact step
  attribution?: unknown // utm_* + fbclid captured on landing
}

// Kept in sync with EXTRA_NEEDS_OPTIONS / JUST_AI_OPTION in app/book/page.tsx
const JUST_AI_OPTION = 'Just the Missed-Call AI system'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Build the appointment serviceType / calendar event title from the Step 4
 * "anything else" answers (marketing booking only).
 *  - only "Just the Missed-Call AI system" (or nothing extra) → "Missed Call AI"
 *  - additional services selected → "Consultation — interested in: Missed Call AI + [...]"
 *  - field absent / malformed → "General Consultation"
 */
function deriveServiceType(extraNeeds: unknown): string {
  if (!Array.isArray(extraNeeds)) return 'General Consultation'
  const additional = extraNeeds
    .filter((s): s is string => typeof s === 'string')
    .map((s) => s.trim())
    .filter((s) => s && s !== JUST_AI_OPTION)
  if (additional.length === 0) return 'Missed Call AI'
  return `Consultation — interested in: Missed Call AI + ${additional.join(', ')}`
}

/**
 * Read Google Calendar busy windows for the range. Fails CLOSED, matching the
 * tenant booking flow: if the calendar cannot be read we refuse to offer slots
 * rather than treating an unreadable calendar as a free one.
 * Returns null when the calendar is unreadable.
 */
async function readBusyOrNull(
  business: { id: string; googleCalendarConnected: boolean },
  start: Date,
  end: Date
): Promise<{ start: string; end: string }[] | null> {
  if (!business.googleCalendarConnected) return []
  try {
    return await getBusyTimes(business.id, start, end)
  } catch (err) {
    console.error(
      '[marketing-bookings] Google free/busy read failed, failing closed:',
      err instanceof Error ? err.message : String(err)
    )
    return null
  }
}

export async function GET(request: NextRequest) {
  try {
    const now = getNowInTz()
    const startOfToday = new TZDate(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      0,
      0,
      0,
      0,
      TIMEZONE
    )
    const endOfRange = new TZDate(
      startOfToday.getFullYear(),
      startOfToday.getMonth(),
      startOfToday.getDate() + MAX_DAYS_AHEAD,
      23,
      59,
      59,
      999,
      TIMEZONE
    )

    const business = await getMarketingBusiness()
    if (!business) {
      console.error('Marketing availability: no business configured.')
      return NextResponse.json({ days: [], calendarUnavailable: true }, { headers: NO_STORE })
    }

    const existing = await getExistingAppointmentsForRange(business.id, startOfToday, endOfRange)

    const busy = await readBusyOrNull(business, startOfToday, endOfRange)
    if (busy === null) {
      // Fail closed. Better to show no times than to double-book Jacob.
      return NextResponse.json({ days: [], calendarUnavailable: true }, { headers: NO_STORE })
    }

    const days: {
      date: string
      isToday: boolean
      label: string
      timezoneLabel: string
      slots: { iso: string; display: string }[]
    }[] = []

    for (let i = 0; i <= MAX_DAYS_AHEAD; i++) {
      const day = new TZDate(
        startOfToday.getFullYear(),
        startOfToday.getMonth(),
        startOfToday.getDate() + i,
        0,
        0,
        0,
        0,
        TIMEZONE
      )

      const label = day.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        timeZone: TIMEZONE,
      })
      const dateStr = day.toISOString().slice(0, 10)

      const slots: { iso: string; display: string }[] = []

      // Slots every 30 min (15 min demo + 15 min buffer): 8:00, 8:30, 9:00 ... 7:30 PM
      const firstSlot = new TZDate(
        day.getFullYear(),
        day.getMonth(),
        day.getDate(),
        START_HOUR,
        0,
        0,
        0,
        TIMEZONE
      )
      const lastSlotStart = new Date(
        firstSlot.getTime() + lastSlotOffsetMinutes() * 60 * 1000
      )

      let cursor = new Date(firstSlot.getTime())

      while (cursor.getTime() <= lastSlotStart.getTime()) {
        const slotStart = new Date(cursor.getTime())
        const slotEnd = addMinutes(slotStart, SLOT_MINUTES)

        if (!isWithinBookingWindow(slotStart)) {
          cursor = addMinutes(cursor, SLOT_STEP_MINUTES)
          continue
        }

        if (!isWithinHours(slotStart, slotEnd)) {
          cursor = addMinutes(cursor, SLOT_STEP_MINUTES)
          continue
        }

        if (!isValidSlotStart(slotStart)) {
          cursor = addMinutes(cursor, SLOT_STEP_MINUTES)
          continue
        }

        if (overlapsWithExisting(slotStart, slotEnd, existing)) {
          cursor = addMinutes(cursor, SLOT_STEP_MINUTES)
          continue
        }

        if (overlapsWithBusy(slotStart, slotEnd, busy)) {
          cursor = addMinutes(cursor, SLOT_STEP_MINUTES)
          continue
        }

        slots.push({
          iso: slotStart.toISOString(),
          display: formatDisplay(slotStart),
        })

        cursor = addMinutes(cursor, SLOT_STEP_MINUTES)
      }

      days.push({
        date: dateStr,
        isToday: sameDay(day, now),
        label,
        timezoneLabel: 'Eastern Time (ET)',
        slots,
      })
    }

    return NextResponse.json({ days }, { headers: NO_STORE })
  } catch (error) {
    console.error('Marketing bookings availability error:', error)
    return NextResponse.json({ error: 'Failed to load availability' }, { status: 500, headers: NO_STORE })
  }
}
