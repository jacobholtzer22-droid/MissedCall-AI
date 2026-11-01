// ===========================================
// Ops HQ: drafts for the three client-facing texts (CLIENT_SEND_DRAFTS)
// ===========================================
// Off unless CLIENT_SEND_DRAFTS is exactly 'true'. Pure: lib/ops/board.ts builds
// the drafts from the board it already loaded (plus each client's intake), and
// Ops HQ's "Ready to send" strip shows them with Copy and Open in Messages.
// Nothing here sends anything. "Mark sent" is Jacob's tap: it writes an
// activity, lastContactedAt and a marker on the intake so the draft goes away
// (POST /api/admin/ops/engagements/[id]/send-drafts).
//
//   questionnaire  stage paid_upfront or onboarding, the intake still missing
//                  something, no answers from the client yet, not marked sent.
//                  The text in docs/ops/onboarding-questionnaire.md, verbatim, with
//                  the first name; or, with CLIENT_INTAKE_LINK on and a current link,
//                  a short text that points to the link.
//   preview        website step send_preview with a previewUrl on the website
//                  evidence, not marked sent for that preview.
//   live           everything the client bought is live, the last one went live in
//                  the last 14 days, not marked sent. Built from the board only.
//
// All of it is GSM-7: straight quotes, no dashes, no emoji.

export function clientSendDraftsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.CLIENT_SEND_DRAFTS === 'true'
}

/** docs/ops/onboarding-questionnaire.md, "The text, verbatim" (a test holds it to the doc). {Name} is the first name. */
export const QUESTIONNAIRE_TEXT = "Hey {Name}, Rough answers are totally fine, and if you're unsure on anything just say so and we'll knock it out on a quick call.\n\nIf you're short on time, I need 1 through 14 and 17 through 19 first. Those are what I need to build the campaign. The rest can come after.\n\nTHE BUSINESS\n1. Legal business name, and the name you want customers to see if it's different\n2. Every service you offer. Then tell me the 2 or 3 you want MORE of (your money makers)\n3. Anything you DON'T want calls for? Jobs too small, services you don't do, commercial, rentals, DIY people, etc. This keeps me from paying for junk clicks\n4. Rough average job value for your main services\n5. Residential, commercial, or both?\n6. Years in business, licensed and insured (license # if your trade has one), any certifications or brands you're certified with\n7. What sets you apart? Free estimates, financing, warranties, same day service, family or veteran owned, etc. Only stuff that's 100% true since it goes in the ads\n8. Any promo or offer you'd be willing to run (ex: $50 off first service, free inspection)\n\nSERVICE AREA\n9. Your home base address (for your Google listing, it does NOT have to show publicly)\n10. Every city/town you'll actually drive to and the max distance you'll go. Which areas do you want the most jobs in?\n\nPHONE + LEADS\n11. What number should customers call?\n12. Who answers and what hours can you realistically pick up? Ads sending calls to a phone nobody answers is wasted money, so I'll run the ads around your hours\n13. Do you do emergency or after-hours work?\n14. Email where you want website quote requests sent\n\nGOOGLE BUSINESS PROFILE\n15. Do you have a Google Business Profile (your listing on Google Maps)? If yes, is it verified, and can you add me as a manager? If not, I'll set it up with you. Verification usually needs a short video showing your truck, tools, signage, etc.\n16. How many reviews do you have and where? (Google, Facebook, Yelp, Angi, Nextdoor)\n\nGOOGLE ADS ACCOUNT\n17. The Gmail you want tied to the account. I'll create it under my manager account and send you an invite\n18. Monthly ad budget you're comfortable with. This goes straight to Google, separate from what you pay me. I'll give you my recommendation but I want your number\n19. Main goal: phone calls, quote requests, or both? Any busy or slow seasons?\n20. Once the account is set up you'll add a card for billing directly inside Google Ads (Google bills you directly, never text me card info). I'll walk you through it, takes 2 min\n21. Any competitors you see all over Google that you want to go after?\n\nWEBSITE\n22. Do you own a domain already? If not, any preference on the name?\n23. Logo (highest quality file you have) and brand colors. No logo is fine, just tell me\n24. Photos: real job pics, before/afters, your truck, you and your crew. The more the better. I don't use stock or AI photos, real work converts way better. Google Drive link works great\n25. Any websites you like the look of, competitor or not\n26. Your social links (Facebook, Instagram, etc.)\n27. A few sentences on you and how you got started, for the About page\n28. Any customer reviews/testimonials you're good with me using on the site\n\nNo rush on all of it at once. Thanks {Name} looking forward to helping you out."

export type SendKind = 'questionnaire' | 'preview' | 'live'
export type SendMarks = Partial<Record<SendKind, string>>

export type BoardSendDraft = { engagementId: string; client: string; phone: string | null; kind: SendKind; key: string; text: string; why: string }

export type SendFacts = {
  engagementId: string
  client: string
  contactName: string | null
  phone: string | null
  stage: string
  deliverables: { type: string; step: string | null; effectiveStatus: string; stepUpdatedAt: string | null; evidence: Record<string, unknown> }[]
  business: { ownerEmail: string | null; ownerPhone: string | null; telnyxPhoneNumber: string | null } | null
  /** intakeMissing() of the client's intake. */
  intakeMissing: string[]
  /** Answers the client gave through the intake link. */
  hasClientAnswers: boolean
  marks: SendMarks
  /** The client's current intake link, when CLIENT_INTAKE_LINK is on and one is live. */
  intakeLinkUrl: string | null
}

export const LIVE_RECENT_DAYS = 14

export function firstName(contactName: string | null | undefined): string {
  const first = contactName?.trim().split(/\s+/)[0] ?? ''
  return first && !/\d/.test(first) ? first : ''
}

const hey = (name: string) => (name ? `Hey ${name}, Jacob here.` : 'Hey, Jacob here.')

/** "+15175809709" as "(517) 580-9709"; anything else as given. */
export function prettyPhone(p: string | null | undefined): string | null {
  if (!p) return null
  const d = p.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '')
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : p.trim()
}

export function questionnaireText(name: string, linkUrl: string | null): string {
  if (linkUrl) {
    return [
      `${hey(name)} Here's your setup page: ${linkUrl}`,
      "It has my questions for your website, ads and Google listing, and you can upload your photos and logo right there. Rough answers are totally fine, it saves as you go, and you can come back to the same link anytime.",
      "If you're short on time, 1 through 14 and 17 through 19 come first. Those are what I need to build the campaign.",
    ].join('\n\n')
  }
  return QUESTIONNAIRE_TEXT.replace(/\{Name\}/g, name || 'there')
}

export function previewText(name: string, url: string): string {
  return `${hey(name)} Your new website is ready for you to look at: ${url}\n\nTake a look on your phone and tell me anything you want changed, or reply looks good and I'll get it ready to go live.`
}

const host = (u: string) => u.replace(/^https?:\/\//, '').replace(/\/$/, '')

export function liveText(name: string, f: SendFacts): string | null {
  const live = (t: string) => f.deliverables.find((d) => d.type === t && d.effectiveStatus === 'live')
  const running: string[] = []
  const week: string[] = []
  const site = live('website')
  if (site) {
    const domain = f.deliverables.find((d) => d.type === 'domain')?.evidence.primaryDomain
    const url = typeof domain === 'string' ? domain : typeof site.evidence.productionUrl === 'string' ? host(site.evidence.productionUrl) : null
    running.push(url ? `your new website is up at ${url}` : 'your new website is up')
    week.push('Google can take a couple of weeks to show the new site in search, that part is normal')
  }
  if (live('missedcall')) {
    const n = prettyPhone(f.business?.telnyxPhoneNumber)
    running.push(n ? `missed calls now get a text back right away (from ${n})` : 'missed calls now get a text back right away')
    week.push('call your business line from another phone and let it ring out once, so you see the text back yourself')
  }
  const ads = live('ads')
  if (ads) {
    const daily = typeof ads.evidence.dailyBudget === 'number' ? ads.evidence.dailyBudget : null
    running.push(daily ? `your Google Ads are running at $${daily % 1 ? daily.toFixed(2) : daily} a day` : 'your Google Ads are running')
    week.push("the first week the ads are learning, I'll go through the searches and cut out junk clicks")
  }
  if (live('gbp')) running.push('your Google Business Profile is set up')
  if (live('email')) running.push('your business email is working')
  if (!running.length) return null
  const to = [f.business?.ownerEmail?.trim(), prettyPhone(f.business?.ownerPhone)].filter(Boolean)
  return [
    `${hey(name)} You're live. ${capital(running.join(', '))}.`,
    to.length ? `New leads go to ${to.join(' and ')}.` : null,
    week.length ? `This first week: ${week.join('; ')}.` : null,
    'Text me anytime with questions or anything you want changed.',
  ]
    .filter(Boolean)
    .join('\n\n')
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** The drafts one client is due, from the board's facts only. */
export function sendDraftsFor(f: SendFacts, now = new Date()): BoardSendDraft[] {
  const name = firstName(f.contactName)
  const out: BoardSendDraft[] = []
  const base = { engagementId: f.engagementId, client: f.client, phone: f.phone }
  if (['paid_upfront', 'onboarding'].includes(f.stage) && f.intakeMissing.length && !f.hasClientAnswers && !f.marks.questionnaire) {
    out.push({ ...base, kind: 'questionnaire', key: 'questionnaire', text: questionnaireText(name, f.intakeLinkUrl), why: f.intakeLinkUrl ? 'the intake link is ready' : 'the intake is still empty' })
  }
  const site = f.deliverables.find((d) => d.type === 'website')
  const preview = typeof site?.evidence.previewUrl === 'string' ? site.evidence.previewUrl : null
  if (site?.step === 'send_preview' && preview && f.marks.preview !== preview) {
    out.push({ ...base, kind: 'preview', key: preview, text: previewText(name, preview), why: 'the website step is send_preview' })
  }
  const bought = f.deliverables
  const allLive = bought.length > 0 && bought.every((d) => d.effectiveStatus === 'live')
  const lastLive = Math.max(0, ...bought.map((d) => (d.stepUpdatedAt ? Date.parse(d.stepUpdatedAt) : 0)))
  if (allLive && !f.marks.live && lastLive && now.getTime() - lastLive <= LIVE_RECENT_DAYS * 86_400_000) {
    const text = liveText(name, f)
    if (text) out.push({ ...base, kind: 'live', key: 'live', text, why: 'everything they bought is live' })
  }
  return out
}

/** The intake marker a "Mark sent" tap writes. Never set by anything automatic. */
export function markSent(marks: SendMarks | undefined, kind: SendKind, key: string): SendMarks {
  return { ...(marks ?? {}), [kind]: kind === 'preview' ? key : new Date().toISOString() }
}
