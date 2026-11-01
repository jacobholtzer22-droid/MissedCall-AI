// ===========================================
// Production is not the template's sample site (SAMPLE_SITE_GUARD, off by default)
// ===========================================
// A client repo starts as a copy of AA-Template, whose main branch is a
// complete sample business. Until the first build PR merges, production serves
// that sample. With the flag on, the web checks look for the sample's markers
// on production (http.not_sample), and connect_domain and the go-live gate
// refuse while they are there. Pure; probePage does the fetch.

export function sampleSiteGuardEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.SAMPLE_SITE_GUARD === 'true'
}

/**
 * Strings only the sample site carries, copied from AA-Template's site.config.ts
 * on main (business: slug, legal and display name, phone, email, street,
 * domain, tagline). Hardcoded on purpose: this repo cannot read the template at
 * runtime. If the template's sample business changes, update this list.
 * Matched case-insensitively against the homepage HTML.
 */
export const SAMPLE_MARKERS = [
  'sample-lawn-care',
  'Sample Lawn Care',
  'hello@sample-lawn-care.com',
  '+15555550123',
  '(555) 555-0123',
  '100 Sample Street',
  'Reliable lawn care for homes across the Springfield area.',
  'replace-before-launch',
] as const

/** The sample markers found in a page's HTML. */
export function sampleMarkersIn(html: string): string[] {
  const h = html.toLowerCase()
  return SAMPLE_MARKERS.filter((m) => h.includes(m.toLowerCase()))
}

/**
 * Red takes two markers, so one stray phrase in a real client's copy is not
 * enough. Any sample page shows the name, the email and the phone together.
 */
export const isSamplePage = (markers: string[]) => markers.length >= 2

/** The plain words for the check, the refusal and the gate item. */
export const SAMPLE_SITE_TEXT = "production is still the template's sample site (Sample Lawn Care), not this client's site"

export function sampleCheckDetail(url: string, markers: string[]): string {
  return isSamplePage(markers)
    ? `${url}: ${SAMPLE_SITE_TEXT}; found ${markers.map((m) => `"${m}"`).join(', ')}. Merge the first build PR before connecting a domain or going live.`
    : markers.length
      ? `${url}: not the sample site (one sample phrase seen: "${markers[0]}")`
      : `${url}: not the sample site`
}

export function connectDomainRefusal(name: string, domain: string, detail: string): string {
  return `Not connecting ${domain} to ${name}'s site: ${SAMPLE_SITE_TEXT}. The domain would show the sample business to the public. Merge the first build PR so production is the client's site, then connect the domain. (${detail})`
}

type Probe = (url: string, opts: { sampleCheck?: boolean }) => Promise<{ error: string | null; sampleMarkers?: string[] }>

/**
 * The check detail when production is the sample, else null. Reads production
 * now; when that read fails or there is no URL, the last web check
 * (website evidence sampleSite, written by run-web with the flag on).
 */
export async function sampleOnProductionWith(
  engagementId: string,
  productionUrl: string | null,
  probe: Probe,
  stored: (engagementId: string) => Promise<Record<string, unknown> | null>
): Promise<string | null> {
  if (productionUrl) {
    const p = await probe(productionUrl, { sampleCheck: true })
    if (!p.error) {
      const markers = p.sampleMarkers ?? []
      return isSamplePage(markers) ? sampleCheckDetail(productionUrl, markers) : null
    }
  }
  const ev = await stored(engagementId)
  if (ev?.sampleSite !== true) return null
  return typeof ev.sampleSiteDetail === 'string' ? ev.sampleSiteDetail : 'the last web check saw the sample site'
}
