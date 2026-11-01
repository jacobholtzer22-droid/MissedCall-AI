// The mail records of a domain, read at runtime (DOMAIN_MAIL_GUARD). Read only:
// MX, the SPF TXT at the apex, DMARC at _dmarc, DKIM at the common selectors.
// Same resolver settings as the web checks (5 s, one try).

import { promises as dnsPromises } from 'node:dns'
import type { MailSnapshot } from '@/lib/ops/mail-guard'

const resolver = new dnsPromises.Resolver({ timeout: 5000, tries: 1 })
const NO_RECORD = new Set(['ENODATA', 'ENOTFOUND'])
/** Google, Microsoft 365 (selector1/2), and the usual defaults. */
export const DKIM_SELECTORS = ['google', 'selector1', 'selector2', 'default', 'k1']

async function txt(name: string): Promise<string[]> {
  try {
    return (await resolver.resolveTxt(name)).map((parts) => parts.join(''))
  } catch (err) {
    if (NO_RECORD.has((err as { code?: string })?.code ?? '')) return []
    throw err
  }
}

export async function readMailSnapshot(domain: string): Promise<MailSnapshot> {
  const apex = domain.replace(/^www\./, '')
  const mx = await resolver.resolveMx(apex).catch((err) => {
    if (NO_RECORD.has((err as { code?: string })?.code ?? '')) return []
    throw err
  })
  const [root, dmarc, ...dkim] = await Promise.all([txt(apex), txt(`_dmarc.${apex}`), ...DKIM_SELECTORS.map((s) => txt(`${s}._domainkey.${apex}`).catch(() => []))])
  return {
    mx: mx.sort((a, b) => a.priority - b.priority).map((m) => m.exchange),
    spf: root.find((t) => t.toLowerCase().startsWith('v=spf1')) ?? null,
    dkim: DKIM_SELECTORS.filter((_, n) => dkim[n].some((t) => /v=DKIM1|k=rsa|p=/i.test(t))),
    dmarc: dmarc.find((t) => t.toUpperCase().startsWith('V=DMARC1')) ?? null,
    checkedAt: new Date().toISOString(),
    source: 'live',
  }
}
