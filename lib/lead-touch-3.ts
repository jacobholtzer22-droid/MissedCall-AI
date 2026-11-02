// ===========================================
// LEAD TOUCH 3 (LEAD_TOUCH_3_SMS, off by default)
// ===========================================
// A third text to a verified lead who never booked: day 4 to 7 after OTP, only
// after the 24h follow-up (touch 2) went out, same 11:00 AM to 7:00 PM ET
// window. A second step of /api/cron/lead-follow-up, which already returns
// early outside that window. With the flag off the route never calls this.
//
// Same exclusions as touch 2, checked in the same order: spam / deleted
// statuses and junk (in the query), booked by phone (any non-cancelled
// appointment), test allowlist, STOP. Then claim, send, record.
//
// The once-only claim. WebsiteLead has no free-text field that is safe for a
// marker: `message` is rebuilt wholesale by the wizard on a return visit, which
// would erase it and let the text go twice, and every other text column is
// either the lead's own words or read by Meta / CAPI. So the claim is the
// outbound log row itself: a Message on the person's demo-line thread with the
// deterministic id `leadtouch3_<leadId>`. Creating it is atomic (primary key),
// so two overlapping runs cannot both win, and it is the same row
// logMarketingOutbound writes for every automated send, holding the exact text.
// Nothing parses Message ids. If the send does not go out the row is deleted,
// the same release touch 2 does with followUpSentAt, so a later run can retry.
//
// Everything with a side effect comes in through LeadTouch3Deps, so
// lib/lead-touch-3.test.ts runs this against fakes and no test can send.

import { isTestPhone } from '@/lib/test-allowlist'
import { isLeadTouch3Placeholder, leadTouch3Body, LEAD_TOUCH_3_RESULT } from '@/lib/lead-sms'

/** LEAD_TOUCH_3_SMS, off unless exactly 'true'. */
export function leadTouch3Enabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.LEAD_TOUCH_3_SMS === 'true'
}

export const TOUCH_3_MIN_AGE_HOURS = 72
export const TOUCH_3_MAX_AGE_HOURS = 168
/** Never closer than this to touch 2. */
export const TOUCH_3_MIN_GAP_HOURS = 24

export function touch3MessageId(leadId: string): string {
  return `leadtouch3_${leadId}`
}

export type Touch3Lead = {
  id: string
  phone: string | null
  name: string | null
  message: string | null
  calendarToken: string | null
  otpVerifiedAt: Date | null
  followUpSentAt: Date | null
}

/** Day 4 to 7 after OTP, and at least 24h after touch 2. */
export function touch3Due(lead: Pick<Touch3Lead, 'otpVerifiedAt' | 'followUpSentAt'>, now: Date): boolean {
  if (!lead.otpVerifiedAt || !lead.followUpSentAt) return false
  const age = (now.getTime() - lead.otpVerifiedAt.getTime()) / 3_600_000
  const gap = (now.getTime() - lead.followUpSentAt.getTime()) / 3_600_000
  return age >= TOUCH_3_MIN_AGE_HOURS && age <= TOUCH_3_MAX_AGE_HOURS && gap >= TOUCH_3_MIN_GAP_HOURS
}

export type LeadTouch3Deps = {
  /** Verified, touch-2-sent, not spam/deleted/junk leads with OTP in [since, until]. */
  findCandidates(since: Date, until: Date): Promise<Touch3Lead[]>
  isBooked(phone: string): Promise<boolean>
  isOptedOut(phone: string, leadId: string): Promise<boolean>
  /** Atomic once-only claim. False when the row already exists. */
  claim(lead: Touch3Lead, body: string): Promise<boolean>
  release(leadId: string): Promise<void>
  /** Returns the provider id. Throws on failure. */
  send(phone: string, body: string): Promise<string | null>
  recordSent(leadId: string, providerId: string | null): Promise<void>
  log?: (line: string) => void
}

export type LeadTouch3Result = { candidates: number; sent: number; skipped: number; errors: string[]; refused?: 'result_placeholder' }

export async function runLeadTouch3(
  deps: LeadTouch3Deps,
  now: Date,
  result: string = LEAD_TOUCH_3_RESULT
): Promise<LeadTouch3Result> {
  const log = deps.log ?? ((line: string) => console.log(line))
  // The result line is Jacob's to write. Until he does, nothing goes out.
  if (isLeadTouch3Placeholder(result)) {
    log('[lead-touch-3] SKIP reason=result_placeholder')
    return { candidates: 0, sent: 0, skipped: 0, errors: [], refused: 'result_placeholder' }
  }

  const out: LeadTouch3Result = { candidates: 0, sent: 0, skipped: 0, errors: [] }
  const rows = await deps.findCandidates(
    new Date(now.getTime() - TOUCH_3_MAX_AGE_HOURS * 3_600_000),
    new Date(now.getTime() - TOUCH_3_MIN_AGE_HOURS * 3_600_000)
  )
  out.candidates = rows.length
  const skip = (lead: Touch3Lead, reason: string) => {
    log(`[lead-touch-3] SKIP leadId=${lead.id} reason=${reason}`)
    out.skipped++
  }

  for (const lead of rows) {
    try {
      const phone = lead.phone?.trim()
      if (!phone) { skip(lead, 'no_phone'); continue }
      if (!touch3Due(lead, now)) { skip(lead, 'not_due'); continue }
      if (await deps.isBooked(phone)) { skip(lead, 'booked'); continue }
      // Touch 2 never texts allowlisted test handsets; neither does this.
      if (isTestPhone(phone)) { skip(lead, 'test_allowlist'); continue }
      if (await deps.isOptedOut(phone, lead.id)) { skip(lead, 'opted_out'); continue }

      const firstName = (lead.message?.match(/^First name: (.+)$/m)?.[1] ?? lead.name ?? '').trim()
      const body = leadTouch3Body({ firstName, calendarToken: lead.calendarToken }, result)

      if (!(await deps.claim(lead, body))) { skip(lead, 'already_sent'); continue }
      let providerId: string | null
      try {
        providerId = await deps.send(phone, body)
      } catch (err) {
        await deps.release(lead.id)
        throw err
      }
      await deps.recordSent(lead.id, providerId)
      log(`[lead-touch-3] SENT leadId=${lead.id} providerId=${providerId ?? 'unknown'}`)
      out.sent++
    } catch (err) {
      out.errors.push(`${lead.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return out
}
