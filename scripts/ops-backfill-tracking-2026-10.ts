/**
 * Google tag backfill, October 2026: what every ads client has, before any
 * install_tracking runs.
 *
 * For each client with a Google Ads account on the board (adsClients): the
 * account's AW- id, its enabled conversion actions, which one is the website
 * lead form, the click-to-call on the site and calls from ads, their tag
 * labels, and whether the production site already carries a Google tag (and
 * whose).
 *
 * --dry           READ ONLY. Google Ads reads and one GET of each production
 *                 page; nothing is written anywhere. The default.
 * --write-labels  Also saves googleAdsId and conversionActions on each ads
 *                 deliverable (Ops evidence only, nothing on Google or a site),
 *                 so install_tracking can run. Only on Jacob's word.
 *
 * Installing the tag is not done here: install_tracking, per client, on
 * Jacob's word, waits for his Push like any site change.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/ops-backfill-tracking-2026-10.ts --dry
 *
 * Requires: DATABASE_URL and the five GOOGLE_ADS_* variables (read by name).
 */

import { db } from '@/lib/db'
import { probePage } from '@/lib/ops/checks/web'
import { adsClients } from '@/lib/ops/hq/ads'
import { isNeverTouch, mergeAdsEvidence, missingAdsEnv, readConversionRows, readOnlyAdsContext } from '@/lib/ops/hq/ads-tools'
import { classifyConversionActions } from '@/lib/ops/tracking'

const write = process.argv.includes('--write-labels')
if (!write && !process.argv.includes('--dry')) {
  console.error('Pass --dry (read only) or --write-labels.')
  process.exit(1)
}

async function main() {
  const missing = missingAdsEnv()
  if (missing.length) throw new Error(`Google Ads env not set: ${missing.join(', ')}`)
  const clients = (await adsClients()).filter((c) => !isNeverTouch(c.name)).sort((a, b) => a.name.localeCompare(b.name))
  const sites = await db.deliverable.findMany({ where: { type: 'website', engagementId: { in: clients.map((c) => c.id) } }, select: { engagementId: true, evidence: true } })
  console.log(`${write ? 'WRITE LABELS' : 'DRY RUN, read only'}: ${clients.length} ads clients\n`)

  for (const c of clients) {
    const ev = (sites.find((s) => s.engagementId === c.id)?.evidence ?? {}) as Record<string, unknown>
    const url = typeof ev.productionUrl === 'string' ? ev.productionUrl : null
    const lines: string[] = [`== ${c.name} (Google Ads ${c.customerId})`]
    try {
      const { rows, trackingId } = await readConversionRows(readOnlyAdsContext(c.customerId, c.name))
      const found = classifyConversionActions(rows, {}, trackingId)
      const ca = found.conversionActions
      lines.push(`   AW- id           ${found.googleAdsId ?? 'none found'}${trackingId ? ` (conversion tracking id ${trackingId})` : ''}`)
      lines.push(`   enabled actions  ${rows.length ? rows.map((r) => `${r.id} "${r.name}" ${r.type}/${r.category}`).join('; ') : 'none'}`)
      lines.push(`   form             ${ca.formId ? `${ca.formId} label ${ca.formLabel ?? 'none'}` : 'none'}`)
      lines.push(`   click-to-call    ${ca.callId ? `${ca.callId} label ${ca.callLabel ?? 'none'}` : 'none'}`)
      lines.push(`   calls from ads   ${ca.adCallId ?? 'none'}`)
      if (url) {
        const p = await probePage(url)
        const match = found.googleAdsId ? p.gtagIds.includes(found.googleAdsId) : null
        lines.push(`   site             ${url}: ${p.error ? `could not load (${p.error})` : p.gtagIds.length ? `tag ${p.gtagIds.join(', ')}${match === null ? '' : match ? ' (matches)' : ' (NOT this account)'}` : 'no Google tag'}`)
      } else {
        lines.push('   site             no production URL on the website deliverable')
      }
      if (write) {
        const saved = await mergeAdsEvidence(c.id, { googleAdsId: found.googleAdsId, conversionActions: ca, labelsReadAt: new Date().toISOString() })
        lines.push(`   saved            ${saved ? 'googleAdsId and conversionActions on the ads deliverable' : 'no ads deliverable, nothing saved'}`)
      }
    } catch (err) {
      lines.push(`   error            ${err instanceof Error ? err.message : String(err)}`)
    }
    console.log(lines.join('\n'))
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
