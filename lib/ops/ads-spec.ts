// ===========================================
// Ops HQ: the Google Ads launch spec from the intake (ADS_SPEC_FROM_INTAKE)
// ===========================================
// Off unless ADS_SPEC_FROM_INTAKE is exactly 'true'. With it on, the chief can
// draft a client's launch spec from the intake (one bounded model call, no
// tools), show it once in the HQ chat, and store it on Jacob's explicit OK.
// start_ads_task then reads it from the intake first and falls back to
// docs/ads-specs/ (today's only path, and the only one with the flag off).
//
// Rules, in this order of authority:
//   1. docs/ops/site-brief-standards.md section 9: how the questionnaire answers become
//      the spec (money makers first, q3 negatives, q10 geo, q12 schedule, q18 / 30.4
//      rounded down to $0.50 a day, q19 goals, q21 never as keywords, call asset q11).
//   2. lib/ops/hq/prompts/ads.md: what the ads specialist does with a spec (built PAUSED,
//      PRESENCE only, conversion actions first, enable only by Push).
//   3. docs/ads-specs/*.md: the shape. SPEC_SHAPE below is that shape with no client in
//      it, so no other client's facts can leak into a draft.
//
// Storage: Engagement.intake.adsSpec = { draft?, approved? }. Not an INTAKE_KEY, so
// save_intake, the admin intake PATCH (rejectUnknownKeys) and mergeIntake never write
// it, and the client's intake link only writes questionnaire answers.
//
// Never spend: the daily budget is computed here from the client's own q18 (never by
// the model), the draft is refused unless its Budget line says exactly that (or UNKNOWN
// when q18 is empty), and the campaign is described as PAUSED at build. The spec only
// describes; the ads run builds paused and the enable stays Jacob's Push.

import { intakeVersion, type IntakeWithDraft } from '@/lib/ops/brief-draft'

export function adsSpecEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.ADS_SPEC_FROM_INTAKE === 'true'
}

export type AdsSpecDraft = { text: string; version: string; draftedAt: string; missing: string[] }
export type AdsSpecApproved = { text: string; version: string; approvedAt: string }
export type AdsSpecState = { draft?: AdsSpecDraft; approved?: AdsSpecApproved }
export type IntakeWithSpec = IntakeWithDraft & { adsSpec?: AdsSpecState }

// -------------------------------------------
// Facts: what the intake has, what is missing
// -------------------------------------------

/** Section 9: q18 / 30.4, rounded down to the nearest $0.50. Null when q18 is empty. */
export function dailyBudgetFrom(monthly: number | null | undefined): number | null {
  if (typeof monthly !== 'number' || !Number.isFinite(monthly) || monthly <= 0) return null
  return Math.floor((monthly / 30.4) * 2) / 2
}

export const money = (n: number) => `$${n.toFixed(2)}`

export type SpecFacts = {
  /** Required: a spec cannot be drafted without these. */
  required: { label: string; ok: boolean }[]
  /** Listed for Jacob in the draft when empty; the draft writes UNKNOWN there. */
  optional: { label: string; ok: boolean }[]
  dailyBudget: number | null
}

export function specFacts(intake: IntakeWithSpec, site: { url: string | null }): SpecFacts {
  const filled = (v: unknown) => (Array.isArray(v) ? v.length > 0 : typeof v === 'string' ? v.trim().length > 0 : v != null)
  const daily = dailyBudgetFrom(intake.ads?.budgetMonthly)
  return {
    required: [
      { label: 'services and the 2 or 3 money makers (q2)', ok: filled(intake.services) },
      { label: 'service area: every town they drive to (q10)', ok: filled(intake.business?.serviceArea) },
      { label: 'monthly ad budget (q18)', ok: daily !== null },
    ],
    optional: [
      { label: 'the phone customers call, for the call asset (q11)', ok: filled(intake.business?.phone) },
      { label: 'jobs they do not want calls for, for negatives (q3)', ok: filled(intake.ads?.exclusions) },
      { label: 'residential, commercial or both (q5)', ok: filled(intake.business?.customerType) },
      { label: 'who answers and when, for the ad schedule (q12)', ok: filled(intake.business?.whoAnswers) || filled(intake.business?.hours) },
      { label: 'emergency or after-hours work (q13)', ok: filled(intake.business?.emergency) },
      { label: 'main goal: calls, quote requests or both (q19)', ok: filled(intake.ads?.goal) },
      { label: 'the site URL for final URLs', ok: Boolean(site.url) },
    ],
    dailyBudget: daily,
  }
}

export const missingRequired = (f: SpecFacts) => f.required.filter((x) => !x.ok).map((x) => x.label)
export const missingOptional = (f: SpecFacts) => f.optional.filter((x) => !x.ok).map((x) => x.label)

// -------------------------------------------
// The shape (docs/ads-specs, with no client in it)
// -------------------------------------------

export const SPEC_SHAPE = `# <Display name> (<contact first name>) | Google Ads launch spec | <Mon D YYYY>

Client: <display name>, <home base town and state>. Platform businessSlug <slug>.
Site: <site URL, and whether it is live; UNKNOWN when there is none>.
Budget rule: <q18> a month MAX. Google charges at most daily x 30.4, so the daily budget is <daily> (<daily x 30.4> a month). Do not go above <daily> a day without a new decision from Jacob.
Manager (login_customer_id): the Align and Acquire manager. Find the client's account under it; do NOT create one.

## Campaign
Name: <Display name> | <money makers> | <area>
Type: Search only. Google Search partners OFF. Display network OFF.
Bidding: MAXIMIZE_CLICKS with a cpc ceiling (state it and why; no conversion data yet).
Budget: <daily>/day. Status at build: PAUSED (Jacob enables through an approval).
Languages: English (1000).
Locations: <every town from q10, priority area first>. Geo target constant ids: to look up. Location option: PRESENCE only.
Ad schedule: <from q12; none outside the hours someone answers>.
Call asset: <the q11 number>, linked to the "Calls from ads" conversion action. If there is no number, build without it and list it as a UI step for Jacob.

## Conversion actions to create before the campaign (all primary unless noted)
1. "Calls from ads" (type AD_CALL, category PHONE_CALL_LEAD, count one per click, call length 30 seconds).
2. "Website lead form" (type WEBPAGE, category SUBMIT_LEAD_FORM).
3. "Click to call on site" (type WEBSITE_CALL, category PHONE_CALL_LEAD) if the API allows it; otherwise a UI step.

## Ad groups (<n>). Phrase and exact keywords listed separately. 15 headlines, 4 descriptions each.

### 1. <money maker service>
URL: <final URL>  | path1: <slug>
Phrase: <keywords>
Exact: <keywords, including "near me" and town forms>
Headlines: <15, each 30 characters or fewer, only claims the client made>
Descriptions:
- <4, each 90 characters or fewer>

## Campaign-level negatives (PHRASE match)
<q3 exclusions, the trade's standard junk (jobs, DIY, for sale, rental), "commercial" when residential only, "emergency" / "24 hour" / "same day" when q13 is no; competitors from q21 never as keywords>

## Missing from the intake
<every fact this spec needed and the intake did not have, one per line, each also written UNKNOWN where it is used; "none" when nothing is missing>

## After the build
- Set the ads deliverable step to "enable" with a note; produce ONE approval to enable the campaign at the daily budget above. Jacob pushes it.
- UI steps for Jacob: billing, advertiser verification, anything the tools cannot do.`

const PRESENCE = /Location option:\s*PRESENCE(?![_A-Za-z])/
const TITLE = /^# .+ \| Google Ads launch spec \| .+$/m

/** Why a drafted spec cannot be shown, or null. Code, not the model, holds the spend line. */
export function specProblem(text: string, dailyBudget: number | null): string | null {
  if (!TITLE.test(text.split('\n')[0] ?? '')) return 'the first line must be the "# <client> | Google Ads launch spec | <date>" title'
  for (const h of ['## Campaign', '## Conversion actions', '## Ad groups', '## Campaign-level negatives', '## Missing from the intake']) {
    if (!text.includes(h)) return `the spec is missing its "${h}" section`
  }
  const budget = text.match(/^Budget:\s*(.+)$/m)?.[1]?.trim() ?? ''
  if (dailyBudget === null) {
    if (!/^UNKNOWN\b/i.test(budget)) return 'there is no q18 budget, so the Budget line must say UNKNOWN'
  } else if (!budget.startsWith(`${money(dailyBudget)}/day`)) {
    return `the Budget line must be exactly ${money(dailyBudget)}/day (q18 / 30.4, rounded down to $0.50)`
  }
  if (!/Status at build:\s*PAUSED/i.test(text)) return 'the campaign must be PAUSED at build'
  if (!PRESENCE.test(text)) return 'the location option must be PRESENCE only'
  // Any other per-day dollar figure above the computed budget is a spend the client did not give.
  const perDay = Array.from(text.matchAll(/\$(\d+(?:\.\d{1,2})?)\s*(?:\/|a |per )day/gi)).map((m) => Number(m[1]))
  if (dailyBudget !== null && perDay.some((n) => n > dailyBudget)) return `the spec names a daily spend above ${money(dailyBudget)}`
  if (dailyBudget === null && perDay.length) return 'the spec names a daily spend, but the intake has no budget'
  return null
}

/** The one user turn the drafting call gets. */
export function specPrompt(p: { client: unknown; standards: string; playbook: string; dailyBudget: number | null; missing: string[]; date: string }): string {
  return [
    "Write this client's Google Ads launch spec now, as a DRAFT for Jacob. You have no tools and cannot ask anything: use only the client record below.",
    'Follow docs/ops/site-brief-standards.md section 9 for how the answers become the spec, and the ads playbook for how the spec is used. Fill the shape below exactly: the same title line, the same sections, in the same order.',
    `Never invent: services, towns, budget, phone, hours, claims and offers come only from the client record. Where something is missing write UNKNOWN there and list it under "## Missing from the intake". Known missing: ${p.missing.length ? p.missing.join('; ') : 'none'}.`,
    p.dailyBudget === null
      ? 'The intake has no monthly budget: the Budget line is "Budget: UNKNOWN. Status at build: PAUSED (Jacob enables through an approval)." and no other line names a daily spend.'
      : `The daily budget is ${money(p.dailyBudget)} (computed from q18, not yours to change): the Budget line is "Budget: ${money(p.dailyBudget)}/day. Status at build: PAUSED (Jacob enables through an approval)." and nothing in the spec names a higher daily spend.`,
    `Today is ${p.date}. Reply with the spec markdown only: no preamble, no closing line, no em dashes.`,
    `## The shape (from docs/ads-specs, with no client in it)\n\n${SPEC_SHAPE}`,
    `## The client record (get_client)\n\n${JSON.stringify(p.client, null, 1)}`,
    `## docs/ops/site-brief-standards.md\n\n${p.standards}`,
    `## The ads playbook (lib/ops/hq/prompts/ads.md)\n\n${p.playbook}`,
  ].join('\n\n')
}

// -------------------------------------------
// Draft, approve, read
// -------------------------------------------

export function withDraft(intake: IntakeWithSpec, text: string, missing: string[], now: Date): IntakeWithSpec {
  return { ...intake, adsSpec: { ...(intake.adsSpec ?? {}), draft: { text, version: intakeVersion(intake), draftedAt: now.toISOString(), missing } } }
}

/** Jacob's own words that approve a draft. Read from his message, never from the chief's text. */
export const saidApprove = (said: string) => /\b(looks good|approved?|go ahead|ship it|lgtm)\b/i.test(said)

export function approveDraft(intake: IntakeWithSpec, said: string, now: Date): { intake: IntakeWithSpec } | { error: string } {
  const draft = intake.adsSpec?.draft
  if (!draft) return { error: 'there is no ads spec draft to approve; draft one first' }
  if (!saidApprove(said)) return { error: 'Jacob has not approved it in his own words ("looks good"); show him the draft and wait' }
  return { intake: { ...intake, adsSpec: { approved: { text: draft.text, version: draft.version, approvedAt: now.toISOString() } } } }
}

export type SpecSource = { source: 'intake'; text: string } | { source: 'file'; path: string } | { source: 'none'; reason: string }

/**
 * Where start_ads_task takes the spec from: the approved intake spec first, then the
 * docs/ads-specs/ file the chief named (today's path). A draft is never used.
 */
export function chooseSpecSource(intake: IntakeWithSpec | null, path: string | null | undefined): SpecSource {
  const approved = intake?.adsSpec?.approved?.text?.trim()
  if (approved) return { source: 'intake', text: approved }
  if (path?.trim()) return { source: 'file', path: path.trim() }
  return { source: 'none', reason: 'no approved spec on the intake and no docs/ads-specs/ file named' }
}

/** The HQ chat message that carries the draft. */
export function specMessage(name: string, text: string, missing: string[]): string {
  return [
    `Google Ads launch spec draft for ${name}, written from the intake. Nothing is stored, built or spent.`,
    missing.length ? `Missing from the intake (written UNKNOWN in the spec): ${missing.join('; ')}.` : 'Nothing is missing from the intake for it.',
    'Say "looks good" and I\'ll store it on the client, or tell me what to change. Building it is still a separate step, built paused, and turning it on is your Push.',
    '',
    text,
  ].join('\n')
}
