// ===========================================
// SHARED BOOKING CREATION
// ===========================================
// Creates appointment in DB, Google Calendar event (if connected), sends confirmation SMS, notifies owner.
// Used by /api/bookings/create and SMS webhook to ensure consistent behavior.

import { TZDate } from '@date-fns/tz'
import { db } from '@/lib/db'
import Telnyx from 'telnyx'
import { createCalendarEvent, getAvailableSlotsWithMeta } from '@/lib/google-calendar'
import { notifyOwnerOnBookingCreated } from '@/lib/notify-owner'
import { recordMessageSent } from '@/lib/sms-cooldown'
import type { Business } from '@prisma/client'

/** Thrown inside the booking transaction to signal a 409 conflict (not a server error). */
class BookingConflictError extends Error {}

/** Format date as "Friday, March 6th" for clear SMS confirmation. */
function formatDateFullForConfirm(d: Date, tz: string): string {
  const day = parseInt(d.toLocaleDateString('en-CA', { day: 'numeric', timeZone: tz }), 10)
  const ordinal = (n: number) => {
    const s = ['th', 'st', 'nd', 'rd']
    const v = n % 100
    return n + (s[(v - 20) % 10] || s[v] || s[0])
  }
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long', timeZone: tz })
  const month = d.toLocaleDateString('en-US', { month: 'long', timeZone: tz })
  return `${weekday}, ${month} ${ordinal(day)}`
}

/** Clean service for owner-facing use (notifications, calendar, dashboard): "your lawn" → "lawn", "my patio" → "patio". Strip "my", "the", "your", "I need", "I want" but keep the actual service description. Exported for use in lead capture flow. */
export function cleanServiceForOwner(service: string): string {
  let s = service.trim()
  if (!s || s.length > 100) return 'Free quote'
  // Pass through generic phrases
  if (/^(?:a\s+free\s+in-person\s+quote|an?\s+estimate|an?\s+consultation|quote\s+visit|appointment)$/i.test(s)) {
    return 'Free quote'
  }
  // Strip "your ", "my ", "the " prefix
  s = s.replace(/^(?:your|my|the)\s+/i, '').trim()
  // Strip "I need ...", "I want ..." and similar
  s = s.replace(/^(?:i\s+)?(?:need|want)\s+(?:a\s+)?(?:quote\s+)?(?:for\s+)?(?:my|the)?\s*/gi, '').trim()
  if (s.length >= 2 && s.length <= 80) {
    return s.charAt(0).toUpperCase() + s.slice(1)
  }
  return 'Free quote'
}

/** Clean garbled service text for confirmation: "a quote for to book a quote for my lawn" → "your lawn". Pass through defaults like "a free in-person quote". */
function cleanServiceForConfirmation(service: string): string {
  let s = service.trim()
  if (!s || s.length > 100) return 'a free in-person quote'
  // Pass through default / generic phrases as-is
  if (/^(?:a\s+free\s+in-person\s+quote|an?\s+estimate|an?\s+consultation|quote\s+visit|appointment)$/i.test(s)) {
    return 'a free in-person quote'
  }
  // Extract "my lawn", "the patio", "your driveway" etc. — avoid echoing "a quote for to book a quote for"
  const myMatch = s.match(/(?:my|the)\s+([^.?!]{2,40}?)(?:\s+(?:work|quote|visit))?\.?$/i)
  if (myMatch) return 'your ' + myMatch[1].trim().replace(/^(my|the)\s+/i, '')
  const yourMatch = s.match(/your\s+([^.?!]{2,40}?)(?:\s+(?:work|quote|visit))?\.?$/i)
  if (yourMatch) return 'your ' + yourMatch[1].trim()
  // Strip common filler then take what remains
  s = s
    .replace(/\b(?:a\s+)?quote\s+(?:for|on|about)\s+/gi, '')
    .replace(/\bto\s+book\s+(?:a\s+)?(?:quote\s+)?(?:for\s+)?/gi, '')
    .replace(/\b(?:for|on|about)\s+(?:my|the)\s+/gi, '')
  s = s.replace(/^\s*(?:your|the)\s+/i, '').trim()
  if (s.length >= 2 && s.length <= 50) return /^your\s/i.test(s) ? s : 'your ' + s
  return 'a free in-person quote'
}

export type CreateBookingParams = {
  business: Business
  customerName: string
  customerPhone: string
  customerEmail?: string | null
  slotStart: string | Date
  serviceType: string
  notes?: string | null
  customerAddress?: string | null
  conversationId?: string | null
  /** When true, skip slot availability check (e.g. AI path) - still creates appointment */
  skipSlotVerification?: boolean
  /** When true, allow creating even if googleCalendarConnected is false (e.g. AI path when calendar off) */
  allowWithoutCalendar?: boolean
  /** Log prefix for debugging - e.g. "[SMS BOOKING]" or "[BOOKING CREATE]" */
  logPrefix?: string
}

export type CreateBookingResult =
  | { ok: true; appointment: { id: string; scheduledAt: Date; serviceType: string }; calendarSyncFailed?: boolean }
  | { ok: false; error: string; status?: number }

export async function createBooking(params: CreateBookingParams): Promise<CreateBookingResult> {
  const {
    business,
    customerName,
    customerPhone,
    customerEmail,
    slotStart,
    serviceType,
    notes,
    customerAddress,
    conversationId,
    skipSlotVerification = false,
    allowWithoutCalendar = false,
    logPrefix = '[BOOKING CREATE]',
  } = params

  const name = customerName.trim()
  const phone = customerPhone.trim()
  const service = serviceType.trim()
  const ownerFacingService = cleanServiceForOwner(service)
  const startDate = typeof slotStart === 'string' ? new Date(slotStart) : slotStart
  const tz = business.timezone ?? 'America/New_York'

  console.log(`${logPrefix} Creating appointment...`, { businessId: business.id, customerName: name, slotStart: startDate.toISOString() })

  if (!business.calendarEnabled && !allowWithoutCalendar) {
    return { ok: false, error: 'Booking not available', status: 400 }
  }
  if (!business.googleCalendarConnected && !allowWithoutCalendar) {
    return { ok: false, error: 'Google Calendar not connected', status: 400 }
  }
  if (!name || !phone || !service) {
    return { ok: false, error: 'Missing required fields: customerName, customerPhone, serviceType', status: 400 }
  }
  if (isNaN(startDate.getTime())) {
    return { ok: false, error: 'Invalid slotStart', status: 400 }
  }

  const nowInTz = new TZDate(new Date(), tz)
  if (startDate.getTime() < nowInTz.getTime()) {
    return { ok: false, error: 'This time slot is no longer available', status: 409 }
  }

  if (!skipSlotVerification && business.googleCalendarConnected) {
    const dateStr = startDate.toLocaleDateString('en-CA', { timeZone: tz })
    const { slots: availableSlots, calendarError } = await getAvailableSlotsWithMeta(business.id, dateStr, dateStr)
    if (calendarError) {
      // Google Calendar unreachable — availability can't be verified, so fail closed
      // with a retryable message rather than booking blind over the owner's calendar.
      console.error(`${logPrefix} Slot verification unavailable: Google Calendar unreachable`)
      return { ok: false, error: "We couldn't check availability just now. Please try again in a minute.", status: 503 }
    }
    const slotStartMs = startDate.getTime()
    // Use 60s tolerance to handle timezone/parsing edge cases (e.g. 12:00 PM Eastern vs UTC)
    const TOLERANCE_MS = 60_000
    const isAvailable = availableSlots.some(
      (s) => Math.abs(new Date(s.start).getTime() - slotStartMs) < TOLERANCE_MS
    )
    if (!isAvailable) {
      console.warn(`${logPrefix} Slot verification FAILED: slot not in available list`, {
        slotStart: startDate.toISOString(),
        slotStartTz: startDate.toLocaleString('en-US', { timeZone: tz }),
        dateStr,
        availableCount: availableSlots.length,
        availableSlots: availableSlots.slice(0, 5).map((s) => ({
          start: s.start,
          display: s.display,
        })),
      })
      return { ok: false, error: 'This time slot is no longer available', status: 409 }
    }
    console.log(`${logPrefix} Slot verification OK:`, { slotStart: startDate.toISOString(), dateStr })
  }

  const slotDuration = business.slotDurationMinutes ?? 30
  const marginMs = slotDuration * 60 * 1000
  const slotEnd = new Date(startDate.getTime() + slotDuration * 60 * 1000)
  const endDate = slotEnd
  const source = conversationId ? ('sms' as const) : ('website' as const)

  // Conflict checks + create run atomically under a per-business advisory lock, so two
  // simultaneous requests (website + website, or website + SMS) can't take the same slot.
  // The lock is released automatically when the transaction commits or rolls back.
  let appointment: { id: string; scheduledAt: Date; serviceType: string }
  try {
    appointment = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${business.id}))`

      if (conversationId) {
        const existing = await tx.appointment.findFirst({
          where: { conversationId, status: 'confirmed' },
        })
        if (existing) {
          throw new BookingConflictError('This conversation already has a confirmed appointment')
        }
      }

      const existingDup = await tx.appointment.findFirst({
        where: {
          businessId: business.id,
          customerPhone: phone,
          status: 'confirmed',
          serviceType: ownerFacingService,
          scheduledAt: {
            gte: new Date(startDate.getTime() - marginMs),
            lte: new Date(startDate.getTime() + marginMs),
          },
        },
      })
      if (existingDup) {
        throw new BookingConflictError('You already have a quote visit scheduled for this service at this time')
      }

      // DB-level time-overlap check: runs regardless of skipSlotVerification so SMS and
      // website flows can't race each other into the same slot.
      const overlapWindowMs = 4 * 60 * 60 * 1000 // 4h upper bound on appointment duration
      const candidateAppts = await tx.appointment.findMany({
        where: {
          businessId: business.id,
          status: { not: 'cancelled' },
          scheduledAt: {
            gte: new Date(startDate.getTime() - overlapWindowMs),
            lt: slotEnd,
          },
        },
        select: { scheduledAt: true, duration: true, customerPhone: true, serviceType: true },
      })
      const conflictingAppt = candidateAppts.find((appt) => {
        const apptEnd = new Date(appt.scheduledAt.getTime() + appt.duration * 60 * 1000)
        const overlaps = appt.scheduledAt.getTime() < slotEnd.getTime() && apptEnd.getTime() > startDate.getTime()
        if (!overlaps) return false
        // Skip: same customer+service is already caught by the duplicate-booking check above
        return !(appt.customerPhone === phone && appt.serviceType === ownerFacingService)
      })
      if (conflictingAppt) {
        throw new BookingConflictError('This time slot was just booked. Please pick a different time.')
      }

      return tx.appointment.create({
        data: {
          businessId: business.id,
          conversationId: conversationId || null,
          customerName: name,
          customerPhone: phone,
          customerEmail: customerEmail?.trim() || null,
          serviceType: ownerFacingService,
          scheduledAt: startDate,
          duration: slotDuration,
          notes: notes?.trim() || null,
          customerAddress: customerAddress?.trim() || null,
          googleCalendarEventId: null,
          calendarSyncFailed: false,
          status: 'confirmed',
          source,
        },
      })
    })
  } catch (err) {
    if (err instanceof BookingConflictError) {
      return { ok: false, error: err.message, status: 409 }
    }
    throw err
  }

  console.log(`${logPrefix} Appointment created:`, appointment.id)

  // Google Calendar event is created AFTER the DB row so the advisory-lock transaction
  // stays short and a conflict never leaves an orphaned calendar event behind.
  let googleEventId: string | null = null
  let calendarSyncFailed = false
  const shouldCreateCalendar = business.calendarEnabled && business.googleCalendarConnected

  if (shouldCreateCalendar) {
    try {
      googleEventId = await createCalendarEvent(
        business.id,
        startDate,
        endDate,
        name,
        ownerFacingService,
        phone,
        {
          customerEmail: customerEmail?.trim() || null,
          notes: notes?.trim() || null,
          customerAddress: customerAddress?.trim() || null,
          source,
        }
      )
      console.log(`${logPrefix} Google Calendar event created:`, googleEventId || 'no-id')
    } catch (calErr) {
      calendarSyncFailed = true
      console.error(`${logPrefix} Calendar FAILED:`, calErr instanceof Error ? calErr.message : String(calErr))
      // Booking stands either way — appointment is already saved
    }
    try {
      await db.appointment.update({
        where: { id: appointment.id },
        data: { googleCalendarEventId: googleEventId, calendarSyncFailed },
      })
    } catch (updateErr) {
      console.error(`${logPrefix} Failed to record calendar sync result on appointment:`, updateErr)
    }
  }

  // Send confirmation SMS — ALWAYS use actual booked date/time from slotStart, never customer's words
  if (business.telnyxPhoneNumber) {
    const telnyx = new Telnyx({ apiKey: process.env.TELNYX_API_KEY! })
    const dateStr = formatDateFullForConfirm(startDate, tz)
    const timeStr = startDate.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: tz,
    })
    const cleanService = cleanServiceForConfirmation(service)
    const addressPart = customerAddress?.trim() ? ` at ${customerAddress.trim()}` : ''
    const defaultWebsiteMsg = `Confirmed! Your quote visit with ${business.name} is scheduled for ${dateStr} at ${timeStr}. They'll come out, take a look, and give you a quote for ${cleanService}. Reply to this number if you need to reschedule.`
    let msg = conversationId
      ? `You're all set ${name}! ${business.name} will meet you on ${dateStr} at ${timeStr}${addressPart} for ${cleanService}. See you then!`
      : business.bookingConfirmationSmsText
        ? business.bookingConfirmationSmsText
            .replace(/{businessName}/g, business.name)
            .replace(/{date}/g, dateStr)
            .replace(/{time}/g, timeStr)
            .replace(/{service}/g, cleanService)
        : defaultWebsiteMsg

    if (calendarSyncFailed) {
      msg += ` Note: We had a small technical issue syncing to our calendar, but you're definitely booked. We'll reach out if anything changes.`
    }

    try {
      await telnyx.messages.send({
        from: business.telnyxPhoneNumber,
        to: phone,
        text: msg,
      })
      if (conversationId) {
        void db.message
          .create({
            data: {
              conversationId,
              direction: 'outbound',
              content: msg,
              telnyxSid: null,
              telnyxStatus: 'sent',
            },
          })
          .then(() => recordMessageSent(business.id, phone))
          .catch((err) => console.error(`${logPrefix} Failed to log confirmation message:`, err))
      }
    } catch (smsErr) {
      console.error(`${logPrefix} Failed to send confirmation SMS:`, smsErr)
    }
  }

  // Notify owner
  try {
    const notifyResult = await notifyOwnerOnBookingCreated(business, {
      id: appointment.id,
      customerName: name,
      customerPhone: phone,
      customerEmail: customerEmail?.trim() || null,
      serviceType: ownerFacingService,
      scheduledAt: startDate,
      source,
      notes: notes?.trim() || null,
      customerAddress: customerAddress?.trim() || null,
    })
    console.log(`${logPrefix} Owner notified:`, notifyResult.smsSent ? 'SMS yes' : 'SMS no', notifyResult.emailSent ? 'Email yes' : 'Email no')
  } catch (notifyErr) {
    console.error(`${logPrefix} Failed to notify owner:`, notifyErr)
  }

  return {
    ok: true,
    appointment: {
      id: appointment.id,
      scheduledAt: appointment.scheduledAt,
      serviceType: appointment.serviceType,
    },
    calendarSyncFailed: calendarSyncFailed || undefined,
  }
}
