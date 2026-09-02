// ===========================================
// MARKETING LINE PERSONA (+ the /book funnel number)
// ===========================================
// Inbound replies to the marketing number used to fall through to the generic
// tenant AI — the one built to capture leads FOR a client business. It answered
// a lead asking to book with "someone from our team will call you", which is
// both wrong and the exact opposite of the promise the funnel makes ("nobody
// calls you unless you book").
//
// This persona is Jacob's own line. It knows who it is talking to from the lead
// row, answers the handful of questions people actually ask, and when someone
// asks for a time it hands over the booking link and two real open slots rather
// than promising a callback.

import Anthropic from '@anthropic-ai/sdk'
import Telnyx from 'telnyx'
import { db } from '@/lib/db'
import { normalizeToE164 } from '@/lib/phone-utils'
import { MONTHLY_FEE, SETUP_FEE_FULL } from '@/lib/coupon'
import { calendarLink } from '@/lib/lead-token'

const MODEL = 'claude-haiku-4-5-20251001'

export type LeadFacts = {
  leadId: string | null
  firstName: string
  businessName: string
  trade: string
  /** Signed token so the link opens prefilled rather than re-asking. */
  calendarToken: string | null
}

/** Pull what we already know so the reply never asks for it again. */
export async function leadFactsForPhone(businessId: string, phone: string): Promise<LeadFacts> {
  const e164 = normalizeToE164(phone)
  const lead = await db.websiteLead.findFirst({
    where: { businessId, phone: e164 },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, message: true, calendarToken: true },
  })
  if (!lead) return { leadId: null, firstName: '', businessName: '', trade: '', calendarToken: null }
  return {
    leadId: lead.id,
    firstName: (lead.message?.match(/^First name: (.+)$/m)?.[1] ?? lead.name ?? '').trim(),
    businessName: lead.message?.match(/^Company: (.+)$/m)?.[1]?.trim() ?? '',
    trade: lead.message?.match(/^Trade: (.+)$/m)?.[1]?.trim() ?? '',
    calendarToken: lead.calendarToken ?? null,
  }
}

const BOOKING_WORDS = [
  'time', 'times', 'book', 'booking', 'schedule', 'slot', 'call', 'meet', 'demo',
  'tonight', 'tomorrow', 'today', 'available', 'availability', 'when', 'free',
]

export function looksLikeBookingIntent(text: string): boolean {
  const t = text.toLowerCase()
  return BOOKING_WORDS.some((w) => new RegExp(`\\b${w}\\b`).test(t))
}

/** The next two genuinely open slots, via the same endpoint the page uses. */
export async function nextTwoSlots(): Promise<{ label: string; iso: string }[]> {
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.alignandacquire.com').replace(/\/$/, '')
  try {
    const res = await fetch(`${base}/api/marketing-bookings`, { cache: 'no-store' })
    if (!res.ok) return []
    const data = (await res.json()) as {
      days?: { label: string; slots: { display: string; iso: string }[] }[]
    }
    const out: { label: string; iso: string }[] = []
    for (const day of data.days ?? []) {
      for (const slot of day.slots) {
        out.push({ label: `${day.label} at ${slot.display}`, iso: slot.iso })
        if (out.length === 2) return out
      }
    }
    return out
  } catch {
    // Never let a calendar hiccup turn into a promise we cannot keep.
    return []
  }
}

function bookingLink(facts?: LeadFacts): string {
  return calendarLink(facts?.calendarToken ?? null)
}

/** Deep link straight to one slot, so "or 2:00 PM" is one tap not two. */
function slotLink(facts: LeadFacts, iso: string): string {
  const sep = bookingLink(facts).includes('?') ? '&' : '?'
  return `${bookingLink(facts)}${sep}slot=${encodeURIComponent(iso)}`
}

function systemPrompt(facts: LeadFacts): string {
  const who = [
    facts.firstName ? `First name: ${facts.firstName}` : null,
    facts.businessName ? `Business: ${facts.businessName}` : null,
    facts.trade ? `Trade: ${facts.trade}` : null,
  ].filter(Boolean).join('\n')

  return `You are Jacob, the owner of Align and Acquire, replying by text from your own phone.

WHO YOU ARE TEXTING
${who || 'Unknown — they came through the demo funnel but gave no details.'}
You already know the above. Never ask for it again.

THE OFFER, exactly
- $${MONTHLY_FEE} a month, plus a one-time $${SETUP_FEE_FULL} setup fee.
- Month to month. No contract. 30-day money back.
- A website built for them, included.
- Missed-call text-back: when they miss a call, the caller gets a text within 8 seconds.
- The AI answers the caller's questions and books the job straight onto their calendar.

HARD RULES
- NEVER say "someone will call you", "someone will reach out", "our team will contact you"
  or anything like it. The funnel promises nobody calls unless they book. Breaking that
  is the single worst thing you can do here.
- You are Jacob, one person. Not "we", not "our team", not a receptionist.
- If they ask for a time, availability, or to book: the booking link is the answer.
- Do not invent features, prices, guarantees or availability. If you do not know, say you
  will confirm on the call and point at the link.
- Texting voice: short, lowercase-ish, direct. Two or three sentences maximum. No emoji,
  no bullet lists, no marketing adjectives.
- Never mention that you are an AI.`
}

export type MarketingReply = { text: string; usedBookingHandoff: boolean }

/** Compose the reply. Booking intent short-circuits the model entirely. */
export async function composeMarketingReply(
  facts: LeadFacts,
  history: { direction: string; content: string }[],
  incoming: string
): Promise<MarketingReply> {
  if (looksLikeBookingIntent(incoming)) {
    // Deterministic, because this is the one answer that must never drift into
    // "I'll have someone reach out" or a hallucinated time.
    const slots = await nextTwoSlots()
    const name = facts.firstName ? ` ${facts.firstName}` : ''
    // Each slot is its own deep link: tapping one lands on that exact time
    // rather than making them find it again in the picker.
    const when = slots.length
      ? ` Next two open — ${slots.map((s) => `${s.label}: ${slotLink(facts, s.iso)}`).join('  or  ')}.`
      : ''
    return {
      usedBookingHandoff: true,
      text:
        `Yes${name} — grab whatever time works here and it's locked in: ${bookingLink(facts)}.` +
        `${when} It's 15 minutes, me personally.`,
    }
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      usedBookingHandoff: true,
      text: `Good question — easiest is to grab a time and I'll walk you through it: ${bookingLink(facts)}`,
    }
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const messages = history.slice(-8).map((m) => ({
    role: (m.direction === 'inbound' ? 'user' : 'assistant') as 'user' | 'assistant',
    content: m.content,
  }))
  messages.push({ role: 'user', content: incoming })

  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 300,
    system: systemPrompt(facts),
    messages,
  })
  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join(' ')
    .trim()

  // Last line of defence. If the model produced the banned promise anyway,
  // replace the whole reply rather than send it.
  if (/some ?one (will|from).{0,24}(call|reach|contact)|our team|we'll (call|reach)/i.test(text)) {
    console.warn('[marketing-reply] model produced a callback promise, replaced')
    return {
      usedBookingHandoff: true,
      text: `Happy to get into it — grab a time and I'll show you live: ${bookingLink(facts)}`,
    }
  }

  return { text: text || `Grab a time and I'll walk you through it: ${bookingLink(facts)}`, usedBookingHandoff: false }
}

/** Ping Jacob with the thread so no inbound reply is silent. */
export async function pingOwnerWithThread(
  ownerPhone: string | null | undefined,
  facts: LeadFacts,
  from: string,
  incoming: string,
  reply: string
): Promise<void> {
  const to = normalizeToE164(process.env.OWNER_PHONE || ownerPhone || '')
  const sender = process.env.MARKETING_TELNYX_NUMBER?.trim()
  if (!to || !sender || !process.env.TELNYX_API_KEY) {
    console.error(
      `[marketing-reply] owner ping SKIPPED to=${to ? 'set' : 'MISSING'} from=${sender ? 'set' : 'MISSING'}`
    )
    return
  }
  // Sending to Jacob FROM the marketing number would land in the same thread as
  // the lead's own messages and be indistinguishable. It is still the only
  // sender available, so the body leads with who it is about.
  const who = [facts.firstName, facts.businessName].filter(Boolean).join(' / ') || from
  const body =
    `Reply from ${who} (${from})\n` +
    `Them: ${incoming.slice(0, 140)}\n` +
    `You (auto): ${reply.slice(0, 140)}`
  try {
    const telnyx = new Telnyx({ apiKey: process.env.TELNYX_API_KEY })
    const res = await telnyx.messages.send({ from: sender, to, text: body })
    const id = (res as { data?: { id?: string } })?.data?.id ?? 'unknown'
    console.log(`[marketing-reply] owner ping SENT to=${to} providerId=${id}`)
  } catch (err) {
    console.error(`[marketing-reply] owner ping FAILED: ${err instanceof Error ? err.message : String(err)}`)
  }
}
