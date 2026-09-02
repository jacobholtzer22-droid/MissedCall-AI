// ===========================================
// GATE WIZARD — bank the lead early, then enrich it
// ===========================================
// Separate from /api/demo-lead ON PURPOSE. That route requires a name and is
// still called by BookingWizard; its contract is untouched here.
//
// This one is built for a one-question-per-screen gate:
//   stage "phone"  -> create/upsert the lead from trade + phone alone, notify
//                     the owner, send the instant SMS, set the gate cookie.
//   stage "update" -> enrich the SAME row as later screens are answered.
//
// Banking at the phone step is the entire point: someone who gives a number and
// then abandons on "last name" is still a callable lead, and the owner hears
// about them within seconds rather than never.

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { validateUsMobile } from '@/lib/phone-utils'
import { findOrCreateContact } from '@/lib/crm-utils'
import {
  getMarketingBusiness,
  notifyOwnerOfMarketingEvent,
  findPartialLeadByPhone,
} from '@/lib/marketing-funnel'
import {
  sanitizeAttribution,
  formatAttributionBlock,
  formatAttributionLine,
} from '@/lib/attribution'
import { rateLimit, getClientIp } from '@/lib/rate-limit'
import { sendLeadDemoSms, newResumeToken } from '@/lib/lead-sms'
import { SEND_SMS_AT } from '@/app/book/constants'
import { isTestPhone } from '@/lib/test-allowlist'
import { consumeVerification } from '@/lib/otp'
import { sendCapiLead } from '@/lib/meta-capi'
import { logArmVerifiedLead } from '@/lib/arm-log'
import { isTerminalTrade } from '@/app/book/constants'
import { GATE_COOKIE, GATE_COOKIE_MAX_AGE, NOT_AN_OWNER } from '@/app/book/constants'
import { VARIANT_COOKIE, VISITOR_COOKIE } from '@/lib/variant'
import { FUNNEL_VARIANT_COOKIE } from '@/lib/funnel-variant'
import { newCalendarToken } from '@/lib/lead-token'

/**
 * How long before the same lead can generate a second owner alert.
 *
 * Not once-ever: a prospect who comes back is worth an email. Not zero either,
 * or a refresh would send twice. Six hours means at most one alert per lead per
 * working half-day.
 */
const OWNER_RENOTIFY_AFTER_MS = 6 * 60 * 60 * 1000

export const dynamic = 'force-dynamic'

const LEAD_SOURCE = 'meta_demo_video'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

type Payload = {
  /**
   * phone  — arm A, the number was just verified. Creates/banks the lead.
   * form   — arm B, the whole form was submitted and verified. Same bank path.
   * update — a later arm A screen enriching the row already banked.
   */
  stage?: 'phone' | 'form' | 'update'
  /** Single-use ticket from /api/otp/verify. Required to BANK a lead. */
  verificationId?: string
  /** Pixel event_id, minted client-side. Reused verbatim for CAPI dedup. */
  eventId?: string
  /** Arm B sends one name field and a business name. */
  fullName?: string
  businessName?: string
  trade?: string
  phone?: string
  firstName?: string
  lastName?: string
  company?: string
  email?: string
  landingPath?: string
  attribution?: unknown
  website?: string // legacy honeypot name
  hp_ref?: string // current honeypot name
}

/** Everything captured so far, rendered into the lead body. */
function buildMessage(p: {
  trade: string; qualified: boolean; firstName: string; lastName: string
  company: string; email: string; landingPath: string
  variant: string | null; funnelVariant: string | null; attribution: ReturnType<typeof sanitizeAttribution>
}) {
  return [
    p.qualified
      ? 'Gate lead from /book (step wizard).'
      : 'Gate lead from /book. NOT a service business owner.',
    '',
    `Trade: ${p.trade}`,
    `Qualified: ${p.qualified ? 'yes' : 'no'}`,
    p.firstName ? `First name: ${p.firstName}` : null,
    p.lastName ? `Last name: ${p.lastName}` : null,
    p.company ? `Company: ${p.company}` : null,
    p.email ? `Email: ${p.email}` : null,
    `Source: ${LEAD_SOURCE}`,
    `Landing path: ${p.landingPath}`,
    p.variant ? `Variant: ${p.variant}` : null,
    p.funnelVariant ? `Funnel arm: ${p.funnelVariant}` : null,
    '',
    formatAttributionBlock(p.attribution),
  ].filter((l) => l !== null).join('\n')
}

/**
 * Run a post-lead side effect so that it can never break the response.
 *
 * Once the lead row exists and the gate cookie is set, the visitor has earned
 * their video. Everything after that — the SMS, the pixel, the owner alert — is
 * bookkeeping. A throw in any of it used to surface as an error screen on a
 * walk that had actually SUCCEEDED: lead written, owner alerted, and the person
 * staring at "something went wrong".
 *
 * The timeout matters as much as the catch. A hung Telnyx or Resend call does
 * not throw, it just never settles, and an awaited one holds the response until
 * the platform kills the invocation — same error screen, no stack trace.
 */
async function sideEffect(label: string, work: () => Promise<unknown>, timeoutMs = 8000): Promise<void> {
  try {
    await Promise.race([
      work(),
      new Promise((_, reject) => setTimeout(() => reject(new Error(`timed out after ${timeoutMs}ms`)), timeoutMs)),
    ])
  } catch (err) {
    console.error(`[demo-lead/wizard] side-effect FAILED step=${label} error=${err instanceof Error ? err.message : String(err)}`)
  }
}

export async function POST(request: NextRequest) {
  try {
    const limit = rateLimit(`demo-lead-wizard:${getClientIp(request)}`, 20, 60_000)
    if (!limit.allowed) {
      return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })
    }

    const body = (await request.json()) as Payload

    // Honeypot. It used to return a bare { success: true }, which the client
    // read as success and walked the visitor through every remaining screen
    // while writing NO lead and sending NO notification. A human tripping it
    // (autofill loves an off-screen field named "website") lost everything
    // silently. It now returns an explicit blocked flag with no leadId, and the
    // client treats a missing leadId as a hard failure.
    const trap = typeof body.hp_ref === 'string' ? body.hp_ref : body.website
    if (typeof trap === 'string' && trap.trim() !== '') {
      console.warn(
        `[demo-lead/wizard] HONEYPOT blocked ip=${getClientIp(request)} ` +
          `field=${typeof body.hp_ref === 'string' && body.hp_ref.trim() ? 'hp_ref' : 'website'} ` +
          `value_len=${trap.trim().length}`
      )
      await db.funnelEvent
        .create({
          data: {
            name: 'honeypot_blocked',
            step: 'honeypot_blocked',
            visitorId: request.cookies.get(VISITOR_COOKIE)?.value ?? null,
            variant: request.cookies.get(VARIANT_COOKIE)?.value ?? null,
            funnelVariant: request.cookies.get(FUNNEL_VARIANT_COOKIE)?.value ?? null,
          },
        })
        .catch(() => {})
      return NextResponse.json({ success: false, blocked: true }, { status: 200 })
    }

    const phoneCheck = validateUsMobile(body.phone)
    if (!phoneCheck.ok) {
      return NextResponse.json({ error: phoneCheck.reason, field: 'phone' }, { status: 400 })
    }

    const trade = body.trade?.trim() ?? ''

    // Arm B collects one name field and a business name. Split it here so the
    // rest of this route, the CRM record and the owner email are identical for
    // both arms rather than forking into two lead shapes.
    const fullName = body.fullName?.trim() ?? ''
    const nameParts = fullName.split(/\s+/).filter(Boolean)
    const firstName = body.firstName?.trim() || nameParts[0] || ''
    const lastName = body.lastName?.trim() || nameParts.slice(1).join(' ') || ''
    const company = body.company?.trim() || body.businessName?.trim() || ''
    const email = body.email?.trim() ?? ''
    const landingPath = body.landingPath?.trim().slice(0, 300) ?? '/book'
    const attribution = sanitizeAttribution(body.attribution)

    // Server decides qualification. Never trust a client boolean.
    //
    // Arm B never asks for a trade — its qualifying signal is that someone
    // filled in a business name. Falling through to the arm A rule would make
    // every arm B lead unqualified, which silently suppresses BOTH the instant
    // SMS and the owner email.
    // "I'm a homeowner" and "Just looking" never reach here — the gate ends
    // before OTP — but they are excluded explicitly so a replayed or hand-made
    // request cannot mint a qualified lead out of them.
    const qualified =
      body.stage === 'form'
        ? company !== ''
        : trade !== NOT_AN_OWNER && trade !== '' && !isTerminalTrade(trade)

    const variant = request.cookies.get(VARIANT_COOKIE)?.value ?? null
    const funnelVariant = request.cookies.get(FUNNEL_VARIANT_COOKIE)?.value ?? null
    const visitorId = request.cookies.get(VISITOR_COOKIE)?.value ?? ''

    // ── Verification gate ───────────────────────────────────────────────────
    // Banking a lead fires the instant SMS and the "call now" owner email, so
    // it may only happen for a number someone proved they hold. The ticket is
    // redeemed server-side and is single use: a client flag would be trivially
    // forgeable, and a reusable ticket would let one verified number write
    // unlimited leads.
    //
    // stage "update" is exempt: it enriches a row that was already banked
    // behind this same gate, and carries no new phone number.
    const banksLead = body.stage === 'phone' || body.stage === 'form'
    if (banksLead) {
      const ok = await consumeVerification(body.verificationId ?? '', phoneCheck.e164)
      if (!ok) {
        console.warn(
          `[demo-lead/wizard] REJECTED unverified bank stage=${body.stage} phone=${phoneCheck.e164} ` +
            `verificationId=${body.verificationId ? 'present' : 'missing'}`
        )
        return NextResponse.json(
          { error: 'Verify your number first.', field: 'code', needsVerification: true },
          { status: 400 }
        )
      }
    }

    const business = await getMarketingBusiness()
    if (!business) {
      console.error('[demo-lead/wizard] no marketing business configured')
      return NextResponse.json({ error: 'Lead capture unavailable' }, { status: 503 })
    }

    const message = buildMessage({
      trade, qualified, firstName, lastName, company, email,
      landingPath, variant, funnelVariant, attribution,
    })
    // The lead is keyed on phone, so later screens enrich the same row.
    const existing = await findPartialLeadByPhone(business.id, phoneCheck.e164)
    const isNew = !existing
    const displayName = [firstName, lastName].filter(Boolean).join(' ').trim()

    const lead = existing
      ? await db.websiteLead.update({
          where: { id: existing.id },
          data: {
            // Never blank out a name we already banked with a later empty step.
            ...(displayName ? { name: displayName } : {}),
            ...(email ? { email } : {}),
            phone: phoneCheck.e164,
            message,
            variant,
            funnelVariant,
          },
        })
      : await db.websiteLead.create({
          data: {
            businessId: business.id,
            name: displayName || phoneCheck.e164,
            phone: phoneCheck.e164,
            email: email || null,
            message,
            status: 'partial',
            variant,
            funnelVariant,
            resumeToken: newResumeToken(),
          },
        })

    // CRM record. Contact carries a real source column.
    await sideEffect('crm', () =>
      findOrCreateContact({
        businessId: business.id,
        phoneNumber: phoneCheck.e164,
        name: displayName || undefined,
        email: email || undefined,
        source: LEAD_SOURCE,
        notes: `${trade}${qualified ? '' : ' (not an owner)'}`,
      })
    )

    if (visitorId) {
      await sideEffect('coupon-bind', () =>
        db.couponClaim.updateMany({ where: { visitorId, leadId: null }, data: { leadId: lead.id } })
      )
    }

    // ── Lead-facing demo SMS ────────────────────────────────────────────────
    // Fires at the phone step by default (SEND_SMS_AT). sendLeadDemoSms claims
    // the send with a conditional DB update, so a retry, a second tab or a
    // later enrichment step can never double-text.
    // The lead has handed over a number on this request. Both the SMS and the
    // owner alert hang off this ONE expression on purpose: they drifted apart
    // once (email on isNew, SMS on the stage) and the owner silently lost every
    // returning lead.
    const banked = banksLead || isNew

    // TEST_PHONE_ALLOWLIST: my own handsets bypass BOTH send-once guards so a
    // repeat walk still fires both channels. See lib/test-allowlist.ts.
    const isTest = isTestPhone(phoneCheck.e164)
    const smsDue = SEND_SMS_AT === 'phone' ? banked : Boolean(email)
    if (smsDue && qualified) {
      await sideEffect('lead-sms', async () => {
        // Re-read: the token was minted moments ago in a side effect, and the
        // in-memory `lead` predates it.
        const fresh = await db.websiteLead.findUnique({
          where: { id: lead.id },
          select: { calendarToken: true },
        })
        const sms = await sendLeadDemoSms(lead.id, phoneCheck.e164, funnelVariant, {
          firstName,
          businessName: company,
          trade,
          // Null here just means the link goes to the bare /calendar page,
          // which still books them — it only loses the prefill.
          calendarToken: fresh?.calendarToken ?? null,
        })
        if (!sms.sent && sms.reason !== 'already_sent' && sms.reason !== 'test_allowlist') {
          console.error(`[demo-lead/wizard] lead SMS not sent leadId=${lead.id} reason=${sms.reason}`)
        }
      })
    }

    // ── Verified lead: arm ledger + server-side Lead event ───────────────────
    // Both hang off banksLead, so they fire at exactly the moment the number
    // was proven and never on a later enrichment write.
    if (banksLead) {
      // /calendar link for every text we send this lead from here on. Minted
      // once: the where-clause keeps a re-verification from rotating a token
      // that is already sitting in a text on someone's phone.
      await sideEffect('mint-calendar-token', () =>
        db.websiteLead.updateMany({
          where: { id: lead.id, calendarToken: null },
          data: { calendarToken: newCalendarToken() },
        })
      )

      // Proof of OTP, stamped on the row itself. The follow-up cron keys on
      // this and nothing else.
      await sideEffect('stamp-verified', () =>
        db.websiteLead.updateMany({
          where: { id: lead.id, otpVerifiedAt: null },
          data: { otpVerifiedAt: new Date() },
        })
      )
    }

    if (banksLead && qualified) {
      void logArmVerifiedLead({
        arm: funnelVariant,
        trade,
        businessName: company,
        phone: phoneCheck.e164,
        visitorId,
        leadId: lead.id,
      })

      // Awaited, not fire-and-forget: on Vercel the lambda can be frozen the
      // moment the response is returned, which would drop an un-awaited fetch.
      // It fails open, so a CAPI outage cannot fail the lead write above.
      // Captured before the closure: TS cannot narrow body.eventId inside one.
      const capiEventId = body.eventId
      if (capiEventId) {
        await sideEffect('capi-lead', () =>
          sendCapiLead({
            eventId: capiEventId,
          phone: phoneCheck.e164,
          firstName,
          trade,
          businessName: company,
          funnelArm: funnelVariant,
          clientIp: getClientIp(request),
          userAgent: request.headers.get('user-agent'),
          fbp: request.cookies.get('_fbp')?.value ?? null,
          fbc: request.cookies.get('_fbc')?.value ?? null,
            eventSourceUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.alignandacquire.com'}${landingPath}`,
          })
        )
      } else {
        console.warn(`[capi] SKIP leadId=${lead.id} reason=no_event_id_from_client`)
      }
    }

    // Owner is notified when the number lands, for a real business owner.
    //
    // This used to be gated on `isNew`, which meant a returning prospect was
    // re-texted but generated NO owner alert: the row already existed, so the
    // whole block including its own log line was skipped and the failure was
    // invisible. Repeat visitors are the warmest traffic on this funnel, so
    // that was backwards.
    //
    // The gate is now the same bank-path condition the SMS uses, plus a claim
    // against ownerNotifiedAt. The claim is a conditional updateMany, so two
    // concurrent requests cannot both win it, and it is time-boxed rather than
    // once-ever: someone returning days later is a real signal worth an email,
    // while a refresh or double submit inside the window is not.
    // Allowlisted test handsets skip the cooldown outright, so every walk from
    // one of my own phones produces an email. Real numbers are unaffected.
    const notifyCutoff = new Date(Date.now() - OWNER_RENOTIFY_AFTER_MS)
    let notifyDue = false
    if (qualified) {
      if (banksLead) {
        // EVERY OTP-verified lead alerts, with no cooldown and no allowlist
        // suppression — including my own test walks, which is the point: a test
        // that produces no alert is indistinguishable from a broken funnel.
        //
        // Safe to skip the claim here because banksLead means a single-use
        // verification ticket was just consumed. That ticket already guarantees
        // exactly one alert per verification; the time-boxed claim below is for
        // the path that has no ticket to lean on.
        await db.websiteLead.updateMany({
          where: { id: lead.id },
          data: { ownerNotifiedAt: new Date() },
        })
        notifyDue = true
      } else if (banked) {
        const notifyClaim = await db.websiteLead.updateMany({
          where: {
            id: lead.id,
            OR: [{ ownerNotifiedAt: null }, { ownerNotifiedAt: { lt: notifyCutoff } }],
          },
          data: { ownerNotifiedAt: new Date() },
        })
        notifyDue = notifyClaim.count > 0
      }
    }

    if (notifyDue) {
      console.log(
        `[demo-lead/wizard] owner-notify dispatch leadId=${lead.id} template=new_gate_lead ` +
          `email=${process.env.YOUR_EMAIL ?? 'business fallback'} isNew=${isNew}${isTest ? ' test=true' : ''}`
      )
      const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.alignandacquire.com').replace(/\/$/, '')
      // No per-lead admin page exists yet, so this deep-links to the leads list
      // and carries the id for a browser find. Better than no link at all.
      const leadLink = `${appUrl}/dashboard/leads?tab=website&lead=${lead.id}`
      const armLabel = funnelVariant ?? 'unassigned'
      const tradeLabel = trade || 'not asked (arm B/C)'

      await sideEffect('owner-notify', () =>
        notifyOwnerOfMarketingEvent({
        test: isTest,
        ownerEmailFallback: business.ownerEmail,
        ownerPhoneFallback: business.ownerPhone,
        subject: `Call now: ${displayName || phoneCheck.e164} (${trade || company || 'no trade given'}) [arm ${armLabel}]`,
        html: `
          <h2>New verified demo lead</h2>
          <p>Their number is verified. Call while they are still on the page.</p>
          <p><strong>First name:</strong> ${escapeHtml(firstName || displayName || 'not given')}</p>
          <p><strong>Business:</strong> ${escapeHtml(company || 'not given')}</p>
          <p><strong>Trade:</strong> ${escapeHtml(tradeLabel)}</p>
          <p><strong>Phone:</strong> <a href="tel:${escapeHtml(phoneCheck.e164)}">${escapeHtml(phoneCheck.e164)}</a></p>
          <p><strong>Funnel arm:</strong> ${escapeHtml(armLabel)}</p>
          <p><a href="${escapeHtml(leadLink)}">Open this lead</a><br>
             <span style="color:#666;font-size:12px">Lead id: ${escapeHtml(lead.id)}</span></p>
          <pre style="font-family:inherit;white-space:pre-wrap;margin:0">${escapeHtml(formatAttributionBlock(attribution))}</pre>
        `,
        smsText:
          `Call now: ${displayName || 'lead'}` +
          `${company ? ` (${company})` : ''}\n` +
          `Trade: ${tradeLabel}\n` +
          `${phoneCheck.e164}\n` +
          `Arm ${armLabel}\n` +
          leadLink,
        })
      )
    }

    console.log(
      `[demo-lead/wizard] stage=${body.stage ?? 'update'} ${isNew ? 'CREATED' : 'updated'} leadId=${lead.id} ` +
        `qualified=${qualified} arm=${funnelVariant ?? 'none'} phone=${phoneCheck.e164}`
    )

    const res = NextResponse.json({ success: true, leadId: lead.id, qualified, isNew })
    res.cookies.set(GATE_COOKIE, lead.id, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: GATE_COOKIE_MAX_AGE,
    })
    return res
  } catch (error) {
    console.error('[demo-lead/wizard] failed:', error)
    return NextResponse.json({ error: 'Could not save that. Please try again.' }, { status: 500 })
  }
}
