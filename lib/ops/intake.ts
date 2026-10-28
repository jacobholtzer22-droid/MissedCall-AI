// ===========================================
// /admin/ops: a client's intake (answers, old site, photos, logo)
// ===========================================
// Pure and client-safe. Engagement.intake holds everything Jacob has for a
// site build: the client's answers, the old site and how to use it, and the
// files (Vercel Blob URLs). The intake page edits it, the chief reads and
// fills it, the brief is written from it, and the build gets its assets.
//
// The fields follow the onboarding questionnaire Jacob texts every client
// (docs/ops/onboarding-questionnaire.md, numbered 1 to 28); its table says
// which question lands where. Every key is optional and additive: mergeIntake merges the top-level keys
// (one level deep for objects; arrays are replaced whole) and never drops a
// key it was not given. Assets are only ever read from the engagement's own
// intake, never from a free-text URL list.

export type IntakeAssetKind = 'logo' | 'photo' | 'document'
export type IntakeAsset = {
  id: string
  url: string
  filename: string
  kind: IntakeAssetKind
  caption?: string
  heroCandidate?: boolean
  service?: string
  beforeAfter?: 'before' | 'after'
  uploadedAt: string
}

export type OldSiteUse = 'verbatim' | 'facts_only' | 'ignore'

export type Intake = {
  business?: {
    legalName?: string
    displayName?: string
    trade?: string
    phone?: string
    email?: string
    serviceArea?: string[]
    hours?: string
    yearsInBusiness?: string
    licenses?: string
    languages?: string
    /** Q5: residential, commercial or both. */
    customerType?: string
    /** Q9: home base, for the Google listing; not shown publicly unless the client says so. */
    address?: string
    /** Q10: where they want the most jobs. */
    priorityArea?: string
    /** Q10: the farthest they will drive. */
    maxDistance?: string
    /** Q12: who picks up the phone. */
    whoAnswers?: string
    /** Q13: emergency or after-hours work, in their words. */
    emergency?: string
  }
  /** Q2 and Q4: moneyMaker marks the 2 or 3 they want more of. */
  services?: { name: string; description?: string; priceNote?: string; moneyMaker?: boolean; avgJobValue?: string }[]
  about?: string
  differentiators?: string[]
  /** Q8: a promo they would run. */
  offer?: string
  /** Q3, Q17 to Q19, Q21: what the ads are built from. */
  ads?: { exclusions?: string[]; accountEmail?: string; budgetMonthly?: number; goal?: string; seasons?: string; competitors?: string[] }
  /** Q15 and Q16: the Google Business Profile and where the reviews are. */
  gbp?: { exists?: boolean; verified?: boolean; managerAccess?: boolean; reviewCount?: string; notes?: string }
  reviews?: { gbpUrl?: string; quotes?: { text: string; author: string }[] }
  oldSite?: { url?: string; use?: OldSiteUse; notes?: string }
  socials?: { facebook?: string; instagram?: string; yelp?: string; nextdoor?: string }
  style?: { referenceSites?: string[]; colors?: string[]; avoid?: string }
  domain?: { current?: string; wanted?: string; registrar?: string; ownerHasAccess?: boolean }
  assets?: IntakeAsset[]
  rawNotes?: string
  updatedAt?: string
}

export const INTAKE_KEYS = ['business', 'services', 'about', 'differentiators', 'offer', 'ads', 'gbp', 'reviews', 'oldSite', 'socials', 'style', 'domain', 'assets', 'rawNotes'] as const

const isObj = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v)

/** Read whatever is stored as an Intake (bad shapes become empty). */
export function readIntake(v: unknown): Intake {
  return isObj(v) ? (v as Intake) : {}
}

/**
 * Merge a partial intake into the stored one. Top-level keys only, one level
 * deep for objects (so { business: { phone } } keeps the business name);
 * arrays are replaced whole. assets is never merged from a patch: it changes
 * only through the asset routes.
 */
export function mergeIntake(current: Intake, patch: Record<string, unknown>, now = new Date()): Intake {
  const out: Record<string, unknown> = { ...current }
  for (const key of INTAKE_KEYS) {
    if (key === 'assets' || !(key in patch)) continue
    const v = patch[key]
    out[key] = isObj(v) && isObj(out[key]) ? { ...(out[key] as Record<string, unknown>), ...v } : v
  }
  out.updatedAt = now.toISOString()
  return out as Intake
}

const filled = (v: unknown) => (Array.isArray(v) ? v.length > 0 : typeof v === 'string' ? v.trim().length > 0 : v != null)

/** The five things a build cannot do without, and which are still empty. */
export function intakeMissing(i: Intake): string[] {
  const missing: string[] = []
  if (!filled(i.business?.phone)) missing.push('phone')
  if (!filled(i.services)) missing.push('services')
  if (!filled(i.business?.serviceArea)) missing.push('service area')
  if (!filled(i.about)) missing.push('about')
  if (!(i.assets ?? []).some((a) => a.kind === 'photo')) missing.push('photos')
  return missing
}

/** What get_client shows the chief: which parts are filled, counts, the old site. */
export function intakeSummary(i: Intake) {
  const photos = (i.assets ?? []).filter((a) => a.kind === 'photo')
  return {
    filled: INTAKE_KEYS.filter((k) => k !== 'assets' && filled(i[k as keyof Intake] as unknown)),
    missing: intakeMissing(i),
    photos: photos.length,
    heroCandidates: photos.filter((p) => p.heroCandidate).length,
    logo: (i.assets ?? []).some((a) => a.kind === 'logo'),
    documents: (i.assets ?? []).filter((a) => a.kind === 'document').length,
    oldSite: i.oldSite?.url ? { url: i.oldSite.url, use: i.oldSite.use ?? 'facts_only' } : null,
    updatedAt: i.updatedAt ?? null,
  }
}

/** The asset list the build receives (no ids, no upload times). */
export function payloadAssets(i: Intake) {
  return (i.assets ?? []).map((a) => ({
    url: a.url,
    kind: a.kind,
    filename: a.filename,
    caption: a.caption ?? null,
    heroCandidate: Boolean(a.heroCandidate),
    service: a.service ?? null,
    beforeAfter: a.beforeAfter ?? null,
  }))
}

export function payloadOldSite(i: Intake) {
  return i.oldSite?.url ? { url: i.oldSite.url, use: i.oldSite.use ?? 'facts_only', notes: i.oldSite.notes ?? null } : null
}

/**
 * The brief's last two sections, written from the intake so the asset list in
 * the brief is always the engagement's own. Replaces any earlier copy of them
 * and leaves every other section where it was.
 */
export function withAssetSections(brief: string, i: Intake): string {
  // Drop any earlier Assets or Old site section, and only those: every other
  // section (Standards applied among them) keeps its place.
  const body = brief
    .split(/(?=^## )/m)
    .filter((part) => !/^## (Assets|Old site)\s*$/m.test(part.split('\n')[0]))
    .join('')
    .trimEnd()
  const rows = (i.assets ?? []).map(
    (a) => `- ${a.kind} | ${a.url} | ${a.caption?.trim() || a.filename} | ${a.heroCandidate ? 'hero candidate' : '-'} | ${a.service || '-'} | ${a.beforeAfter || '-'}`
  )
  const old = payloadOldSite(i)
  return [
    body,
    '',
    '## Assets',
    '',
    'kind | url | caption | heroCandidate | service | before/after',
    '',
    ...(rows.length ? rows : ['- none on file']),
    '',
    '## Old site',
    '',
    old ? `- ${old.url} | use: ${old.use}${old.notes ? ` | ${old.notes}` : ''}` : '- none',
    '',
  ].join('\n')
}
