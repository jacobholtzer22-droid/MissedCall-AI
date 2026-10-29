// ===========================================
// /admin/ops: the go-live gate and the enable gate
// ===========================================
// Pure and tested. Jacob's rule: a site does not go live and a campaign is not
// turned on with the givens undone (Google tag, domain, call asset, billing,
// somewhere for lead alerts to go), and when one is undone it is named in
// plain words.
//
//   goLiveGate   start_web_task go_live refuses with the list unless Jacob's
//                own message says "skip <item>" for each one left.
//   enableGate   an enable proposal is never blocked outright: the unmet list
//                goes on the approval card in amber and Push becomes "Push
//                anyway" (the existing hold).
//   reportGaps   the givens still undone for a client, for the "Not done"
//                line every job report ends with.
//
// "skip" is read from Jacob's message, never from text the chief wrote.

import { effectiveStatusOf } from '@/lib/ops/steps'

export type GateKey =
  | 'website_approved'
  | 'domain_live'
  | 'tracking'
  | 'owner_email'
  | 'owner_phone'
  | 'already_indexable'
  | 'call_asset'
  | 'final_urls'
  | 'billing'
  | 'conversion_actions'

export type GateItem = { key: GateKey; text: string }

type Ev = Record<string, unknown>

export type GateClient = {
  services: string[]
  website: { step: string | null; evidence: Ev } | null
  domain: { step: string | null; manualStatus: string | null; computedStatus: string; evidence: Ev } | null
  ads: { step: string | null; evidence: Ev } | null
  owner: { email: string | null; phone: string | null } | null
  /** Decision and activity bodies; a billing_confirmed one confirms billing. */
  notes: string[]
}

/** Words after "skip" that waive each item. */
const SKIP_WORDS: Record<GateKey, string[]> = {
  website_approved: ['approval', 'approved', 'review', 'website'],
  domain_live: ['domain', 'dns'],
  tracking: ['tag', 'google tag', 'tracking', 'gtag'],
  owner_email: ['email', 'owner email', 'owner', 'contact', 'lead alerts'],
  owner_phone: ['phone', 'owner phone', 'owner', 'contact', 'lead alerts'],
  already_indexable: ['indexable'],
  call_asset: ['call asset', 'call'],
  final_urls: ['final url', 'final urls', 'urls', 'url'],
  billing: ['billing', 'payment'],
  conversion_actions: ['conversion', 'conversions', 'conversion actions'],
}

/** The items Jacob waived: "go live, skip tag", "skip the domain and billing". */
export function skipsIn(said: string): Set<GateKey> {
  const out = new Set<GateKey>()
  for (const m of Array.from(said.toLowerCase().matchAll(/\bskip(?:ping)?\s+([^,;.!?\n]+)/g))) {
    for (const raw of m[1].split(/\s+and\s+|\s*\/\s*|\s*&\s*/)) {
      const phrase = raw.trim().replace(/^(the|a)\s+/, '')
      if (!phrase) continue
      for (const [key, words] of Object.entries(SKIP_WORDS) as [GateKey, string[]][]) {
        if (words.some((w) => phrase === w || phrase.startsWith(`${w} `) || phrase.startsWith(`${w}s`))) out.add(key)
      }
    }
  }
  return out
}

/** "go live on vercel.app": Jacob chose to launch without a custom domain. */
export const saidVercelApp = (said: string) => /\bon\s+(the\s+)?(\S+\.)?vercel\.app\b/i.test(said)

const hasAds = (c: GateClient) => c.services.includes('ads')

/** The tag is on the site: installed by install_tracking, or seen on production by the web checks. */
export const trackingOk = (c: GateClient) => c.website?.evidence.trackingInstalled === true || c.website?.evidence.googleTagLive === true

export function domainLive(c: GateClient): boolean {
  const d = c.domain
  if (!d) return false
  return effectiveStatusOf({ type: 'domain', manualStatus: d.manualStatus, computedStatus: d.computedStatus, step: d.step }) === 'live'
}

function ownerItems(c: GateClient): GateItem[] {
  const out: GateItem[] = []
  if (!c.owner?.email?.trim()) out.push({ key: 'owner_email', text: 'no owner email for lead alerts' })
  if (!c.owner?.phone?.trim()) out.push({ key: 'owner_phone', text: 'no owner phone for lead alerts' })
  return out
}

const waive = (items: GateItem[], said: string) => {
  const skip = skipsIn(said)
  return items.filter((i) => !skip.has(i.key))
}

/** What stops a site going live, minus what Jacob's message skipped. Empty means go. */
export function goLiveGate(c: GateClient, said = ''): GateItem[] {
  const items: GateItem[] = []
  const step = c.website?.step ?? null
  if (step !== 'approved' && step !== 'live') items.push({ key: 'website_approved', text: `website is not approved (step ${step ?? 'none'})` })
  if (!domainLive(c) && !saidVercelApp(said)) items.push({ key: 'domain_live', text: c.domain ? 'domain is not live' : 'no domain on file' })
  if (hasAds(c) && !trackingOk(c)) items.push({ key: 'tracking', text: 'Google tag is not on the site' })
  items.push(...ownerItems(c))
  if (c.website?.evidence.siteIndexableFlag === true) items.push({ key: 'already_indexable', text: 'the site is already indexable' })
  return waive(items, said)
}

export type EnableFacts = {
  /** The campaign has an enabled call asset (live read); null when unknown, then ads evidence callAssetId decides. */
  callAsset?: boolean | null
  /** The campaign's ads' final URLs (live read); null when unknown. */
  finalUrls?: string[] | null
  /** Enabled conversion actions in the account (live read); null when unknown. */
  conversionActions?: number | null
}

const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}

export const billingConfirmed = (c: GateClient) => c.notes.some((n) => /billing[ _]confirmed/i.test(n))

function conversionCount(c: GateClient, facts: EnableFacts): number {
  if (typeof facts.conversionActions === 'number') return facts.conversionActions
  const ca = (c.ads?.evidence.conversionActions ?? {}) as Ev
  return ['formId', 'callId', 'adCallId'].filter((k) => typeof ca[k] === 'string' && ca[k]).length
}

/** What should be true before a campaign is turned on. Never blocks: the list becomes the card's hold. */
export function enableGate(c: GateClient, facts: EnableFacts = {}, said = ''): GateItem[] {
  const items: GateItem[] = []
  if (!trackingOk(c)) items.push({ key: 'tracking', text: 'Google tag is not on the site, so form and call conversions read zero' })
  const callAsset = facts.callAsset ?? (typeof c.ads?.evidence.callAssetId === 'string' && Boolean(c.ads.evidence.callAssetId))
  if (!callAsset) items.push({ key: 'call_asset', text: 'no call asset on the campaign' })
  const domain = typeof c.domain?.evidence.primaryDomain === 'string' ? c.domain.evidence.primaryDomain.replace(/^www\./, '').toLowerCase() : null
  const urls = facts.finalUrls ?? null
  const onVercel = (urls ?? []).filter((u) => hostOf(u).endsWith('vercel.app'))
  if (onVercel.length) items.push({ key: 'final_urls', text: `ads point at a vercel.app URL (${onVercel[0]})` })
  else if (!domainLive(c)) items.push({ key: 'final_urls', text: 'final URLs are not on a live domain (the domain is not live)' })
  else if (domain && urls) {
    const off = urls.filter((u) => hostOf(u) !== domain)
    if (off.length) items.push({ key: 'final_urls', text: `final URL ${off[0]} is not on ${domain}` })
  }
  if (!billingConfirmed(c)) items.push({ key: 'billing', text: 'billing is not confirmed (no billing_confirmed decision)' })
  if (conversionCount(c, facts) === 0) items.push({ key: 'conversion_actions', text: 'no conversion actions in the account' })
  return waive(items, said)
}

/** The hold text an enable card shows for an unmet list; null when nothing is unmet. */
export function enableHold(items: GateItem[]): string | null {
  return items.length ? `Not done: ${items.map((i) => i.text).join('; ')}` : null
}

const ADS_BUILT = new Set(['site_live', 'enable', 'running'])

/**
 * The givens still undone for one client, for a job report's "Not done" line.
 * Only omissions, not the normal course of a build: the domain counts once the
 * site is approved, the ads items once a campaign is built.
 */
export function reportGaps(c: GateClient): string[] {
  const out: string[] = []
  const siteDone = c.website?.step === 'approved' || c.website?.step === 'live'
  if (c.website && siteDone && !domainLive(c)) out.push(c.domain ? 'domain is not live' : 'no domain on file')
  if (c.website && hasAds(c) && !trackingOk(c)) out.push('Google tag is not on the site')
  if (c.website || hasAds(c)) out.push(...ownerItems(c).map((i) => i.text))
  if (hasAds(c) && c.ads && ADS_BUILT.has(c.ads.step ?? '')) {
    if (!(typeof c.ads.evidence.callAssetId === 'string' && c.ads.evidence.callAssetId)) out.push('no call asset recorded')
    if (!billingConfirmed(c)) out.push('billing is not confirmed')
    if (conversionCount(c, {}) === 0) out.push('no conversion actions recorded')
  }
  return out
}
