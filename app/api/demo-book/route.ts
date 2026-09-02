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
import { getMarketingBusiness, notifyOwnerOfMarketingEvent } from '@/lib/marketing-funnel'
import {
  sanitizeAttribution,
  formatAttributionBlock,
  formatAttributionLine,
} from '@/lib/attribution'
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
import { GATE_COOKIE, NOT_AN_OWNER, CALL_LENGTH_MINUTES } from '@/app/book/constants'
import { VARIANT_COOKIE, VISITOR_COOKIE } from '@/lib/variant'
import { FUNNEL_VARIANT_COOKIE } from '@/lib/funnel-variant'
import { getClaimForVisitor, setupFeeLine, SETUP_FEE_DISCOUNTED } from '@/lib/coupon'
import { sendCapiLead } from '@/lib/meta-capi'
import { logArmSchedule } from '@/lib/arm-log'

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
    const attribution = sanitizeAttribution(body.attribution)

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
    const leadId = request.cookies.get(GATE_COOKIE)?.value ?? null
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
            privateNotes: formatAttributionBlock(attribution),
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

    // Coupon: only honoured if this visitor holds an unexpired claim right now.
    const claim = visitorId ? await getClaimForVisitor(visitorId) : null
    const couponValid = Boolean(claim && claim.expiresAt.getTime() > Date.now())
    const couponLine = setupFeeLine(claim, couponValid)

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
          couponLine,
          variant ? `Variant: ${variant}` : null,
          funnelVariant ? `Funnel arm: ${funnelVariant}` : null,
          companyName ? `Company: ${companyName}` : null,
          trade ? `Trade: ${trade}` : null,
          missesPerWeek ? `Missed calls per week: ${missesPerWeek}` : null,
          whoAnswers ? `Who answers now: ${whoAnswers}` : null,
          '',
          formatAttributionBlock(attribution),
        ].filter((l) => l !== null).join('\n'),
        status: 'confirmed',
        source: 'website',
        googleCalendarEventId: googleEventId,
        googleMeetLink,
        calendarSyncFailed,
        variant,
        funnelVariant,
      },
    })

    // ── Schedule: server half of the deduped pair ───────────────────────────
    // Same discipline as Lead: the browser fires Schedule with this exact
    // event_id and Meta counts one conversion. Awaited because Vercel can
    // freeze the lambda as soon as the response returns. Fails open.
    if (body.eventId) {
      await sendCapiLead({
        eventName: 'Schedule',
        eventId: body.eventId,
        phone: phoneE164,
        firstName: name,
        trade,
        businessName: companyName,
        funnelArm: funnelVariant,
        clientIp: getClientIp(request),
        userAgent: request.headers.get('user-agent'),
        fbp: request.cookies.get('_fbp')?.value ?? null,
        fbc: request.cookies.get('_fbc')?.value ?? null,
        eventSourceUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.alignandacquire.com'}/book`,
      })
    } else {
      console.warn('[capi] SKIP event=Schedule reason=no_event_id_from_client')
    }

    void logArmSchedule({
      arm: funnelVariant,
      trade,
      businessName: companyName,
      phone: phoneE164,
      visitorId,
      leadId: lead?.id ?? null,
    })

    // Mark the lead booked rather than creating a second record.
    if (lead) {
      await db.websiteLead
        .update({
          where: { id: lead.id },
          data: {
            status: 'converted',
            email,
            message: `${lead.message ?? ''}\n\nBOOKED ${dateLabel} at ${timeLabel} ET.${
              missesPerWeek ? `\nMissed calls per week: ${missesPerWeek}` : ''
            }${whoAnswers ? `\nWho answers now: ${whoAnswers}` : ''}`.trim(),
          },
        })
        .catch((err) => console.error('[demo-book] lead update failed:', err))
    }

    await notifyOwnerOfMarketingEvent({
      ownerEmailFallback: business.ownerEmail,
      ownerPhoneFallback: business.ownerPhone,
      subject: `Demo booked: ${name}${trade ? ` (${trade})` : ''} - ${dateLabel} ${timeLabel} ET`,
      html: `
        <h2>Demo call booked</h2>
        <p><strong>Name:</strong> ${escapeHtml(name)}</p>
        <p><strong>Mobile:</strong> ${escapeHtml(phoneE164)}</p>
        <p><strong>Email:</strong> ${escapeHtml(email)}</p>
        <p><strong>Setup:</strong> ${escapeHtml(couponLine)}</p>
        <p><strong>Variant:</strong> ${escapeHtml(variant ?? 'unassigned')}</p>
        <p><strong>Funnel arm:</strong> ${escapeHtml(funnelVariant ?? 'unassigned')}</p>
        <p><strong>Company:</strong> ${escapeHtml(companyName || 'Not given')}</p>
        <p><strong>Trade:</strong> ${escapeHtml(trade || 'Not specified')}</p>
        <p><strong>Missed calls per week:</strong> ${escapeHtml(missesPerWeek || 'Not specified')}</p>
        <p><strong>Who answers now:</strong> ${escapeHtml(whoAnswers || 'Not specified')}</p>
        <p><strong>Time:</strong> ${escapeHtml(dateLabel)} at ${escapeHtml(timeLabel)} (Eastern Time)</p>
        ${googleEventLink ? `<p><strong>Calendar:</strong> <a href="${escapeHtml(googleEventLink)}">Open the event</a></p>` : ''}
        ${googleMeetLink ? `<p><strong>Meet:</strong> <a href="${escapeHtml(googleMeetLink)}">${escapeHtml(googleMeetLink)}</a></p>` : ''}
        ${calendarSyncFailed ? '<p style="color:#b00"><strong>Calendar sync FAILED. No Meet link. Fix before the call.</strong></p>' : ''}
        <pre style="font-family:inherit;white-space:pre-wrap;margin:0">${escapeHtml(formatAttributionBlock(attribution))}</pre>
      `,
      smsText: `Demo booked.\nName: ${name}${companyName ? ` (${companyName})` : ''}\nMobile: ${phoneE164}\nTrade: ${trade || 'n/a'}\nMisses/wk: ${missesPerWeek || 'n/a'}\nTime: ${dateLabel} at ${timeLabel} ET\n${couponLine}${googleMeetLink ? `\nMeet: ${googleMeetLink}` : ''}\n${formatAttributionLine(attribution)}`,
    })

    // Customer confirmation SMS
    const fromNumber = process.env.MARKETING_TELNYX_NUMBER || business.telnyxPhoneNumber
    if (fromNumber && process.env.TELNYX_API_KEY) {
      try {
        const telnyx = new Telnyx({ apiKey: process.env.TELNYX_API_KEY })
        await telnyx.messages.send({
          from: fromNumber,
          to: phoneE164,
          text: `You are booked with Align and Acquire for ${dateLabel} at ${timeLabel} ET. I will show you the system running on real client accounts.${
            googleMeetLink ? `\nJoin here: ${googleMeetLink}` : ''
          }${couponValid && claim ? `\nSetup $${SETUP_FEE_DISCOUNTED} locked in with code ${claim.code}.` : ''}\n${WATCH_BEFORE_LINE} ${getDemoVideoAbsoluteUrl()}\nReply STOP to opt out.`,
        })
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
              ${couponValid && claim ? `<p><strong>Setup fee:</strong> $${SETUP_FEE_DISCOUNTED} locked in with code ${claim.code}.</p>` : ''}
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

    if (couponValid && claim) {
      await db.couponClaim
        .update({ where: { id: claim.id }, data: { redeemedAt: new Date(), appointmentId: appointment.id } })
        .catch((err) => console.error('[demo-book] coupon redeem mark failed:', err))
    }

    console.log(`[demo-book] BOOKED appointmentId=${appointment.id} qualified=${qualified} meet=${googleMeetLink ?? 'none'}`)

    return NextResponse.json({
      success: true,
      appointment: {
        id: appointment.id,
        scheduledAt: appointment.scheduledAt,
        dateLabel,
        timeLabel,
        meetLink: googleMeetLink,
        couponLine: couponValid ? couponLine : null,
      },
    })
  } catch (error) {
    console.error('[demo-book] failed:', error)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
