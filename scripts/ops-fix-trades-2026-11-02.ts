/**
 * Trade fix, Nov 2 2026: most Engagement.trade values are "Other", and Cowboy
 * Spray Foam's trade fields say Car Detailing. This proposes a trade for every
 * non-ignored engagement the way the Research desk's trade_siblings does
 * (engagementTradeKey: intake trade, then name, then Engagement.trade and
 * Business.businessType, then service names) and prints a table.
 *
 * --dry (default)  READ ONLY. Prints client, current trade, proposed tradeKey,
 *                  the value that would be written and which source decided it.
 * --live <ids>     Writes Engagement.trade (the trade's label, which maps back
 *                  to the same key) for those engagement ids only, comma
 *                  separated, or "all" for every row whose proposal differs.
 *                  Nothing else is written: not Business.businessType, no
 *                  activity, no other column.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/ops-fix-trades-2026-11-02.ts
 *   npx tsx --env-file=.env scripts/ops-fix-trades-2026-11-02.ts --live id1,id2
 */

import { db } from '@/lib/db'
import { engagementTradeKey } from '@/lib/ops/hq/research-tools'
import { tradeKey, tradeLabel } from '@/lib/ops/trades'

type Row = { id: string; client: string; current: string | null; key: string | null; write: string | null; from: string | null; changes: boolean }

async function proposals(): Promise<Row[]> {
  const rows = await db.engagement.findMany({ where: { stage: { not: 'ignored' } }, select: { id: true, displayName: true, trade: true }, orderBy: { displayName: 'asc' } })
  const out: Row[] = []
  for (const e of rows) {
    const t = await engagementTradeKey(e.id)
    const write = t.key ? tradeLabel(t.key) : null
    if (write && tradeKey(write) !== t.key) throw new Error(`label "${write}" does not map back to ${t.key}`)
    out.push({ id: e.id, client: e.displayName, current: e.trade, key: t.key, write, from: t.from, changes: Boolean(write) && write !== e.trade })
  }
  return out
}

function print(rows: Row[]) {
  const cols: [string, (r: Row) => string][] = [
    ['id', (r) => r.id],
    ['client', (r) => r.client],
    ['current trade', (r) => r.current ?? '(none)'],
    ['proposed tradeKey', (r) => r.key ?? '(none)'],
    ['would write', (r) => (r.changes ? r.write! : r.write ? '(same)' : '(nothing)')],
    ['decided by', (r) => r.from ?? '(no source)'],
  ]
  const w = cols.map(([h, f]) => Math.max(h.length, ...rows.map((r) => f(r).length)))
  const line = (cells: string[]) => cells.map((c, n) => c.padEnd(w[n])).join(' | ')
  console.log(line(cols.map(([h]) => h)))
  console.log(w.map((n) => '-'.repeat(n)).join('-|-'))
  for (const r of rows) console.log(line(cols.map(([, f]) => f(r))))
  console.log(`\n${rows.length} engagements, ${rows.filter((r) => r.changes).length} would change, ${rows.filter((r) => !r.key).length} with no trade found.`)
}

async function main() {
  const at = process.argv.indexOf('--live')
  const rows = await proposals()
  if (at < 0) {
    print(rows)
    console.log('\nDry run: nothing written. Pass --live <ids|all> to write.')
    return
  }
  const arg = process.argv[at + 1]
  if (!arg) throw new Error('--live needs a comma-separated list of engagement ids, or "all"')
  const wanted = arg === 'all' ? rows.filter((r) => r.changes) : arg.split(',').map((id) => id.trim()).filter(Boolean).map((id) => {
    const r = rows.find((x) => x.id === id)
    if (!r) throw new Error(`${id} is not a non-ignored engagement`)
    return r
  })
  for (const r of wanted) {
    if (!r.changes) {
      console.log(`skip  ${r.client}: ${r.write ? 'already set' : 'no trade found'}`)
      continue
    }
    await db.engagement.update({ where: { id: r.id }, data: { trade: r.write } })
    console.log(`wrote ${r.client}: trade "${r.current ?? ''}" -> "${r.write}"`)
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
