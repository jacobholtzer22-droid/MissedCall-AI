// ===========================================
// Google Ads billing: an invite, never a card (ADS_BILLING_INVITE, off by default)
// ===========================================
// We never collect the card for ad spend: the client adds it in Google Ads,
// and Google bills them directly (questionnaire q18 and q20). Three parts:
//
//   wizard step 7   (Google Ads clients only) says the invite is coming. Nothing collected.
//   the invite      when the ads account is bound (a customer id on the client), ONE
//                   card "Send Google Ads billing invite to <q17 Gmail>". It is fix 7's
//                   ads_invite card (lib/ops/ads-account.ts, CustomerUserAccessInvitationService
//                   through applyInvite), not a second mechanism, and never a duplicate:
//                   any ads_invite card for the client, pending, approved or applied, means
//                   no new one. Push sends it; nothing is automatic.
//                   Role ADMIN: as far as I know only Admin access can set up billing (the
//                   payments profile and payment method) in Google Ads; Standard can view
//                   billing but not set it up. UNVERIFIED: Jacob to confirm.
//   the fallback    no Gmail, no Google Ads API credentials, or Google refused the invite:
//                   a Ready-to-send draft (CLIENT_SEND_DRAFTS) with the steps the client
//                   follows in Google Ads. The steps are from my knowledge of the Google Ads
//                   UI and UNVERIFIED: the draft's "why" says so, for Jacob to check.
// Advertiser verification: the wizard's legal name, address and ZIP are copied onto the
// ads deliverable (evidence.advertiserLegal), which the verification_docs step shows.
//
// Pure.

export function adsBillingInviteEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.ADS_BILLING_INVITE === 'true'
}

export const BILLING_INVITE_ROLE = 'ADMIN' as const

export type AdvertiserLegal = { legalName: string; address: string; zip: string }

/** The wizard's legal details, when any were given. */
export function advertiserLegalFrom(legal: { legalName?: string; address?: string; zip?: string } | null | undefined): AdvertiserLegal | null {
  const l = { legalName: legal?.legalName?.trim() ?? '', address: legal?.address?.trim() ?? '', zip: legal?.zip?.trim() ?? '' }
  return l.legalName || l.address || l.zip ? l : null
}

export function legalLines(l: AdvertiserLegal): string[] {
  return [`Legal name: ${l.legalName || '(not given)'}`, `Address: ${l.address || '(not given)'}`, `ZIP: ${l.zip || '(not given)'}`]
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** The q17 Gmail: the structured intake field, else the raw answer when it is one address. */
export function q17Email(structured: string | null | undefined, rawAnswer: string | null | undefined): string | null {
  const s = structured?.trim()
  if (s && EMAIL.test(s)) return s.toLowerCase()
  const found = (rawAnswer ?? '').match(/[^@\s,;<>()]+@[^@\s,;<>()]+\.[a-z]{2,}/gi) ?? []
  return found.length === 1 ? found[0].toLowerCase() : null
}

export type InviteCard = { kind: string; status: string; detail: Record<string, unknown> }

export type InviteFacts = {
  engagementId: string
  client: string
  customerId: string | null
  email: string | null
  /** missingAdsEnv() is empty: the Google Ads API can be called. */
  apiReady: boolean
  neverTouch: boolean
  /** Every ads_invite card for this client. */
  inviteCards: InviteCard[]
}

export type InviteDecision =
  | { action: 'card'; title: string; detail: Record<string, unknown>; expected: string }
  | { action: 'draft'; reason: string }
  | { action: 'none'; reason: string }

const LIVE = ['pending', 'approved', 'applied']

export function billingInviteDecision(f: InviteFacts): InviteDecision {
  if (f.neverTouch) return { action: 'none', reason: `${f.client} is on the never-touch list` }
  if (!f.customerId) return { action: 'none', reason: 'the ads account is not bound yet' }
  const live = f.inviteCards.find((c) => LIVE.includes(c.status))
  if (live) return { action: 'none', reason: `an invite card already exists (${live.status})` }
  const failed = f.inviteCards.find((c) => c.status === 'failed')
  if (failed) return { action: 'draft', reason: 'Google refused the invite' }
  if (!f.email) return { action: 'draft', reason: 'no Gmail for the account (q17)' }
  if (!f.apiReady) return { action: 'draft', reason: 'the Google Ads API is not set up here' }
  return {
    action: 'card',
    title: `Send Google Ads billing invite to ${f.email}`,
    detail: { action: 'invite_user', engagementId: f.engagementId, customerId: f.customerId, email: f.email, role: BILLING_INVITE_ROLE, purpose: 'billing' },
    expected: `Sends Google's access invitation to ${f.email} (q17) as Admin on ${formatCustomerId(f.customerId)}, so the client can add the payment method for the ads in Google Ads. Google bills the client directly; nothing else changes. Admin is used because, as far as I know, only Admin can set up billing (unverified).`,
  }
}

export const formatCustomerId = (id: string) => (/^\d{10}$/.test(id) ? `${id.slice(0, 3)}-${id.slice(3, 6)}-${id.slice(6)}` : id)

// -------------------------------------------
// Client copy
// -------------------------------------------

export const ADS_BILLING_COPY = {
  title: 'Google Ads billing',
  invite: 'Google will email you an invite to add your payment method for your ads; it takes 2 minutes.',
  separate: 'Your ad spend is billed by Google directly, separate from what you pay me.',
  nothingHere: "There's nothing to enter here.",
}

/**
 * The fallback text: what the client does in Google Ads. From my knowledge of the
 * Google Ads UI, UNVERIFIED (the draft's why says so). GSM-7, no dashes.
 */
export function billingStepsText(o: { name: string; email: string | null; customerId: string; reason: string; legal: AdvertiserLegal | null }): string {
  const hey = o.name ? `Hey ${o.name}, Jacob here.` : 'Hey, Jacob here.'
  const access = !o.email
    ? 'Text me the Gmail you want on the account and I will send you Google\'s invite to it. Then accept the invite from the email Google sends you.'
    : `Accept the invite from the email Google Ads sends to ${o.email}.`
  const who = o.legal?.legalName
    ? `Account type Business, with your official name and address: ${o.legal.legalName}, ${[o.legal.address, o.legal.zip].filter(Boolean).join(' ') || 'your business address'}.`
    : 'Account type Business, with your official business name and address exactly as they are on your LLC paperwork.'
  return [
    `${hey} Your Google Ads account is set up. Next is adding the card Google bills your ad spend to. That goes to Google directly, separate from what you pay me, and it takes about 2 minutes:`,
    [
      `1. ${access}`,
      `2. Sign in at ads.google.com and open account ${formatCustomerId(o.customerId)}.`,
      '3. Open Billing in the left menu, then Settings.',
      '4. Billing country: United States. The currency is already US dollars.',
      `5. ${who}`,
      '6. Add your card under Payment methods and save.',
    ].join('\n'),
    'Text me when it is done and I will take it from there.',
  ].join('\n\n')
}

/** Why the draft is there, for Jacob. */
export function billingDraftWhy(reason: string, email: string | null): string {
  return `${reason}; ${email ? `send Google's invite to ${email} from the Ads UI first (Admin, Access and security). ` : ''}the steps are from Claude's knowledge of Google Ads, unverified: check them before sending`
}
