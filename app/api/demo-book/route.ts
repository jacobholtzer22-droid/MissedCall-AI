// ===========================================
// /book STEP 2: BOOK THE CALL
// ===========================================
// Creates the appointment, the Google Calendar event with a Meet link, emails
// the invite, texts the confirmation, and marks the lead booked.
//
// Slot rules come from lib/marketing-slots.ts, the same module
// /api/marketing-bookings uses, so the two cannot drift.

import { NextRequest, NextResponse } from 'next/server'
import { TZDate } from '@date-fns/tz'
import { addMinutes } from 'date-fns'
import Telnyx from 'telnyx'
import { db } from '@/lib/db'
import { validateUsMobile } from '@/lib/phone-utils'
import { createMarketingCalendarEvent, getBusyTimes } from '@/lib/google-calendar'
import { getDemoVideoAbsoluteUrl, WATCH_BEFORE_LINE } from '@/lib/demo-video'
import {
  getMarketingBusiness,
  notifyOwnerOfMarketingEvent,
  findPartialLeadByPhone,
} from '@/lib/marketing-funnel'
import {
  formatBookingAttribution,
  formatAttributionLine,
  buildFbc,
  buildTouch,
  describeJourney,
  isSelfReferral,
  mergeTouch,
  sanitizeTouch,
  type AttributionPair,
} from '@/lib/attribution'
import { ATTRIBUTION_COOKIE, parseAttributionCookie } from '@/lib/attribution-cookie'
import { claimLeadEvent } from '@/lib/lead-event-guard'
import { matchAgencySignal } from '@/lib/gate-filters'
import { rateLimit, getClientIp } from '@/lib/rate-limit'
import {
  TIMEZONE,
  SLOT_MINUTES,
  isWithinBookingWindow,
  isWithinHours,
  isValidSlotStart,
  getExistingAppointmentsForRange,
  overlapsWithExisting,
  overlapsWithBusy,
} from '@/lib/marketing-slots'
import { confirmationText } from '@/lib/marketing-sms-copy'
import { GATE_COOKIE, NOT_AN_OWNER, CALL_LENGTH_MINUTES } from '@/app/book/constants'
import { VARIANT_COOKIE, VISITOR_COOKIE } from '@/lib/variant'
import { FUNNEL_VARIANT_COOKIE } from '@/lib/funnel-variant'
import { sendCapiLead } from '@/lib/meta-capi'
import { logArmSchedule } from '@/lib/arm-log'
import { resolveCalendarToken } from '@/lib/lead-token'

export const dynamic = 'force-dynamic'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

type Payload = {
  email?: string
  slotStart?: string
  missesPerWeek?: string
  whoAnswers?: string
  companyName?: string
  // Only sent when the visitor never completed the gate.
  name?: string
  phone?: string
  trade?: string
  attribution?: unknown
  website?: string // honeypot
  /** Pixel event_id for Schedule, minted client-side. Reused for CAPI dedup. */
  eventId?: string
  /**
   * Pixel event_id for Lead, landing calendar only. Used only if this booking
   * wins the lead's Lead-event claim; the response says whether it did.
   */
  leadEventId?: string
  /** window.location.href at booking. Attribution fallback when the cookie is empty. */
  pageUrl?: string
  /** document.referrer at booking. Same purpose. */
  referrer?: string
  /**
   * Where the booking came from.
   *   undefined  the /book funnel (unchanged behaviour, stored as 'website')
   *   direct     someone typed /calendar with no token — cold, no ad attribution
   *   sms_link   a /calendar?l=<token> link we texted a known lead
   */
  bookingSource?: 'direct' | 'sms_link'
  /** Signed lead token, present only in sms_link mode. */
  leadToken?: string
  /**
   * Which calendar took the booking: 'landing' | 'watch' | 'calendar'.
   * Finer than bookingSource, which only knows the door (funnel / sms / direct)
   * and cannot tell a booking made before the video from one made after it.
   */
  bookingSurface?: string
}

export async function POST(request: NextRequest) {
  try {
    const limit = rateLimit(`demo-book:${getClientIp(request)}`, 8, 60_000)
    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Give it a moment and try again.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
      )
    }

    const body = (await request.json()) as Payload
    if (typeof body.website === 'string' && body.website.trim() !== '') {
      return NextResponse.json({ success: true })
    }

    const email = body.email?.trim() ?? ''
    const missesPerWeek = body.missesPerWeek?.trim() ?? ''
    // Optional on purpose. A required company field is one more thing between
    // someone and a booking, and it comes up on the call anyway.
    const companyName = body.companyName?.trim() ?? ''
    const whoAnswers = body.whoAnswers?.trim() ?? ''

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Please enter a valid email.', field: 'email' }, { status: 400 })
    }
    if (!body.slotStart) {
      return NextResponse.json({ error: 'Please pick a time.', field: 'slot' }, { status: 400 })
    }

    const business = await getMarketingBusiness()
    if (!business) {
      return NextResponse.json({ error: 'Booking is temporarily unavailable.' }, { status: 503 })
    }

    // Identity comes from the gate cookie when present, otherwise from the form.
    const variant = request.cookies.get(VARIANT_COOKIE)?.value ?? null
    const funnelVariant = request.cookies.get(FUNNEL_VARIANT_COOKIE)?.value ?? null
    const visitorId = request.cookies.get(VISITOR_COOKIE)?.value ?? ''
    const bookingSource = body.bookingSource === 'direct' || body.bookingSource === 'sms_link'
      ? body.bookingSource
      : null
    const bookingSurface =
      body.bookingSurface === 'landing' || body.bookingSurface === 'watch' || body.bookingSurface === 'calendar'
        ? body.bookingSurface
        : bookingSource
        ? 'calendar'
        : null

    // Re-sanitised: this arrives from a cookie the visitor can edit.
    // `touches` is the cookie alone and is what the Schedule event reads, so
    // Schedule's payload does not change with the fallback below.
    const attributionCookie = request.cookies.get(ATTRIBUTION_COOKIE)?.value
    const touches: AttributionPair = parseAttributionCookie(attributionCookie, {
      route: 'demo-book',
      visitorId: visitorId || null,
    })

    // Fallback when the cookie yields nothing: rebuild the touch from the page
    // URL and referrer the calendar sent with this request. Three landing
    // bookings lost their ad attribution to an empty cookie; the URL they
    // booked from still carried the UTMs.
    let urlTouches: AttributionPair = {}
    if (!touches.first && !touches.last && typeof body.pageUrl === 'string' && body.pageUrl) {
      try {
        const page = new URL(body.pageUrl.slice(0, 2000))
        const referrer = typeof body.referrer === 'string' ? body.referrer.slice(0, 2000) : ''
        const touch = buildTouch({
          search: page.search,
          referrer: isSelfReferral(referrer, page.hostname) ? '' : referrer,
          arm: funnelVariant,
          path: page.pathname,
        })
        urlTouches = mergeTouch({}, touch)
        console.log(
          `[demo-book] attribution from request URL (cookie ${attributionCookie ? 'unparseable' : 'absent'}) ` +
            `visitor=${visitorId || 'none'} signal=${urlTouches.first ? 'yes' : 'no'}`
        )
      } catch (err) {
        console.error(
          `[demo-book] attribution URL fallback FAILED visitor=${visitorId || 'none'} ` +
            `error=${err instanceof Error ? err.message : String(err)}`
        )
      }
    }
    const bookingTouches: AttributionPair = touches.first || touches.last ? touches : urlTouches

    // /calendar identifies its lead by signed token, not by the gate cookie:
    // the link is opened on whatever device the text was read on, which is
    // usually not the browser that walked the funnel.
    let tokenLeadId: string | null = null
    if (body.leadToken) {
      const verdict = await resolveCalendarToken(body.leadToken, business.id)
      if (verdict.ok) tokenLeadId = verdict.leadId
      else console.warn(`[demo-book] lead token rejected reason=${verdict.reason}`)
    }

    const leadId = tokenLeadId ?? request.cookies.get(GATE_COOKIE)?.value ?? null
    let lead = leadId
      ? await db.websiteLead.findFirst({ where: { id: leadId, businessId: business.id } })
      : null

    const leadName = lead?.name?.trim() ?? ''
    const leadPhone = lead?.phone?.trim() ?? ''

    // A lead banked at the OTP step stores the PHONE NUMBER as its name until a
    // later screen supplies a real one (see the wizard route: `name:
    // displayName || phoneCheck.e164`). That placeholder must never end up as
    // the name on a calendar invite, so it is treated as "no name" here.
    const digits = (v: string) => v.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '')
    const leadNameIsPlaceholder =
      leadName !== '' && leadPhone !== '' && digits(leadName) === digits(leadPhone)

    // `||` not `??`: an EMPTY lead name must fall through to what the visitor
    // just typed. With `??` a blank-named lead pinned name to '' and the
    // request was rejected with "Please enter your first name" even though they
    // had entered one.
    let name = (leadNameIsPlaceholder ? '' : leadName) || body.name?.trim() || ''
    let phoneE164 = leadPhone
    let trade = body.trade?.trim() ?? ''

    if (!phoneE164) {
      const phoneCheck = validateUsMobile(body.phone)
      if (!phoneCheck.ok) {
        return NextResponse.json({ error: phoneCheck.reason, field: 'phone' }, { status: 400 })
      }
      phoneE164 = phoneCheck.e164
    }
    if (!name) {
      return NextResponse.json({ error: 'Please enter your first name.', field: 'name' }, { status: 400 })
    }
    // Redundant with the check above by construction, but a booking with no
    // contact details is the one outcome that must be impossible: the invite
    // and the confirmation text both depend on these.
    if (!phoneE164) {
      return NextResponse.json({ error: 'Please enter your mobile number.', field: 'phone' }, { status: 400 })
    }
    if (!trade && lead?.message) {
      const match = lead.message.match(/^Trade: (.+)$/m)
      if (match) trade = match[1].trim()
    }

    // ── Slot validation, identical rules to /api/marketing-bookings ──────────
    const slotStart = new Date(body.slotStart)
    if (isNaN(slotStart.getTime())) {
      return NextResponse.json({ error: 'That time is not valid.', field: 'slot' }, { status: 400 })
    }
    const slotEnd = addMinutes(slotStart, SLOT_MINUTES)
    if (!isWithinBookingWindow(slotStart) || !isWithinHours(slotStart, slotEnd) || !isValidSlotStart(slotStart)) {
      return NextResponse.json({ error: 'That time is no longer available.' }, { status: 409 })
    }

    const startOfDay = new TZDate(
      slotStart.getFullYear(), slotStart.getMonth(), slotStart.getDate(), 0, 0, 0, 0, TIMEZONE
    )
    const endOfDay = new TZDate(
      slotStart.getFullYear(), slotStart.getMonth(), slotStart.getDate(), 23, 59, 59, 999, TIMEZONE
    )

    const existing = await getExistingAppointmentsForRange(business.id, startOfDay, endOfDay)
    if (overlapsWithExisting(slotStart, slotEnd, existing)) {
      return NextResponse.json({ error: 'That time was just taken. Pick another.' }, { status: 409 })
    }

    // Fail closed on the calendar, matching the existing funnel.
    if (business.googleCalendarConnected) {
      let busy: { start: string; end: string }[]
      try {
        busy = await getBusyTimes(business.id, startOfDay, endOfDay)
      } catch (err) {
        console.error('[demo-book] calendar unreadable, refusing to book:', err)
        return NextResponse.json(
          { error: 'Cannot confirm availability right now. Please try again shortly.' },
          { status: 503 }
        )
      }
      if (overlapsWithBusy(slotStart, slotEnd, busy)) {
        return NextResponse.json({ error: 'That time was just taken. Pick another.' }, { status: 409 })
      }
    }

    // ── Resolved attribution ─────────────────────────────────────────────────
    // Looked up before the calendar event (it used to happen after the
    // appointment) so the invite's private notes can print the same stored
    // touches the lead row and the appointment carry.
    //
    // A lead's stored first touch beats the cookie's. The cookie is this
    // browser's; the lead row is the person's, and someone who first met us on
    // their phone and booked on a laptop must not be re-attributed to whatever
    // the laptop's first visit happened to be.
    const linkedPartial = lead ? null : await findPartialLeadByPhone(business.id, phoneE164)
    const knownRow = lead ?? linkedPartial
    // sanitizeTouch also narrows Prisma's JsonValue (which includes null) to a
    // plain object or undefined, which is what a nullable Json column accepts.
    const resolvedFirst = sanitizeTouch(knownRow?.attributionFirst) ?? bookingTouches.first
    const resolvedLast = bookingTouches.last ?? sanitizeTouch(knownRow?.attributionLast)
    const resolvedPair: AttributionPair = {
      ...(resolvedFirst ? { first: resolvedFirst } : {}),
      ...(resolvedLast ? { last: resolvedLast } : {}),
    }
    const attributionText = formatBookingAttribution(resolvedPair, bookingSurface)

    // ── Agency CHECK: landing calendar only, flag never block ───────────────
    // The landing calendar skips the gate, so the gate's keyword block never
    // sees these bookings. A hit is shown to the owner and stored; the booking
    // and its Lead go through untouched, because false positives on real
    // contractors ("Ads Roofing") cost more than the occasional agency call.
    const agencySignal = bookingSurface === 'landing' ? matchAgencySignal(companyName, email) : null
    const agencyFlagData = agencySignal
      ? { agencyFlagTerm: agencySignal.term, agencyFlagField: agencySignal.field }
      : {}
    const agencyCheckLine = agencySignal
      ? `CHECK: possible agency ("${agencySignal.term}" in ${agencySignal.field === 'company' ? 'company name' : 'email domain'})`
      : null
    if (agencySignal) {
      console.log(`[demo-book] AGENCY CHECK term=${agencySignal.term} field=${agencySignal.field} surface=landing`)
    }
    if (!resolvedFirst && !resolvedLast) {
      console.warn(
        `[demo-book] ATTRIBUTION EMPTY surface=${bookingSurface ?? '-'} visitor=${visitorId || 'none'} ` +
          `leadId=${knownRow?.id ?? 'none'} cookie=${attributionCookie ? `present len=${attributionCookie.length}` : 'absent'} ` +
          `pageUrl=${body.pageUrl ? (body.pageUrl.includes('?') ? 'with_query' : 'no_query') : 'absent'} ` +
          `referrer=${body.referrer ? 'present' : 'absent'}`
      )
    }

    // ── Calendar event with Meet link ────────────────────────────────────────
    const qualified = trade !== NOT_AN_OWNER && trade !== ''
    const serviceType = 'Missed Call AI demo'
    let googleEventId: string | null = null
    let googleEventLink: string | null = null
    let googleMeetLink: string | null = null
    let calendarSyncFailed = false

    if (business.googleCalendarConnected) {
      try {
        const result = await createMarketingCalendarEvent(
          business.id, slotStart, slotEnd, name,
          {
            customerPhone: phoneE164,
            customerEmail: email,
            businessName: companyName || trade || 'Not specified',
            serviceType,
            servicesInterested: [],
            attendeeEmail: email,
            companyName: companyName || null,
            watchBeforeUrl: getDemoVideoAbsoluteUrl(),
            message: [
              companyName ? `Company: ${companyName}` : null,
              trade ? `Trade: ${trade}` : null,
              missesPerWeek ? `Missed calls per week: ${missesPerWeek}` : null,
              whoAnswers ? `Who answers now: ${whoAnswers}` : null,
            ].filter(Boolean).join('\n') || null,
            privateNotes: attributionText,
          }
        )
        googleEventId = result.id
        googleEventLink = result.htmlLink
        googleMeetLink = result.hangoutLink
      } catch (calErr) {
        calendarSyncFailed = true
        console.error('[demo-book] calendar/Meet failed:', calErr instanceof Error ? calErr.message : calErr)
      }
    }

    const dateLabel = slotStart.toLocaleDateString('en-US', {
      weekday: 'long', month: 'short', day: 'numeric', timeZone: TIMEZONE,
    })
    const timeLabel = slotStart.toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TIMEZONE,
    })

    const appointment = await db.appointment.create({
      data: {
        businessId: business.id,
        customerName: name,
        customerPhone: phoneE164,
        customerEmail: email,
        serviceType,
        scheduledAt: slotStart,
        duration: SLOT_MINUTES,
        notes: [
          'SMS consent: yes (captured at booking)',
          `Source: meta_demo_video`,
          variant ? `Variant: ${variant}` : null,
          funnelVariant ? `Funnel arm: ${funnelVariant}` : null,
          companyName ? `Company: ${companyName}` : null,
          trade ? `Trade: ${trade}` : null,
          missesPerWeek ? `Missed calls per week: ${missesPerWeek}` : null,
          whoAnswers ? `Who answers now: ${whoAnswers}` : null,
          '',
          attributionText,
        ].filter((l) => l !== null).join('\n'),
        status: 'confirmed',
        // 'website' is the funnel's historical value and is left alone so old
        // rows and the owner-email label keep meaning the same thing.
        source: bookingSource ?? 'website',
        // Stamped on the booking as well as the lead, because a booking can
        // exist with no lead row at all: the landing calendar takes people who
        // never went through the gate. Precedence is explained at resolvedPair.
        ...(resolvedFirst ? { attributionFirst: resolvedFirst } : {}),
        ...(resolvedLast ? { attributionLast: resolvedLast } : {}),
        bookingSurface,
        ...agencyFlagData,
        googleCalendarEventId: googleEventId,
        googleMeetLink,
        calendarSyncFailed,
        variant,
        // A /calendar booking has no funnel cookie of its own; the arm comes
        // from the lead the token identified, so an ad-sourced booking is still
        // attributed to the arm that produced it.
        funnelVariant: funnelVariant ?? lead?.funnelVariant ?? null,
      },
    })

    // ── Schedule: server half of the deduped pair ───────────────────────────
    // Same discipline as Lead: the browser fires Schedule with this exact
    // event_id and Meta counts one conversion. Awaited because Vercel can
    // freeze the lambda as soon as the response returns. Fails open.
    // Direct /calendar traffic is cold and unattributed: firing Schedule for it
    // would teach the ad account that cold bookings are ad conversions.
    if (body.eventId && bookingSource !== 'direct') {
      await sendCapiLead({
        eventName: 'Schedule',
        eventId: body.eventId,
        phone: phoneE164,
        email,
        firstName: name,
        trade,
        businessName: companyName,
        funnelArm: funnelVariant,
        referrerClass: touches.last?.referrer ?? touches.first?.referrer ?? null,
        firstTouchSource: touches.first?.source ?? touches.first?.referrer ?? null,
        firstTouchCampaign: touches.first?.campaign ?? null,
        clientIp: getClientIp(request),
        userAgent: request.headers.get('user-agent'),
        fbp: request.cookies.get('_fbp')?.value ?? lead?.fbp ?? null,
        fbc:
          request.cookies.get('_fbc')?.value ??
          lead?.fbc ??
          buildFbc(touches.first?.fbclid ?? touches.last?.fbclid) ??
          null,
        eventSourceUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.alignandacquire.com'}/book`,
      })
    } else if (bookingSource === 'direct') {
      console.log('[capi] SKIP event=Schedule reason=direct_booking (no ad attribution)')
    } else {
      console.warn('[capi] SKIP event=Schedule reason=no_event_id_from_client')
    }

    void logArmSchedule({
      arm: funnelVariant ?? lead?.funnelVariant ?? null,
      trade,
      businessName: companyName,
      phone: phoneE164,
      visitorId,
      leadId: lead?.id ?? null,
    })

    // ── The lead row ────────────────────────────────────────────────────────
    // Every booking gets one. Until now only bookings that had come through the
    // gate did: the landing calendar takes people who never hit the gate at
    // all, so those bookings existed as an Appointment and nothing else — absent
    // from /admin/leads, with no attribution attached to a name.
    //
    // Keyed on phone, like every other funnel write, so a booking never spawns a
    // second row for someone the funnel already knows.
    const bookedNote = `BOOKED ${dateLabel} at ${timeLabel} ET.${
      missesPerWeek ? `\nMissed calls per week: ${missesPerWeek}` : ''
    }${whoAnswers ? `\nWho answers now: ${whoAnswers}` : ''}`.trim()

    const fbpCookie = request.cookies.get('_fbp')?.value ?? null
    const fbcCookie =
      request.cookies.get('_fbc')?.value ??
      buildFbc(bookingTouches.first?.fbclid ?? bookingTouches.last?.fbclid) ??
      null

    // The row this booking ended up on. Lead-event claim and the owner text
    // both key on it.
    let leadRowId: string | null = lead?.id ?? null

    if (lead) {
      await db.websiteLead
        .update({
          where: { id: lead.id },
          data: {
            status: 'converted',
            email,
            bookingSurface,
            ...agencyFlagData,
            ...(lead.attributionFirst ? {} : bookingTouches.first ? { attributionFirst: bookingTouches.first } : {}),
            ...(bookingTouches.last ? { attributionLast: bookingTouches.last } : {}),
            ...(lead.fbp ? {} : fbpCookie ? { fbp: fbpCookie } : {}),
            ...(lead.fbc ? {} : fbcCookie ? { fbc: fbcCookie } : {}),
            message: `${lead.message ?? ''}\n\n${bookedNote}`.trim(),
          },
        })
        .catch((err) => console.error('[demo-book] lead update failed:', err))
    } else {
      // No gate cookie and no token: a landing-calendar booking. Everything the
      // booking form collected is here, so the row is built from that rather
      // than left to say "none".
      const existing = linkedPartial
      const message = [
        bookingSurface === 'landing'
          ? 'Booked straight from the landing calendar (no gate).'
          : 'Booked from the funnel.',
        '',
        `Trade: ${trade || 'not collected on this path'}`,
        `First name: ${name}`,
        `Phone: ${phoneE164}`,
        `Email: ${email}`,
        companyName ? `Company: ${companyName}` : null,
        `Funnel arm: ${funnelVariant ?? 'unassigned'}`,
        `Booking surface: ${bookingSurface ?? 'unknown'}`,
        `Source: meta_demo_video`,
        bookingTouches.first?.path ? `Landing path: ${bookingTouches.first.path}` : null,
        '',
        describeJourney(bookingTouches, bookingSurface),
        '',
        bookedNote,
      ]
        .filter((l) => l !== null)
        .join('\n')

      const shared = {
        status: 'converted',
        name,
        phone: phoneE164,
        email,
        message,
        variant,
        funnelVariant,
        bookingSurface,
        ...agencyFlagData,
        ...(bookingTouches.last ? { attributionLast: bookingTouches.last } : {}),
        ...(fbpCookie ? { fbp: fbpCookie } : {}),
        ...(fbcCookie ? { fbc: fbcCookie } : {}),
      }

      try {
        const row = existing
          ? await db.websiteLead.update({
              where: { id: existing.id },
              data: {
                ...shared,
                // A first touch already on the row was captured closer to the
                // click than this one; it wins.
                ...(existing.attributionFirst ? {} : bookingTouches.first ? { attributionFirst: bookingTouches.first } : {}),
              },
            })
          : await db.websiteLead.create({
              data: {
                businessId: business.id,
                ...shared,
                ...(bookingTouches.first ? { attributionFirst: bookingTouches.first } : {}),
              },
            })
        leadRowId = row.id
        console.log(`[demo-book] LEAD ${existing ? 'linked' : 'created'} ${row.id} surface=${bookingSurface ?? '-'}`)
      } catch (err) {
        // The appointment is already booked. A missing lead row is a reporting
        // gap, not a lost booking. It does mean no Lead event below: the guard
        // lives on the row, and firing without it could double-count.
        console.error('[demo-book] lead write failed:', err)
      }
    }

    // ── Lead: landing calendar only ─────────────────────────────────────────
    // The landing calendar skips OTP, so without this a booking made there is
    // a Schedule with no Lead, and Meta never sees the conversion it optimises
    // toward. Watch-page and /calendar bookings never reach this: their Lead
    // (if any) already fired at OTP.
    //
    // Guarded once per person by claimLeadEvent, shared with the OTP route. The
    // browser fires its half with the same event_id only when the response
    // says leadEvent: true.
    let leadEventFired = false
    const leadEventId =
      typeof body.leadEventId === 'string' && body.leadEventId.length <= 100 ? body.leadEventId : ''
    if (bookingSurface === 'landing' && !bookingSource && leadRowId && leadEventId) {
      const claim = await claimLeadEvent({
        leadId: leadRowId,
        businessId: business.id,
        phone: phoneE164,
        eventId: leadEventId,
      })
      if (claim.claimed) {
        leadEventFired = true
        await sendCapiLead({
          eventName: 'Lead',
          eventId: leadEventId,
          phone: phoneE164,
          email,
          firstName: name,
          trade,
          businessName: companyName,
          funnelArm: funnelVariant,
          referrerClass: bookingTouches.last?.referrer ?? bookingTouches.first?.referrer ?? null,
          firstTouchSource: resolvedFirst?.source ?? resolvedFirst?.referrer ?? null,
          firstTouchCampaign: resolvedFirst?.campaign ?? null,
          clientIp: getClientIp(request),
          userAgent: request.headers.get('user-agent'),
          fbp: fbpCookie ?? knownRow?.fbp ?? null,
          fbc: request.cookies.get('_fbc')?.value ?? knownRow?.fbc ?? fbcCookie,
          eventSourceUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.alignandacquire.com'}/book`,
        })
      }
    } else if (bookingSurface === 'landing' && !leadEventId) {
      console.warn('[capi] SKIP event=Lead reason=no_lead_event_id_from_client surface=landing')
    }

    // Two different facts, reported separately.
    //
    // verifiedPreviously: any row for this number has ever passed OTP. Any row,
    // not just the linked one, because the wizard only links to partial rows.
    //
    // gateThisBooking: THIS booking came through the gate. Only the watch page
    // qualifies: it cannot render without a watch token, and that token is
    // minted only when OTP passes. A landing or texted-calendar booking is "no"
    // even for someone who verified weeks ago, which is the whole point of the
    // flag: it says whether to treat this booking as pre-qualified.
    const verifiedPreviously = Boolean(
      knownRow?.otpVerifiedAt ||
        (await db.websiteLead
          .findFirst({
            where: { businessId: business.id, phone: phoneE164, otpVerifiedAt: { not: null } },
            select: { id: true },
          })
          .catch(() => null))
    )
    const gateThisBooking = bookingSurface === 'watch' && verifiedPreviously

    // One call per booking request, so one text per booking. Watch-page
    // bookers also got the "Call now" text at OTP; that one was about the lead,
    // this one is about the booking.
    await notifyOwnerOfMarketingEvent({
      ownerEmailFallback: business.ownerEmail,
      ownerPhoneFallback: business.ownerPhone,
      subject: `Demo booked: ${name}${trade ? ` (${trade})` : ''} - ${dateLabel} ${timeLabel} ET`,
      html: `
        ${agencyCheckLine ? `<p style="color:#b00;font-size:16px"><strong>${escapeHtml(agencyCheckLine)}</strong></p>` : ''}
        <h2>Demo call booked</h2>
        <p><strong>Name:</strong> ${escapeHtml(name)}</p>
        <p><strong>Mobile:</strong> ${escapeHtml(phoneE164)}</p>
        <p><strong>Email:</strong> ${escapeHtml(email)}</p>
        <p><strong>Variant:</strong> ${escapeHtml(variant ?? 'unassigned')}</p>
        <p><strong>Funnel arm:</strong> ${escapeHtml(funnelVariant ?? 'unassigned')}</p>
        <p><strong>Company:</strong> ${escapeHtml(companyName || 'Not given')}</p>
        <p><strong>Trade:</strong> ${escapeHtml(trade || 'Not specified')}</p>
        <p><strong>Missed calls per week:</strong> ${escapeHtml(missesPerWeek || 'Not specified')}</p>
        <p><strong>Who answers now:</strong> ${escapeHtml(whoAnswers || 'Not specified')}</p>
        <p><strong>Time:</strong> ${escapeHtml(dateLabel)} at ${escapeHtml(timeLabel)} (Eastern Time)</p>
        <p><strong>OTP verified (this booking):</strong> ${gateThisBooking ? 'yes' : 'no'}</p>
        <p><strong>Verified previously:</strong> ${verifiedPreviously ? 'yes' : 'no'}</p>
        ${googleEventLink ? `<p><strong>Calendar:</strong> <a href="${escapeHtml(googleEventLink)}">Open the event</a></p>` : ''}
        ${googleMeetLink ? `<p><strong>Meet:</strong> <a href="${escapeHtml(googleMeetLink)}">${escapeHtml(googleMeetLink)}</a></p>` : ''}
        ${calendarSyncFailed ? '<p style="color:#b00"><strong>Calendar sync FAILED. No Meet link. Fix before the call.</strong></p>' : ''}
        <p><strong>How they got here:</strong> ${escapeHtml(describeJourney(resolvedPair, bookingSurface))}</p>
        <pre style="font-family:inherit;white-space:pre-wrap;margin:0">${escapeHtml(attributionText)}</pre>
      `,
      smsText: [
        agencyCheckLine,
        `Booked: ${name}${companyName ? ` (${companyName})` : ''}`,
        phoneE164,
        `${dateLabel} at ${timeLabel} ET`,
        `Surface: ${bookingSurface ?? 'unknown'}`,
        `OTP verified (this booking): ${gateThisBooking ? 'yes' : 'no'}`,
        `Verified previously: ${verifiedPreviously ? 'yes' : 'no'}`,
      ]
        .filter(Boolean)
        .join('\n'),
    })

    // Customer confirmation SMS. Copy lives in lib/marketing-sms-copy.ts with
    // the two reminder texts so the wording and the reschedule number cannot
    // drift apart across the three messages one prospect receives.
    const fromNumber = process.env.MARKETING_TELNYX_NUMBER || business.telnyxPhoneNumber
    if (fromNumber && process.env.TELNYX_API_KEY) {
      const confirmation = confirmationText({
        scheduledAt: slotStart,
        meetLink: googleMeetLink,
        ownerPhone: business.ownerPhone,
      })
      try {
        const telnyx = new Telnyx({ apiKey: process.env.TELNYX_API_KEY })
        await telnyx.messages.send({ from: fromNumber, to: phoneE164, text: confirmation })
        console.log(`[demo-book] confirmation SMS sent from=${fromNumber} to=${phoneE164}`)
      } catch (err) {
        console.error('[demo-book] confirmation SMS failed:', err)
      }
    }

    // Customer confirmation email
    if (process.env.RESEND_API_KEY) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'Align and Acquire <notifications@alignandacquire.com>',
            to: email,
            subject: `You're booked with Align and Acquire`,
            html: `
              <h2>You're booked</h2>
              <p>Hi ${escapeHtml(name)},</p>
              <p>Your demo is set for <strong>${escapeHtml(dateLabel)} at ${escapeHtml(timeLabel)} (Eastern Time)</strong>.</p>
              <p>It takes about ${CALL_LENGTH_MINUTES} minutes. I will show you the system running on real client accounts: real text-back conversations, and the jobs that got booked out of them. Then I will answer any questions.</p>
              ${googleMeetLink ? `<p><strong>Join here:</strong> <a href="${googleMeetLink}">${googleMeetLink}</a></p>` : ''}
              <p>${WATCH_BEFORE_LINE} <a href="${getDemoVideoAbsoluteUrl()}">Watch the video</a></p>
              <p>You will also get a text from me confirming.</p>
              <p>Talk soon, Jacob</p>
            `,
          }),
        })
      } catch (err) {
        console.error('[demo-book] confirmation email failed:', err)
      }
    }

    console.log(`[demo-book] BOOKED appointmentId=${appointment.id} qualified=${qualified} meet=${googleMeetLink ?? 'none'}`)

    return NextResponse.json({
      success: true,
      /** The browser fires its half of Lead only when this is true. */
      leadEvent: leadEventFired,
      appointment: {
        id: appointment.id,
        scheduledAt: appointment.scheduledAt,
        dateLabel,
        timeLabel,
        meetLink: googleMeetLink,
      },
    })
  } catch (error) {
    console.error('[demo-book] failed:', error)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
