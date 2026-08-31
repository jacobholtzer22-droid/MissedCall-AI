// ===========================================
// LEAD-FACING SMS
// ===========================================
// The text that delivers the demo. This did NOT exist before: the old gate
// wrote a lead and notified the owner, and never messaged the lead at all.
//
// Compliance notes, because this is a cold-ish send:
//   - It goes from the marketing 10DLC number, the same pipeline client traffic
//     uses, never from a number shared across tenants.
//   - It carries NO link. The message is a personal follow-up, not a delivery
//     mechanism, so there is nothing to click and nothing to phish.
//   - The gate shows consent microcopy above the phone input before it is sent.
//   - Body carries "Reply STOP to opt out". STOP is handled by the existing SMS
//     webhook, which writes a BlockedNumber row.
//   - It fires exactly once per lead, enforced by a conditional DB claim rather
//     than an in-memory flag, so a retry or a second tab cannot double-text.

import Telnyx from 'telnyx'
import { db } from '@/lib/db'
import { normalizeToE164 } from '@/lib/phone-utils'

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

function body(): string {
  return (
    `Hey, it's Jacob from Align & Acquire. Thanks for showing interest. ` +
    `I'll personally reach out to you shortly. ` +
    `Questions in the meantime? Just reply here. ` +
    `Reply STOP to opt out.`
  )
}

type Result = { sent: boolean; reason?: string; providerId?: string }

/**
 * Send once. Claims the send with a conditional update BEFORE dispatching, so
 * two concurrent requests cannot both text the same person. On dispatch failure
 * the claim is released so a later step can retry.
 */
export async function sendLeadDemoSms(leadId: string, phone: string, funnelVariant: string | null): Promise<Result> {
  const from = process.env.MARKETING_TELNYX_NUMBER || null
  const to = normalizeToE164(phone)

  if (!from || !process.env.TELNYX_API_KEY) {
    console.error(
      `[lead-sms] SKIP leadId=${leadId} reason=no_sender ` +
        `MARKETING_TELNYX_NUMBER=${from ? 'set' : 'MISSING'} TELNYX_API_KEY=${process.env.TELNYX_API_KEY ? 'set' : 'MISSING'}`
    )
    return { sent: false, reason: 'no_sender' }
  }
  if (!to) {
    console.error(`[lead-sms] SKIP leadId=${leadId} reason=unusable_phone raw=${JSON.stringify(phone)}`)
    return { sent: false, reason: 'unusable_phone' }
  }

  // One-shot claim. count === 0 means someone already sent it.
  const claim = await db.websiteLead.updateMany({
    where: { id: leadId, demoSmsSentAt: null },
    data: { demoSmsSentAt: new Date() },
  })
  if (claim.count === 0) {
    console.log(`[lead-sms] SKIP leadId=${leadId} reason=already_sent`)
    return { sent: false, reason: 'already_sent' }
  }

  try {
    const telnyx = new Telnyx({ apiKey: process.env.TELNYX_API_KEY })
    const res = await telnyx.messages.send({ from, to, text: body() })
    const providerId = (res as { data?: { id?: string } })?.data?.id ?? 'unknown'
    console.log(
      `[lead-sms] SENT leadId=${leadId} template=lead_followup to=${to} from=${from} ` +
        `video=${funnelVariant ?? 'none'} providerId=${providerId}`
    )
    return { sent: true, providerId }
  } catch (err) {
    // Release the claim so a later wizard step can retry.
    await db.websiteLead.updateMany({ where: { id: leadId }, data: { demoSmsSentAt: null } })
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[lead-sms] FAILED leadId=${leadId} template=lead_followup to=${to} from=${from} error=${message}`)
    return { sent: false, reason: message }
  }
}
