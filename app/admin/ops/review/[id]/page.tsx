import { auth } from '@clerk/nextjs/server'
import { notFound, redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { FLAG_LABEL, TRACKING_LABEL, type ReviewMetrics } from '@/lib/ops/hq/ads-review-report'
import { Markdown } from '../../hqShared'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Weekly ads review',
  robots: { index: false, follow: false },
}

const money = (n: number | null | undefined) => (n === null || n === undefined ? 'n/a' : `$${n.toFixed(2)}`)
const pct = (n: number | null | undefined) => (n === null || n === undefined ? 'n/a' : `${Math.round(n * 100)}%`)

function MetricsTable({ d7, d30 }: { d7: Partial<ReviewMetrics>; d30: Partial<ReviewMetrics> }) {
  const rows: [string, (m: Partial<ReviewMetrics>) => string][] = [
    ['Cost', (m) => money(m.cost)],
    ['Clicks', (m) => String(m.clicks ?? 0)],
    ['CPC', (m) => money(m.cpc)],
    ['Conversions', (m) => String(m.conversions ?? 0)],
    ['Cost per conversion', (m) => money(m.costPerConversion)],
    ['Search impression share', (m) => pct(m.searchImpressionShare)],
    ['Lost to budget', (m) => pct(m.lostToBudget)],
    ['Lost to rank', (m) => pct(m.lostToRank)],
  ]
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-gray-500 border-b border-gray-800">
          <th className="py-1.5 pr-3 font-medium" />
          <th className="py-1.5 pr-3 font-medium text-right">7 days</th>
          <th className="py-1.5 font-medium text-right">30 days</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-800/60">
        {rows.map(([label, f]) => (
          <tr key={label} className="text-gray-300">
            <td className="py-1.5 pr-3 text-gray-400">{label}</td>
            <td className="py-1.5 pr-3 text-right tabular-nums">{f(d7)}</td>
            <td className="py-1.5 text-right tabular-nums">{f(d30)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Admin only: one weekly ads review in full. */
export default async function ReviewPage({ params }: { params: { id: string } }) {
  const { userId } = await auth()
  if (!userId || userId !== process.env.ADMIN_USER_ID) redirect('/dashboard')
  const r = await db.adsReview.findUnique({ where: { id: params.id }, include: { engagement: { select: { displayName: true } } } })
  if (!r) notFound()
  const when = r.createdAt.toLocaleString('en-US', { timeZone: 'America/Detroit', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
  const m = (r.metrics ?? {}) as { d7?: Partial<ReviewMetrics>; d30?: Partial<ReviewMetrics> }
  const changes = (Array.isArray(r.changes) ? r.changes : []) as { tool?: string; args?: Record<string, unknown>; changed?: boolean }[]
  const proposals = (Array.isArray(r.proposals) ? r.proposals : []) as { title?: string; action?: string; args?: Record<string, unknown>; hold?: string; approvalId?: string }[]
  const flags = (Array.isArray(r.flags) ? r.flags : []) as string[]
  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 px-4 py-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <a href="/admin/ops?tab=hq" className="inline-flex items-center min-h-[44px] text-sm text-blue-400 hover:text-blue-300">
          Back to HQ
        </a>
        <header>
          <h1 className="text-lg font-semibold">Weekly ads review: {r.engagement.displayName.trim()}</h1>
          <p className="text-sm text-gray-500">
            {TRACKING_LABEL[r.trackingState as keyof typeof TRACKING_LABEL] ?? r.trackingState}, account {r.customerId}, written {when}
          </p>
        </header>
        <section className="rounded-lg border border-gray-800 bg-gray-900 px-4 py-3 text-sm text-gray-300">
          <Markdown text={r.summary} />
        </section>
        <section className="rounded-lg border border-gray-800 bg-gray-900 px-4 py-3">
          <MetricsTable d7={m.d7 ?? {}} d30={m.d30 ?? {}} />
        </section>
        <section className="rounded-lg border border-gray-800 bg-gray-900 px-4 py-3 text-sm space-y-2">
          <h2 className="font-semibold text-gray-100">Flags</h2>
          <p className="text-gray-300">{flags.length ? flags.map((f) => FLAG_LABEL[f] ?? f).join(', ') : 'none'}</p>
          <h2 className="font-semibold text-gray-100 pt-2">Changes made</h2>
          {changes.length ? (
            <ul className="space-y-1">
              {changes.map((c, n) => (
                <li key={n} className="text-gray-300">
                  <span className="font-mono text-xs text-gray-400">{c.tool}</span> {c.changed ? '' : '(checked, not made) '}
                  <span className="font-mono text-xs text-gray-500 break-all">{JSON.stringify(c.args ?? {})}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500">none</p>
          )}
          <h2 className="font-semibold text-gray-100 pt-2">Proposals</h2>
          {proposals.length ? (
            <ul className="space-y-1">
              {proposals.map((p, n) => (
                <li key={n} className="text-gray-300">
                  {p.title} <span className="font-mono text-xs text-gray-400">{p.action}</span>
                  {p.hold ? <span className="text-amber-300"> (held: {p.hold})</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500">none</p>
          )}
        </section>
      </div>
    </main>
  )
}
