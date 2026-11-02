// ===========================================
// Ops HQ: leads to call (LEAD_CALL_PROMPT, off by default)
// ===========================================
// Verified /book leads who never booked, for Jacob to call by hand. Read only:
// nothing here sends or writes. Pure; lib/ops/board.ts runs the queries and
// passes the rows in, and only when the flag is on.
//
// Eligible: OTP verified 24h to 14 days ago, not booked (any non-cancelled
// appointment on the phone, the same rule as the follow-up cron), not
// spam / deleted / junk, not on the test allowlist.
//
// Newest first, capped at 20. A lead verified yesterday is the warmest call on
// the list; oldest first would let two weeks of cold leads push today's out of
// the cap. Anything older than 14 days drops off on its own.

import { isTestPhone } from '@/lib/test-allowlist'

export const CALL_PROMPT_MIN_HOURS = 24
export const CALL_PROMPT_LOOKBACK_DAYS = 14
export const CALL_PROMPT_CAP = 20
const EXCLUDED_STATUSES = ['spam', 'deleted']

export function leadCallPromptEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.LEAD_CALL_PROMPT === 'true'
}

export type CallPromptLead = {
  id: string
  name: string | null
  phone: string | null
  message: string | null
  businessName: string | null
  status: string
  junk: boolean
  otpVerifiedAt: Date | null
}

export type BoardCallPrompt = {
  leadId: string
  name: string
  company: string
  phone: string
  hoursSinceOtp: number
}

/** First name from the wizard block, else the name column; never the phone placeholder. */
function displayName(l: CallPromptLead): string {
  const raw = (l.message?.match(/^First name: (.+)$/m)?.[1] ?? l.name ?? '').trim()
  // A banked lead stores its phone number as the name until a real one arrives.
  return raw.replace(/\D/g, '').length >= 7 ? '' : raw
}

export function callPromptWindow(now: Date): { since: Date; until: Date } {
  return {
    since: new Date(now.getTime() - CALL_PROMPT_LOOKBACK_DAYS * 86_400_000),
    until: new Date(now.getTime() - CALL_PROMPT_MIN_HOURS * 3_600_000),
  }
}

/** `bookedPhones`: E.164 phones with any non-cancelled appointment. */
export function callPromptList(leads: CallPromptLead[], bookedPhones: Set<string>, now: Date): BoardCallPrompt[] {
  const { since, until } = callPromptWindow(now)
  const seen = new Set<string>()
  return leads
    .filter((l) => l.otpVerifiedAt && l.otpVerifiedAt >= since && l.otpVerifiedAt <= until)
    .filter((l) => !EXCLUDED_STATUSES.includes(l.status) && !l.junk)
    .filter((l) => l.phone && !bookedPhones.has(l.phone) && !isTestPhone(l.phone))
    .sort((a, b) => b.otpVerifiedAt!.getTime() - a.otpVerifiedAt!.getTime())
    // One row per phone: the newest lead wins.
    .filter((l) => (seen.has(l.phone!) ? false : (seen.add(l.phone!), true)))
    .slice(0, CALL_PROMPT_CAP)
    .map((l) => ({
      leadId: l.id,
      name: displayName(l),
      company: (l.businessName ?? l.message?.match(/^Company: (.+)$/m)?.[1] ?? '').trim(),
      phone: l.phone!,
      hoursSinceOtp: Math.floor((now.getTime() - l.otpVerifiedAt!.getTime()) / 3_600_000),
    }))
}
