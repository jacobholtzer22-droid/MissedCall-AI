// ===========================================
// /admin/ops: domain helpers (registrar, the DNS instruction, email records)
// ===========================================
// Pure and tested. lib/ops/hq/web.ts does the network side (Vercel, RDAP).
//
// The instruction for a domain the client already owns is ONE change written
// for a human: move the nameservers to Vercel, so Vercel owns the records from
// then on. The A/CNAME records are the alternative for a client who must keep
// DNS where it is (email already set up there, for example).

export const VERCEL_NAMESERVERS = ['ns1.vercel-dns.com', 'ns2.vercel-dns.com'] as const

/** "https://www.Example.com/x" → "example.com". Throws when it does not look like a domain. */
export function normalizeDomain(input: string): string {
  const d = input.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[/?#].*$/, '').replace(/\.$/, '')
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d)) throw new Error('domain must look like example.com')
  return d
}

const KNOWN_REGISTRARS: [RegExp, string][] = [
  [/namecheap/i, 'Namecheap'],
  [/godaddy|wild west domains/i, 'GoDaddy'],
  [/squarespace/i, 'Squarespace (formerly Google Domains)'],
  [/google/i, 'Squarespace (formerly Google Domains)'],
  [/cloudflare/i, 'Cloudflare'],
  [/vercel/i, 'Vercel'],
]

/** A registrar's name as Jacob would say it, or null when it is not one we name. */
export function registrarLabel(raw: string | null | undefined): string | null {
  if (!raw) return null
  return KNOWN_REGISTRARS.find(([re]) => re.test(raw))?.[1] ?? null
}

type Rdap = {
  entities?: { roles?: string[]; vcardArray?: [string, [string, unknown, string, unknown][]] }[]
  nameservers?: { ldhName?: string }[]
}

/** The registrar and nameservers from an RDAP domain answer (rdap.org). */
export function readRdap(json: unknown): { registrarRaw: string | null; registrar: string | null; nameservers: string[] } {
  const r = (json ?? {}) as Rdap
  const ent = (r.entities ?? []).find((e) => e.roles?.includes('registrar'))
  const fn = ent?.vcardArray?.[1]?.find((f) => f[0] === 'fn')?.[3]
  const registrarRaw = typeof fn === 'string' && fn.trim() ? fn.trim() : null
  const nameservers = (r.nameservers ?? []).map((n) => (n.ldhName ?? '').toLowerCase().replace(/\.$/, '')).filter(Boolean)
  return { registrarRaw, registrar: registrarLabel(registrarRaw), nameservers }
}

export const onVercelDns = (nameservers: string[]) => nameservers.length > 0 && nameservers.every((n) => /(^|\.)vercel-dns\.com$/i.test(n))

export type DnsRow = { type: string; name: string; value: string }

/** The one instruction for the registrar, with the records as the alternative. */
export function dnsInstruction(opts: { domain: string; registrar: string | null; records: DnsRow[]; nameservers?: string[] }): string {
  const at = opts.registrar ? `At ${opts.registrar}` : 'At your registrar'
  if (opts.nameservers && onVercelDns(opts.nameservers)) {
    return `${opts.domain} already uses Vercel's nameservers; nothing to change at the registrar.`
  }
  const records = opts.records.map((r) => `${r.type} ${r.name} ${r.value}`).join('; ')
  return [
    `${at}, set the nameservers for ${opts.domain} to ${VERCEL_NAMESERVERS.join(' and ')}. That is the one change; Vercel holds the records from then on.`,
    `If the client must keep DNS where it is (email already set up there, for example), add these records there instead: ${records}.`,
  ].join(' ')
}

export type VercelDnsRecord = { name: string; type: 'MX' | 'TXT'; value: string; mxPriority?: number; why: string }

/** Google Workspace mail records, written through Vercel's DNS when the domain is on Vercel DNS. */
export const GOOGLE_WORKSPACE_RECORDS: readonly VercelDnsRecord[] = [
  { name: '', type: 'MX', value: 'smtp.google.com', mxPriority: 1, why: 'Google Workspace mail' },
  { name: '', type: 'TXT', value: 'v=spf1 include:_spf.google.com ~all', why: 'SPF: Google may send for the domain' },
  { name: '_dmarc', type: 'TXT', value: 'v=DMARC1; p=none', why: 'DMARC, monitoring only' },
]
