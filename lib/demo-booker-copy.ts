// ===========================================
// MARKETING DEMO BOOKER COPY: EMAIL + INVITE (/book)
// ===========================================
// The confirmation email /api/demo-book sends, and the title and description of
// the Google invite createMarketingCalendarEvent creates. Pure string builders,
// no I/O, so scripts/preview-booker-messages.ts renders exactly what production
// sends by calling these same functions.
//
// Times come from lib/booker-time via demoWhen, in the booker's zone, same as
// the texts in lib/marketing-sms-copy.ts. No em or en dashes anywhere in here.
//
// Client-tenant invites (createCalendarEvent) do NOT use this module.

import { demoWhen, formatReschedulePhone, greetingName, type DemoSmsParams } from '@/lib/marketing-sms-copy'

export type DemoBookerCopyParams = DemoSmsParams & {
  /** Founder video, absolute URL. Its line is dropped when absent. */
  videoUrl?: string | null
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** One paragraph of the email, rendered both ways from the same source. */
type Para = { text: string; html: string }

function para(text: string, html?: string): Para {
  return { text, html: html ?? escapeHtml(text) }
}

function link(label: string, url: string): string {
  return `<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`
}

/**
 * Confirmation email. `text` is the plain-text part and what the preview
 * prints; `html` is the same paragraphs with the two links made clickable.
 */
export function confirmationEmail(params: DemoBookerCopyParams): {
  subject: string
  text: string
  html: string
} {
  const when = demoWhen(params)
  const phone = formatReschedulePhone(params.ownerPhone)
  const meet = params.meetLink?.trim()
  const video = params.videoUrl?.trim()

  const paras: Para[] = [
    para(`Hi${greetingName(params.firstName)},`),
    para(`You're set for ${when.dateLong} at ${when.timeMarked}.`),
    ...(meet ? [para(`Join here: ${meet}`, `Join here: ${link(meet, meet)}`)] : []),
    para(
      "I'll show you the system running on real client accounts: the actual text-back conversations " +
        "and the jobs that got booked from them. Then I'll answer whatever questions you have. " +
        "It usually takes about 15 minutes. I block 30 so we're never rushed."
    ),
    ...(video
      ? [
          para(
            `Got 2 minutes before then? Watch this first: ${video}`,
            `Got 2 minutes before then? Watch this first: ${link('Watch the video', video)}`
          ),
        ]
      : []),
    ...(phone ? [para(`Need a different time? Text or call my cell at ${phone}.`)] : []),
    para('Jacob\nAlign and Acquire', 'Jacob<br>Align and Acquire'),
  ]

  return {
    subject: `You're booked: ${when.dateShort} at ${when.timeMarked}`,
    text: paras.map((p) => p.text).join('\n\n'),
    html: paras.map((p) => `<p>${p.html}</p>`).join('\n'),
  }
}

/**
 * Sender and Reply-To for the confirmation email, as Resend REST fields.
 *
 * The address stays notifications@alignandacquire.com (the verified sending
 * domain); only the display name says Jacob. A reply goes to Jacob's own inbox
 * via `reply_to`, the REST API's snake_case field. The resend SDK's `replyTo`
 * is mapped to it internally (parseEmailToApiOptions in resend 6.9.3), but
 * /api/demo-book posts to the REST endpoint directly, so it must be `reply_to`.
 * Omitted entirely, never sent empty, when ownerEmail is unset or not an address.
 */
export const DEMO_EMAIL_FROM = 'Jacob at Align and Acquire <notifications@alignandacquire.com>'

export function demoEmailEnvelope(ownerEmail: string | null | undefined): {
  from: string
  reply_to?: string
} {
  const replyTo = typeof ownerEmail === 'string' ? ownerEmail.trim() : ''
  return {
    from: DEMO_EMAIL_FROM,
    ...(/^[^@\s]+@[^@\s]+$/.test(replyTo) ? { reply_to: replyTo } : {}),
  }
}

/**
 * Invite title. The booker sees it on their calendar; so does Jacob, which is
 * why it carries who the call is with. First name only, same first-word rule
 * as greetingName (so the banked-lead phone placeholder never shows up here).
 *
 *   name + company  "Align and Acquire demo with Jacob | Marcus, Vandenberg Roofing"
 *   name only       "Align and Acquire demo with Jacob | Marcus"
 *   company only    "Align and Acquire demo with Jacob | Vandenberg Roofing"
 *   neither         "Align and Acquire demo with Jacob"
 *
 * Never "your business": that fallback reads fine in a sentence, not a title.
 */
export function demoInviteTitle(
  firstName: string | null | undefined,
  companyName: string | null | undefined
): string {
  const who = [greetingName(firstName).trim(), companyName?.trim() ?? ''].filter(Boolean).join(', ')
  return who ? `Align and Acquire demo with Jacob | ${who}` : 'Align and Acquire demo with Jacob'
}

/** The contact block under the header. Unchanged from before the rewrite. */
export type DemoInviteDetails = {
  customerName: string
  customerPhone: string
  customerEmail?: string | null
  businessName: string
  servicesInterested: string[]
  message?: string | null
}

/**
 * Invite description. Visible to the prospect once they are an attendee, so no
 * ad attribution or internal notes (those go in extendedProperties.private).
 *
 * No Meet link line: Google puts its own Join button on the event and in the
 * invite email, and the link does not exist until Google has created the event.
 */
export function demoInviteDescription(
  params: Omit<DemoBookerCopyParams, 'meetLink'> & { details: DemoInviteDetails }
): string {
  const when = demoWhen(params)
  const phone = formatReschedulePhone(params.ownerPhone)
  const video = params.videoUrl?.trim()
  const d = params.details

  return [
    `Time: ${when.dateLong} at ${when.timeMarked}`,
    video ? `Watch this before we talk (2 min): ${video}` : null,
    phone ? `Need a different time? Text or call Jacob at ${phone}.` : null,
    '',
    `Name: ${d.customerName}`,
    `Phone: ${d.customerPhone}`,
    d.customerEmail ? `Email: ${d.customerEmail}` : null,
    `Business: ${d.businessName}`,
    d.servicesInterested.length > 0 ? `Services interested in: ${d.servicesInterested.join(', ')}` : null,
    d.message?.trim() ? `Message: ${d.message.trim()}` : null,
  ]
    .filter((line) => line !== null)
    .join('\n')
}
