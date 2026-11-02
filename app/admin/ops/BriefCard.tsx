'use client'

// A Research desk brief as a card: one collapsible block per section (the
// first two open), Target keywords as a real table from the brief's data, a
// link to the full text, and one button, "Build from this brief", which sends
// the chief "build <client>'s campaign from brief <id>". Used in the HQ chat
// under the job's last chief message, and on the brief page without the button.

import { useState } from 'react'
import { ChevronDown, ChevronRight, ExternalLink, Hammer } from 'lucide-react'
import { briefSections, type BriefTerm } from '@/lib/ops/ads-research'
import { personaFor } from '@/lib/ops/hq/personas'
import { tradeLabel } from '@/lib/ops/trades'
import { Avatar, Markdown, type FeedBrief } from './hqShared'

const research = personaFor('research')

const money = (n: number | null) => (n === null || n === undefined ? '' : `$${n.toFixed(2)}`)

function termsOf(data: unknown): BriefTerm[] {
  const t = (data as { terms?: unknown } | null)?.terms
  return Array.isArray(t) ? (t as BriefTerm[]) : []
}

export function KeywordTable({ terms }: { terms: BriefTerm[] }) {
  if (!terms.length) return <p className="text-gray-500">none found</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-gray-500 border-b border-gray-800">
            <th className="py-1.5 pr-3 font-medium">Term</th>
            <th className="py-1.5 pr-3 font-medium">Match</th>
            <th className="py-1.5 pr-3 font-medium text-right">Monthly</th>
            <th className="py-1.5 pr-3 font-medium text-right">Bid range</th>
            <th className="py-1.5 font-medium">Source</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800/60">
          {terms.map((t, n) => (
            <tr key={n} className="text-gray-300">
              <td className="py-1.5 pr-3">{t.term}</td>
              <td className="py-1.5 pr-3 font-mono text-[11px] text-gray-400">{t.matchType}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums">{t.monthlyVolume ?? 'n/a'}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums whitespace-nowrap">{t.bidLow === null && t.bidHigh === null ? 'n/a' : `${money(t.bidLow)} to ${money(t.bidHigh)}`}</td>
              <td className="py-1.5 text-gray-500">{t.source}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function BriefSections({ brief, openFirst = 2 }: { brief: Pick<FeedBrief, 'body' | 'data'>; openFirst?: number }) {
  const sections = briefSections(brief.body)
  const [open, setOpen] = useState<Set<number>>(() => new Set(sections.map((_, n) => n).filter((n) => n < openFirst)))
  const toggle = (n: number) => setOpen((cur) => {
    const next = new Set(cur)
    if (next.has(n)) next.delete(n)
    else next.add(n)
    return next
  })
  return (
    <div className="divide-y divide-gray-800">
      {sections.map((s, n) => {
        const isOpen = open.has(n)
        const keywords = s.heading.toLowerCase() === 'target keywords'
        return (
          <div key={n}>
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => toggle(n)}
              className="w-full flex items-center gap-1.5 px-3 min-h-[44px] text-left text-sm text-gray-100 hover:bg-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              {isOpen ? <ChevronDown className="h-4 w-4 text-gray-500" /> : <ChevronRight className="h-4 w-4 text-gray-500" />}
              {s.heading}
            </button>
            {isOpen && <div className="px-3 pb-3 text-sm text-gray-300">{keywords ? <KeywordTable terms={termsOf(brief.data)} /> : <Markdown text={s.text} />}</div>}
          </div>
        )
      })}
    </div>
  )
}

export function BriefCard({ brief, onBuild, className = 'ml-9' }: { brief: FeedBrief; onBuild?: (text: string) => Promise<boolean>; className?: string }) {
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const budget = (brief.data as { budget?: { dailyRecommended?: number; monthly?: number } } | null)?.budget
  return (
    <div className={`${className} rounded-lg border border-gray-800 bg-gray-950`} data-hq-brief={brief.id}>
      <div className="px-3 py-2 border-b border-gray-800 flex flex-wrap items-center gap-2">
        {research && <Avatar persona={research} size={20} />}
        <span className="text-xs font-semibold text-gray-200">Campaign brief</span>
        <span className="text-xs text-gray-500 truncate">
          {brief.client}
          {brief.tradeKey ? `, ${tradeLabel(brief.tradeKey)}` : ''}
        </span>
        {budget?.dailyRecommended !== undefined && (
          <span className="ml-auto text-xs text-gray-300 tabular-nums">
            ${budget.dailyRecommended}/day, ${budget.monthly}/month
          </span>
        )}
      </div>
      <BriefSections brief={brief} />
      <div className="px-3 py-2 border-t border-gray-800 flex flex-wrap items-center gap-3">
        {onBuild && (
          <button
            type="button"
            disabled={busy || sent}
            onClick={async () => {
              setBusy(true)
              const ok = await onBuild(`build ${brief.client}'s campaign from brief ${brief.id}`)
              setBusy(false)
              if (ok) setSent(true)
            }}
            className="inline-flex items-center gap-2 min-h-[44px] px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            <Hammer className="h-4 w-4" />
            {sent ? 'Sent to the chief' : 'Build from this brief'}
          </button>
        )}
        <a href={`/admin/ops/brief/${brief.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 min-h-[44px] text-sm text-blue-400 hover:text-blue-300">
          Full text <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  )
}
