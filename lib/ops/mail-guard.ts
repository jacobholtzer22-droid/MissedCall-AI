// ===========================================
// Domain moves keep the client's email (DOMAIN_MAIL_GUARD, off by default)
// ===========================================
// A registrar or nameserver change can drop a client's MX and TXT records and
// break their email. With the flag on, every connect_domain Push card carries
// the domain's mail records as last observed and the rule to keep them. Pure: the records come in from
// lib/ops/checks/mail.ts (a read at card time) or, when that read fails, from
// the stored domain checks (dns.mx_present, dns.txt_spf, dns.txt_dmarc). Nothing
// here changes DNS or touches a registrar.

export function domainMailGuardEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.DOMAIN_MAIL_GUARD === 'true'
}

export const KEEP_RULE = 'Keep these at the registrar; change only A and CNAME.'

export type MailSnapshot = {
  mx: string[]
  spf: string | null
  /** DKIM selectors found (e.g. google, selector1). Only the common selectors are looked up. */
  dkim: string[]
  dmarc: string | null
  checkedAt: string
  source: 'live' | 'stored'
}

/** Mail host suffix to provider. Order matters only for readability. */
const PROVIDERS: [RegExp, string][] = [
  [/(^|\.)(google|googlemail)\.com\.?$/i, 'Google Workspace'],
  [/\.mail\.protection\.outlook\.com\.?$/i, 'Microsoft 365'],
  [/(^|\.)zoho\.(com|eu|in|com\.au)\.?$/i, 'Zoho Mail'],
  [/(^|\.)secureserver\.net\.?$/i, 'GoDaddy email'],
  [/(^|\.)titan\.email\.?$/i, 'Titan email (GoDaddy, Hostinger)'],
  [/(^|\.)privateemail\.com\.?$/i, 'Namecheap Private Email'],
  [/(^|\.)protonmail\.ch\.?$/i, 'Proton Mail'],
  [/(^|\.)messagingengine\.com\.?$/i, 'Fastmail'],
  [/(^|\.)icloud\.com\.?$/i, 'iCloud Mail'],
  [/(^|\.)yahoodns\.net\.?$/i, 'Yahoo Mail'],
  [/(^|\.)(squarespace|squarespacemail)\.com\.?$/i, 'Squarespace'],
]

/** The provider behind these MX hosts: a name, the first host when unknown, or null with no MX. */
export function providerFor(mx: string[]): { name: string; google: boolean } | null {
  if (!mx.length) return null
  for (const [re, name] of PROVIDERS) if (mx.some((h) => re.test(h))) return { name, google: name === 'Google Workspace' }
  return { name: mx[0].replace(/\.$/, ''), google: false }
}

/** The lines the connect_domain card carries. */
export function mailCardText(domain: string, snap: MailSnapshot | null, failure?: string | null): string {
  if (!snap) {
    return [
      `Mail records on ${domain}: not checked yet${failure ? ` (${failure})` : ''}. Before any change, look at the MX and TXT records at the registrar.`,
      `Keep every MX and TXT record at the registrar; change only A and CNAME.`,
    ].join('\n')
  }
  const when = snap.source === 'live' ? 'checked just now' : `last checked ${snap.checkedAt.slice(0, 10)}`
  const provider = providerFor(snap.mx)
  return [
    `Mail records on ${domain} (${when}):`,
    `MX: ${snap.mx.length ? snap.mx.join(', ') : 'none (no email on this domain that we can see)'}`,
    `SPF: ${snap.spf ?? 'none'}`,
    `DKIM: ${snap.dkim.length ? `found at ${snap.dkim.map((s) => `${s}._domainkey`).join(', ')}` : snap.source === 'stored' ? 'not checked' : 'none at the common selectors'}`,
    `DMARC: ${snap.dmarc ?? 'none'}`,
    KEEP_RULE,
    ...(provider && !provider.google ? [`This client's email is with ${provider.name}; make sure the MX stays.`] : []),
  ].join('\n')
}

export type StoredCheck = { key: string; passed: boolean | null; detail: string | null; lastRunAt: Date | string }

/** The stored domain checks as a snapshot, or null when they never ran. DKIM is not among them. */
export function storedMailSnapshot(rows: StoredCheck[]): MailSnapshot | null {
  const get = (k: string) => rows.find((r) => r.key === k)
  const mx = get('dns.mx_present')
  if (!mx || mx.passed === null) return null
  const spf = get('dns.txt_spf')
  const dmarc = get('dns.txt_dmarc')
  const at = new Date(mx.lastRunAt).toISOString()
  return {
    mx: mx.passed && mx.detail ? mx.detail.split(',').map((h) => h.trim()).filter(Boolean) : [],
    spf: spf?.passed && spf.detail ? spf.detail : null,
    dkim: [],
    dmarc: dmarc?.passed && dmarc.detail ? dmarc.detail : null,
    checkedAt: at,
    source: 'stored',
  }
}
