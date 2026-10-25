// ===========================================
// /admin/ops web checks — website and domain checks (read only)
// ===========================================
// Each function returns OpsCheck results; nothing here writes. passed = null
// means the check could not run (no project, resolver error, timeout), with
// the reason in detail.
//
// Informational checks (INFORMATIONAL_CHECK_KEYS in lib/ops/types.ts) are
// recorded for the panel; deriveDeliverableStatus skips them.

import { promises as dnsPromises } from 'node:dns'
import { INFORMATIONAL_CHECK_KEYS, type OpsCheckKey } from '@/lib/ops/types'
import type { GithubRepo, VercelProject } from './discover'
import { errMessage, fetchWithTimeout } from './limit'

export type CheckResult = { key: OpsCheckKey; passed: boolean | null; detail: string | null }

export { INFORMATIONAL_CHECK_KEYS }

/**
 * Vercel's A records for an apex domain: the classic 76.76.21.21 plus the
 * newer ranges Vercel hands out (live client apexes resolve to 216.150.1.1).
 */
const VERCEL_A_PREFIXES = ['76.76.21.', '216.198.79.', '216.150.1.', '216.150.16.']
const isVercelIp = (ip: string) => VERCEL_A_PREFIXES.some((p) => ip.startsWith(p))
const isVercelCname = (c: string) => /(^|\.)vercel-dns(-\d+)?\.com\.?$/i.test(c)

const r = (key: OpsCheckKey, passed: boolean | null, detail: string | null = null): CheckResult => ({ key, passed, detail })

// ── HTTP ────────────────────────────────────────────────────────────────────

export type PageProbe = { status: number | null; finalUrl: string | null; noindex: boolean; noindexWhere: string | null; error: string | null }

/** GET the page (redirects followed) and look for noindex in X-Robots-Tag or a robots meta tag. */
export async function probePage(url: string): Promise<PageProbe> {
  try {
    const res = await fetchWithTimeout(url, { redirect: 'follow', headers: { 'User-Agent': 'aa-ops-web-checks' } }, 10_000)
    const header = res.headers.get('x-robots-tag') ?? ''
    const html = (await res.text()).slice(0, 300_000)
    const meta = Array.from(html.matchAll(/<meta\b[^>]*>/gi))
      .map((m) => m[0])
      .find((tag) => /name\s*=\s*["']?(robots|googlebot)["']?/i.test(tag) && /noindex/i.test(tag))
    const where = /noindex/i.test(header) ? `x-robots-tag: ${header}` : meta ? 'robots meta tag' : null
    return { status: res.status, finalUrl: res.url, noindex: where !== null, noindexWhere: where, error: null }
  } catch (err) {
    return { status: null, finalUrl: null, noindex: false, noindexWhere: null, error: errMessage(err) }
  }
}

// ── DNS ─────────────────────────────────────────────────────────────────────

const resolver = new dnsPromises.Resolver({ timeout: 5000, tries: 1 })

/** A DNS answer: records, "none" when the name has no such record, or an error. */
type Answer<T> = { ok: true; records: T[] } | { ok: false; error: string }
const NO_RECORD = new Set(['ENODATA', 'ENOTFOUND'])

async function lookup<T>(fn: () => Promise<T[]>): Promise<Answer<T>> {
  try {
    return { ok: true, records: await fn() }
  } catch (err) {
    const code = (err as { code?: string })?.code
    if (code && NO_RECORD.has(code)) return { ok: true, records: [] }
    return { ok: false, error: code ?? errMessage(err) }
  }
}

// ── Website ─────────────────────────────────────────────────────────────────

export type WebsiteInput = {
  step: string | null
  businessSlug: string | null
  repo: GithubRepo | null
  project: VercelProject | null
  /** The URL the live checks fetch: primary custom domain, else the project's vercel.app domain. */
  productionUrl: string | null
}

export async function websiteChecks(w: WebsiteInput): Promise<{ results: CheckResult[]; probe: PageProbe | null }> {
  const out: CheckResult[] = []
  const p = w.project
  out.push(r('vercel.project_found', Boolean(p), p ? p.name : 'no Vercel project matched'))
  out.push(p ? r('vercel.git_linked', Boolean(p.gitRepo), p.gitRepo ?? `not git-linked${p.gitType ? ` (${p.gitType})` : ''}`) : r('vercel.git_linked', null, 'no Vercel project'))
  if (!p) out.push(r('vercel.prod_ready', null, 'no Vercel project'))
  else if (!p.production) out.push(r('vercel.prod_ready', false, 'no production deployment'))
  else out.push(r('vercel.prod_ready', p.production.state === 'READY', `latest production deployment ${p.production.state}`))

  if (!w.repo?.siteSlug || !w.businessSlug) {
    out.push(r('slug.matches_db', null, !w.repo ? 'no repo matched' : !w.repo.siteSlug ? 'no businessSlug in site.config.ts' : 'no platform account linked'))
  } else {
    const ok = w.repo.siteSlug === w.businessSlug
    out.push(r('slug.matches_db', ok, ok ? w.businessSlug : `repo "${w.repo.siteSlug}" vs DB "${w.businessSlug}"`))
  }
  out.push(w.repo ? r('repo.has_workflow', w.repo.hasWorkflow, w.repo.hasWorkflow ? '.github/workflows/aa-build.yml' : 'no aa-build.yml') : r('repo.has_workflow', null, 'no repo matched'))

  let probe: PageProbe | null = null
  if (!w.productionUrl) {
    out.push(r('http.indexing_matches_step', null, 'no production URL'))
    out.push(r('http.homepage_200', null, 'no production URL'))
  } else {
    probe = await probePage(w.productionUrl)
    if (probe.error) {
      out.push(r('http.indexing_matches_step', null, `${w.productionUrl}: ${probe.error}`))
      out.push(r('http.homepage_200', null, `${w.productionUrl}: ${probe.error}`))
    } else {
      const live = w.step === 'live'
      const ok = live ? !probe.noindex : probe.noindex
      const seen = probe.noindex ? `noindex (${probe.noindexWhere})` : 'indexable (no noindex)'
      out.push(
        r(
          'http.indexing_matches_step',
          ok,
          `step ${w.step ?? '(none)'} expects ${live ? 'indexable' : 'noindex'}; site is ${seen}`
        )
      )
      out.push(r('http.homepage_200', probe.status === 200, `${probe.finalUrl ?? w.productionUrl} → ${probe.status}`))
    }
  }
  return { results: out, probe }
}

// ── Domain ──────────────────────────────────────────────────────────────────

export async function domainChecks(primaryDomain: string, project: VercelProject | null): Promise<CheckResult[]> {
  const apex = primaryDomain.replace(/^www\./, '')
  const www = `www.${apex}`
  const [a4, apexCname, wwwCname, www4, mx, txt, dmarc, https] = await Promise.all([
    lookup(() => resolver.resolve4(apex)),
    lookup(() => resolver.resolveCname(apex)),
    lookup(() => resolver.resolveCname(www)),
    lookup(() => resolver.resolve4(www)),
    lookup(() => resolver.resolveMx(apex)),
    lookup(() => resolver.resolveTxt(apex)),
    lookup(() => resolver.resolveTxt(`_dmarc.${apex}`)),
    probePage(`https://${primaryDomain}`),
  ])
  const out: CheckResult[] = []

  // Apex → Vercel
  if (!a4.ok && !apexCname.ok) out.push(r('dns.apex_points_to_vercel', null, `resolver error: ${a4.error}`))
  else {
    const ips = a4.ok ? a4.records : []
    const cn = apexCname.ok ? apexCname.records : []
    const ok = ips.some(isVercelIp) || cn.some(isVercelCname)
    out.push(r('dns.apex_points_to_vercel', ok, `A ${ips.join(', ') || 'none'}${cn.length ? `; CNAME ${cn.join(', ')}` : ''}`))
  }

  // www → Vercel
  if (!wwwCname.ok && !www4.ok) out.push(r('dns.www_cname', null, `resolver error: ${wwwCname.error}`))
  else {
    const cn = wwwCname.ok ? wwwCname.records : []
    const ips = www4.ok ? www4.records : []
    const ok = cn.some(isVercelCname) || ips.some(isVercelIp)
    out.push(r('dns.www_cname', ok, `${www}: CNAME ${cn.join(', ') || 'none'}; A ${ips.join(', ') || 'none'}`))
  }

  // Verified in Vercel
  if (!project) out.push(r('vercel.domain_verified', null, 'no Vercel project'))
  else {
    const names = project.domains.filter((d) => d.name === apex || d.name === www)
    out.push(
      names.length === 0
        ? r('vercel.domain_verified', false, `${primaryDomain} not on project ${project.name}`)
        : r('vercel.domain_verified', names.every((d) => d.verified), names.map((d) => `${d.name} ${d.verified ? 'verified' : 'unverified'}`).join('; '))
    )
  }

  // Mail
  const hasMx = mx.ok && mx.records.length > 0
  out.push(mx.ok ? r('dns.mx_present', hasMx, hasMx ? mx.records.map((m) => m.exchange).join(', ') : 'no MX') : r('dns.mx_present', null, `resolver error: ${mx.error}`))
  if (!mx.ok || !txt.ok) out.push(r('dns.txt_spf', null, `resolver error: ${!mx.ok ? mx.error : (txt as { error: string }).error}`))
  else if (!hasMx) out.push(r('dns.txt_spf', null, 'no MX, SPF not required'))
  else {
    const spf = txt.records.map((parts) => parts.join('')).find((t) => t.toLowerCase().startsWith('v=spf1'))
    out.push(r('dns.txt_spf', Boolean(spf), spf ?? 'MX present but no v=spf1 TXT at the apex'))
  }
  if (!dmarc.ok) out.push(r('dns.txt_dmarc', null, `resolver error: ${dmarc.error}`))
  else {
    const rec = dmarc.records.map((parts) => parts.join('')).find((t) => t.toUpperCase().startsWith('V=DMARC1'))
    out.push(r('dns.txt_dmarc', Boolean(rec), rec ?? 'no DMARC record'))
  }

  // HTTPS on the primary domain
  out.push(
    https.error
      ? r('http.https_200', null, `https://${primaryDomain}: ${https.error}`)
      : r('http.https_200', https.status === 200, `https://${primaryDomain} → ${https.status}`)
  )
  return out
}
