// ===========================================
// LEAD-FACING SMS
// ===========================================
// The text that delivers the demo. This did NOT exist before: the old gate
// wrote a lead and notified the owner, and never messaged the lead at all.
//
// Compliance notes, because this is a cold-ish send:
//   - It goes from the marketing 10DLC number, the same pipeline client traffic
//     uses, never from a number shared across tenants.
//   - It opens by naming the sender and ends with "Reply STOP to opt out".
//   - It carries one link: the lead's personalized /calendar?l=<token> link
//     (plus SMS UTMs), the same one the 24h follow-up uses. That token is how
//     texted bookings are attributed to the lead.
//   - The gate shows consent microcopy above the phone input before it is sent.
//   - STOP is handled by the SMS webhook, which writes a BlockedNumber row; both
//     senders here check it first (lib/sms-opt-out) and skip an opted-out lead.
//   - It fires exactly once per lead, enforced by a conditional DB claim rather
//     than an in-memory flag, so a retry or a second tab cannot double-text.

import Telnyx from 'telnyx'
import { db } from '@/lib/db'
import { normalizeToE164 } from '@/lib/phone-utils'
import { isTestPhone } from '@/lib/test-allowlist'
import { calendarLink } from '@/lib/lead-token'
import { watchLink } from '@/lib/watch-token'
import { isOptedOut } from '@/lib/sms-opt-out'

/** Unguessable, URL-safe. Following this link identifies someone AS this lead. */
export function newResumeToken(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let out = ''
  for (let i = 0; i < 28; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)]
  return out
}

/**
 * NOTE: currently unused. The lead SMS no longer carries a link, so nothing
 * hands this token out. /api/demo-resume still works if a link is reintroduced;
 * tokens are still minted so existing leads would keep working.
 */
export function resumeLink(token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || 'https://www.alignandacquire.com'
  return `${base}/api/demo-resume?t=${token}`
}

export type LeadContext = {
  firstName?: string | null
  businessName?: string | null
  trade?: string | null
  /** Token for the /calendar link. Null falls back to the bare page. */
  calendarToken?: string | null
  /** Watch-page token. Preferred: it lands them on the video AND the calendar. */
  watchUrl?: string | null
  /** Which arm's watch page that token belongs to. */
  watchArm?: 'A' | 'B' | null
}

/** "Marcus" from "Marcus Vandenberg". Empty when we have nothing usable. */
function greeting(ctx?: LeadContext): string {
  const first = ctx?.firstName?.trim().split(/\s+/)[0] ?? ''
  // Guard against the banked-lead placeholder, where the stored "name" is the
  // phone number. "Hey +16165551234," is worse than no name at all.
  if (!first || first.length < 2 || /\d/.test(first)) return ''
  return ` ${first}`
}

/**
 * Link we text. /calendar with the lead's signed token, so the page opens
 * prefilled on whatever handset read the message — /book would have re-gated
 * them, and the gate cookie does not follow a text to a different device.
 */
function bookingLink(ctx?: LeadContext): string {
  // The watch page has the video and the booking widget on it, so it is the
  // better destination when we have a token for it. /calendar is the fallback.
  if (ctx?.watchUrl) return watchLink(ctx.watchUrl, ctx.watchArm ?? 'A')
  return calendarLink(ctx?.calendarToken ?? null, ctx?.watchArm ?? null)
}

/**
 * The instant text after OTP. Copy approved by Jacob, Sep 2026: identifies the
 * sender, no pitch, one link, opt-out line. The link is the personalized
 * /calendar link, deliberately NOT the watch page: the copy says "my calendar",
 * and /calendar?l=<token> opens prefilled on whatever phone reads the text.
 * A null token (never expected: the wizard mints it before this is scheduled)
 * degrades to the bare /calendar page, which still books.
 *
 * Exported for tests. 334 characters with a real token and UTMs, GSM-7, so
 * 3 SMS segments.
 */
export function leadTextBody(ctx?: LeadContext): string {
  const link = calendarLink(ctx?.calendarToken ?? null, ctx?.watchArm ?? null)
  return (
    `This is Jacob with Align and Acquire. Thanks for taking a look. ` +
    `I'll follow up with you soon. Want to skip the wait? ` +
    `Book a time on my calendar and we'll go over everything and see if it's a fit: ${link}` +
    `\n\nReply STOP to opt out.`
  )
}

/** 24h nudge, sent only when they never booked. */
function followUpBody(ctx?: LeadContext): string {
  const link = bookingLink(ctx)
  const who = greeting(ctx)
  const biz = ctx?.businessName?.trim()
  const line = biz ? ` for ${biz}` : ''
  return (
    `Hey${who}, Jacob from Align and Acquire again. ` +
    `You watched the demo yesterday but didn't grab a time. ` +
    `If you want to see what it'd look like${line}, grab a time here: ${link}. ` +
    `Reply STOP to opt out.`
  )
}

type Result = { sent: boolean; reason?: string; providerId?: string }

/**
 * Send once. Claims the send with a conditional update BEFORE dispatching, so
 * two concurrent requests cannot both text the same person. On dispatch failure
 * the claim is released so a later step can retry.
 */
export async function sendLeadDemoSms(
  leadId: string,
  phone: string,
  funnelVariant: string | null,
  ctx?: LeadContext
): Promise<Result> {
  const from = process.env.MARKETING_TELNYX_NUMBER || null
  const to = normalizeToE164(phone)

  // TEST_PHONE_ALLOWLIST numbers DO receive the lead SMS, and bypass the
  // send-once claim so a repeat test walk texts again.
  //
  // This reverses the suppression added yesterday. Suppressing it meant a test
  // walk could not prove the send path worked end to end — the thing most worth
  // testing was the one thing testing could not reach.
  const isTest = isTestPhone(to || phone)
  const tag = isTest ? ' test=true' : ''

  // Marked by hand in /admin as not a contractor. First check in the function,
  // ahead of the sender and phone guards, so the decision never depends on how
  // Telnyx happens to be configured. Checked here rather than at each call site
  // because this function is the single door every automated lead-facing text
  // goes through, present and future.
  const flagged = await db.websiteLead
    .findUnique({ where: { id: leadId }, select: { junk: true, businessId: true } })
    .catch(() => null)
  if (flagged?.junk) {
    console.log(`[lead-sms] SKIP leadId=${leadId} reason=junk${tag}`)
    return { sent: false, reason: 'junk' }
  }
  // Checked before the one-shot claim, so an opted-out lead never gets
  // demoSmsSentAt stamped and is therefore never eligible for the follow-up.
  if (flagged && (await isOptedOut(flagged.businessId, phone, `leadId=${leadId}`))) {
    console.log(`[lead-sms] SKIP leadId=${leadId} reason=opted_out${tag}`)
    return { sent: false, reason: 'opted_out' }
  }

  if (!from || !process.env.TELNYX_API_KEY) {
    console.error(
      `[lead-sms] SKIP leadId=${leadId} reason=no_sender ` +
        `MARKETING_TELNYX_NUMBER=${from ? 'set' : 'MISSING'} TELNYX_API_KEY=${process.env.TELNYX_API_KEY ? 'set' : 'MISSING'}${tag}`
    )
    return { sent: false, reason: 'no_sender' }
  }
  if (!to) {
    console.error(`[lead-sms] SKIP leadId=${leadId} reason=unusable_phone raw=${JSON.stringify(phone)}${tag}`)
    return { sent: false, reason: 'unusable_phone' }
  }


  // One-shot claim. count === 0 means someone already sent it.
  //
  // Skipped entirely for allowlisted test handsets: the whole point of the
  // allowlist is that a repeat walk texts again. The column is still stamped
  // below on success so the row reflects the most recent send.
  // Allowlisted handsets skip the claim so repeat walks re-text; the column is
  // still stamped after a successful send so the row stays honest.
  if (!isTest) {
    const claim = await db.websiteLead.updateMany({
      where: { id: leadId, demoSmsSentAt: null },
      data: { demoSmsSentAt: new Date() },
    })
    if (claim.count === 0) {
      console.log(`[lead-sms] SKIP leadId=${leadId} reason=already_sent`)
      return { sent: false, reason: 'already_sent' }
    }
  }

  try {
    const telnyx = new Telnyx({ apiKey: process.env.TELNYX_API_KEY })
    const res = await telnyx.messages.send({ from, to, text: leadTextBody(ctx) })
    const providerId = (res as { data?: { id?: string } })?.data?.id ?? 'unknown'
    console.log(
      `[lead-sms] SENT leadId=${leadId} template=lead_followup to=${to} from=${from} ` +
        `arm=${funnelVariant ?? 'none'} providerId=${providerId}${tag}`
    )
    if (isTest) {
      await db.websiteLead.updateMany({ where: { id: leadId }, data: { demoSmsSentAt: new Date() } })
    }
    // Test sends never claimed the column, so stamp it here. Keeps the row
    // honest about when this lead was last texted without gating the next send.
    return { sent: true, providerId }
  } catch (err) {
    // Release the claim so a later wizard step can retry. Nothing to release
    // for a test send, which never claimed.
    if (!isTest) {
      await db.websiteLead.updateMany({ where: { id: leadId }, data: { demoSmsSentAt: null } })
    }
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[lead-sms] FAILED leadId=${leadId} template=lead_followup to=${to} from=${from} error=${message}${tag}`)
    return { sent: false, reason: message }
  }
}

/**
 * 24h follow-up for a lead that watched but never booked.
 *
 * Same sender, same one-shot claim discipline as the instant text, and the same
 * allowlist suppression. Called only by the cron, which decides eligibility.
 */
export async function sendLeadFollowUpSms(
  leadId: string,
  phone: string,
  ctx?: LeadContext
): Promise<Result> {
  const from = process.env.MARKETING_TELNYX_NUMBER || null
  const to = normalizeToE164(phone)

  if (isTestPhone(to || phone)) {
    console.log(`[lead-followup] SUPPRESSED leadId=${leadId} reason=test_allowlist`)
    return { sent: false, reason: 'test_allowlist' }
  }
  // The cron checks this before claiming; checked again here so no caller can
  // text an opted-out lead through this door.
  const row = await db.websiteLead.findUnique({ where: { id: leadId }, select: { businessId: true } }).catch(() => null)
  if (!row || (await isOptedOut(row.businessId, phone, `leadId=${leadId}`))) {
    console.log(`[lead-followup] SKIP leadId=${leadId} reason=${row ? 'opted_out' : 'lead_not_found'}`)
    return { sent: false, reason: row ? 'opted_out' : 'lead_not_found' }
  }

  if (!from || !process.env.TELNYX_API_KEY) {
    console.error(`[lead-followup] SKIP leadId=${leadId} reason=no_sender`)
    return { sent: false, reason: 'no_sender' }
  }
  if (!to) return { sent: false, reason: 'unusable_phone' }

  // The claim lives in the cron, which takes it BEFORE calling this and
  // releases it if the send fails. Claiming again here would always lose.

  try {
    const telnyx = new Telnyx({ apiKey: process.env.TELNYX_API_KEY })
    const res = await telnyx.messages.send({ from, to, text: followUpBody(ctx) })
    const providerId = (res as { data?: { id?: string } })?.data?.id ?? 'unknown'
    console.log(`[lead-followup] SENT leadId=${leadId} to=${to} from=${from} providerId=${providerId}`)
    return { sent: true, providerId }
  } catch (err) {
    // The cron releases the claim on a falsy result.
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[lead-followup] FAILED leadId=${leadId} error=${message}`)
    return { sent: false, reason: message }
  }
}
