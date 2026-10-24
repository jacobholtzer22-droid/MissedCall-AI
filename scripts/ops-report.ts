/**
 * Ops board report — every Engagement as one table row.
 *
 * Sorted by stage (STAGE_ORDER), then displayName. Columns: displayName, source,
 * stage, services, business linked, pipeline linked, Stripe subscription status,
 * monthly, upfront, upfront paid, deliverable count, and red / yellow alert
 * counts from computeEngagementAlerts.
 *
 * STRICTLY READ-ONLY: Prisma reads only. Nothing is written anywhere.
 *
 * Usage:
 *   npx tsx scripts/ops-report.ts
 *
 * Requires: DATABASE_URL
 */

import { PrismaClient } from '@prisma/client'
import { computeEngagementAlerts } from '@/lib/ops/alerts'
import { STAGE_ORDER } from '@/lib/ops/types'

const db = new PrismaClient()

const money = (n: number | null) => (n == null ? '—' : `$${n % 1 ? n.toFixed(2) : n}`)
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '—')
const yn = (v: unknown) => (v ? 'y' : 'n')

async function main() {
  const engagements = await db.engagement.findMany({
    include: {
      deliverables: { select: { type: true, manualStatus: true } },
      business: { select: { subscriptionStatus: true, ownerEmail: true, ownerPhone: true, forwardingNumber: true } },
    },
  })

  const rank = (stage: string) => {
    const i = (STAGE_ORDER as readonly string[]).indexOf(stage)
    return i === -1 ? STAGE_ORDER.length : i
  }
  engagements.sort(
    (a, b) => rank(a.stage) - rank(b.stage) || a.displayName.trim().localeCompare(b.displayName.trim())
  )

  const now = new Date()
  const header = ['displayName', 'source', 'stage', 'services', 'biz', 'pipe', 'stripeSub', 'monthly', 'upfront', 'upfrontPaid', 'dels', 'red', 'yel']
  const rows = engagements.map((e) => {
    const { alerts } = computeEngagementAlerts(e, e.deliverables, e.business, now)
    const services = Array.isArray(e.services) ? (e.services as string[]).join(',') : ''
    return [
      e.displayName.trim(),
      e.source,
      e.stage,
      services || '[]',
      yn(e.businessId),
      yn(e.pipelinePersonId),
      e.stripeSubscriptionStatus ?? '—',
      money(e.monthlyAmount),
      money(e.upfrontAmount),
      day(e.upfrontPaidAt),
      String(e.deliverables.length),
      String(alerts.filter((a) => a.severity === 'red').length),
      String(alerts.filter((a) => a.severity === 'yellow').length),
    ]
  })

  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)))
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join(' | ')
  console.log(line(header))
  console.log(widths.map((w) => '-'.repeat(w)).join('-|-'))
  for (const r of rows) console.log(line(r))
  console.log(`\n${rows.length} engagements`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
