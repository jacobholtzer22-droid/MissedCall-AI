// ===========================================
// Ops HQ: clients to chase (CLIENT_CHASE_LIST, off by default)
// ===========================================
// Every deliverable waiting on the client for more than 3 days, oldest first,
// each with a drafted text Jacob copies and sends himself. Nothing here sends
// or writes. Pure; lib/ops/board.ts derives it from the board it already
// loaded, and only when the flag is on.
//
// Drafts: Jacob's voice, the contact's first name, GSM-7, no dashes. One per
// client step in lib/ops/steps.ts, plus a generic fallback for any other step
// that has been set to wait on the client by hand. Terminal steps (live,
// running, paused_by_client) are never chased: paused is the client's call.

import { greetingName } from '@/lib/marketing-sms-copy'
import { stepFor } from '@/lib/ops/steps'

export const CHASE_MIN_DAYS = 3
export const CHASE_CAP = 25
const DAY = 86_400_000

export function clientChaseEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.CLIENT_CHASE_LIST === 'true'
}

const DELIVERABLE_NAMES: Record<string, string> = {
  website: 'Website',
  domain: 'Domain',
  email: 'Email',
  missedcall: 'Missed call',
  ads: 'Ads',
  gbp: 'Google Business Profile',
}

/** What the generic fallback calls the work, mid sentence. */
const IN_SENTENCE: Record<string, string> = {
  website: 'your website',
  domain: 'your domain',
  email: 'your business email',
  missedcall: 'the missed call text back',
  ads: 'your Google Ads',
  gbp: 'your Google Business Profile',
}

type Draft = (hey: string) => string

/** Keyed `${type}.${step}`. */
export const CHASE_DRAFTS: Record<string, Draft> = {
  'website.brief': (hey) =>
    `${hey} Jacob here. To keep your website moving I still need your intake answers and a few photos of your work. Can you send those over when you get a minute?`,
  'website.client_review': (hey) =>
    `${hey} Jacob here. Your website preview is ready for you to look over. Tell me anything you want changed, or reply OK and I'll get it ready to go live.`,
  'domain.owner_unknown': (hey) =>
    `${hey} Jacob here. Do you know who your domain is registered with, like GoDaddy or Squarespace? If you're not sure, tell me who set up your old site and I'll track it down.`,
  'domain.transfer_requested': (hey) =>
    `${hey} Jacob here. For the domain transfer I need you to unlock the domain at your registrar and send me the auth code (also called the EPP code). Happy to walk you through it on a quick call.`,
  'domain.dns_by_client': (hey) =>
    `${hey} Jacob here. The last step for your domain is pointing it at the new site. It takes about 10 minutes on a call. When's a good time today or tomorrow?`,
  'missedcall.forwarding': (hey) =>
    `${hey} Jacob here. To turn on the missed call text back I need call forwarding set up on your business line. It's a quick call with your phone carrier, or I can walk you through it. When works for you?`,
  'ads.payment': (hey) =>
    `${hey} Jacob here. Your Google Ads account is ready, it just needs a payment method added before anything can run. Want me to walk you through it?`,
  'ads.budget': (hey) =>
    `${hey} Jacob here. Before I turn your ads on, can you confirm the monthly ad budget you're comfortable with? Just reply with a number.`,
  'ads.business_docs': (hey) =>
    `${hey} Jacob here. Google needs your LLC or business documents to verify the ad account. Can you send me a photo or PDF of your business license or articles of organization?`,
  'gbp.create': (hey) =>
    `${hey} Jacob here. Next up is your Google Business Profile. Can you create it, or let me know if you already have one? I'll take it from there.`,
  'gbp.manager_access': (hey) =>
    `${hey} Jacob here. Can you add me as a manager on your Google Business Profile? It takes 2 minutes and I can walk you through it.`,
}

/** The drafted text for one deliverable step. Never empty. */
export function chaseDraft(type: string, step: string | null, contactName: string | null | undefined): string {
  const hey = `Hey${greetingName(contactName)},`
  const draft = CHASE_DRAFTS[`${type}.${step}`]
  if (draft) return draft(hey)
  return `${hey} Jacob here. Checking in on ${IN_SENTENCE[type] ?? 'your project'}. I'm waiting on one thing from you to keep it moving. Can you call or text me back when you get a minute?`
}

type ChaseDeliverable = {
  id: string
  type: string
  step: string | null
  stepLabel: string | null
  waitingOn: string | null
  stepUpdatedAt: string | null
}

type ChaseEngagement = {
  id: string
  displayName: string
  contactName: string | null
  phone: string | null
  stage: string
  lastContactedAt: string | null
  deliverables: ChaseDeliverable[]
}

export type BoardChaseRow = {
  engagementId: string
  deliverableId: string
  clientName: string
  deliverable: string
  stepLabel: string
  daysWaiting: number
  /** "last contacted 4 days ago", "last contacted today" or "never contacted". */
  lastContacted: string
  phone: string | null
  draft: string
}

function lastContactedLabel(iso: string | null, now: Date): string {
  if (!iso) return 'never contacted'
  const days = Math.floor((now.getTime() - new Date(iso).getTime()) / DAY)
  if (days <= 0) return 'last contacted today'
  return `last contacted ${days} day${days === 1 ? '' : 's'} ago`
}

export function clientChaseList(engagements: ChaseEngagement[], now: Date): BoardChaseRow[] {
  const rows: (BoardChaseRow & { since: number })[] = []
  for (const e of engagements) {
    if (e.stage === 'ignored' || e.stage === 'churned') continue
    for (const d of e.deliverables) {
      if (d.waitingOn !== 'client' || !d.stepUpdatedAt) continue
      const s = stepFor(d.type, d.step)
      if (s?.terminal) continue
      const since = new Date(d.stepUpdatedAt).getTime()
      const days = Math.floor((now.getTime() - since) / DAY)
      if (days < CHASE_MIN_DAYS) continue
      rows.push({
        since,
        engagementId: e.id,
        deliverableId: d.id,
        clientName: e.displayName.trim(),
        deliverable: DELIVERABLE_NAMES[d.type] ?? d.type,
        stepLabel: d.stepLabel ?? s?.label ?? d.step ?? 'Waiting on client',
        daysWaiting: days,
        lastContacted: lastContactedLabel(e.lastContactedAt, now),
        phone: e.phone,
        draft: chaseDraft(d.type, d.step, e.contactName),
      })
    }
  }
  return rows
    .sort((a, b) => a.since - b.since)
    .slice(0, CHASE_CAP)
    .map(({ since: _since, ...r }) => r)
}
