'use client'

// Ops HQ tab: the feed's shapes (GET /api/admin/ops/hq/feed), small formatters,
// the persona avatar and a minimal markdown renderer for chief messages (bold,
// italics, inline code, links, lists, headings; React nodes only, no HTML).

import { Fragment, type ReactNode } from 'react'
import type { Persona } from '@/lib/ops/hq/personas'

export type FeedRun = {
  id: string
  agent: string | null
  mode: string | null
  kind: string
  jobId: string | null
  engagementId: string | null
  client: string | null
  status: string
  error: string | null
  startedAt: string | null
  finishedAt: string | null
  latest: { kind: string; label: string; at: string } | null
}

export type FeedEvent = { id: string; runId: string; kind: string; label: string; detail: unknown; createdAt: string }
export type FeedMessage = { id: string; jobId: string | null; role: string; body: string; createdAt: string; pending?: boolean }

export type FeedApproval = {
  id: string
  jobId: string
  runId: string
  agent: string
  kind: string
  client: string | null
  engagementId: string | null
  title: string
  detail: Record<string, unknown>
  expected: string | null
  status: string
  error: string | null
  decidedAt: string | null
  appliedAt: string | null
  createdAt: string
}

export type ReportSection = {
  agent?: string
  client?: string | null
  did?: string | string[]
  expect?: string
  links?: { label?: string; url?: string }[]
  waitingForPush?: string[] | number
}

export type FeedJob = {
  id: string
  status: string
  prompt: string
  engagementIds: string[]
  report: { text: string; sections: ReportSection[]; pendingApprovals: number } | null
  createdAt: string
  updatedAt: string
}

export type Feed = {
  cursor: string | null
  messages: FeedMessage[]
  events: FeedEvent[]
  runs: FeedRun[]
  lastRuns: Record<string, FeedRun | null>
  approvals: FeedApproval[]
  jobs: FeedJob[]
}

export const ACTIVE = ['queued', 'running', 'dispatched']
export const isActive = (r: { status: string } | null | undefined) => Boolean(r && ACTIVE.includes(r.status))

/** "12s", "4m 05s", "1h 12m". */
export function elapsed(fromIso: string | null, now: number): string {
  if (!fromIso) return ''
  const s = Math.max(0, Math.floor((now - new Date(fromIso).getTime()) / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

/** "now", "5m ago", "3h ago", "2d ago". */
export function ago(iso: string | null, now: number): string {
  if (!iso) return 'never'
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000))
  if (s < 45) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 36) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

/** +$486.40/month, -$30/month, or no change. */
export function costLine(n: unknown): string {
  const v = Number(n)
  if (!Number.isFinite(v) || v === 0) return 'No change in monthly cost'
  const abs = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 })
  return `${v > 0 ? '+' : '-'}$${abs} a month`
}

export function Avatar({ persona, size = 40 }: { persona: Persona; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-flex items-center justify-center rounded-full font-semibold text-gray-950 shrink-0"
      style={{ background: persona.color, width: size, height: size, fontSize: size * 0.42 }}
    >
      {persona.avatarLetter}
    </span>
  )
}

/** Motion for the office: typed-in labels and the slow working pulse. Off for reduced motion. */
export const HQ_CSS = `
@keyframes hq-type { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }
.hq-type { animation: hq-type 0.9s steps(36, end) both; }
@keyframes hq-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
.hq-pulse { animation: hq-pulse 2s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .hq-type, .hq-pulse { animation: none; } }
`

// ── Markdown ────────────────────────────────────────────────────────────────

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\)|https?:\/\/[^\s)]+|\*[^*\s][^*]*\*)/g

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let n = 0
  for (const m of Array.from(text.matchAll(INLINE))) {
    const tok = m[0]
    const at = m.index ?? 0
    if (at > last) out.push(text.slice(last, at))
    const k = `${key}-${n++}`
    if (tok.startsWith('**')) out.push(<strong key={k} className="font-semibold text-gray-100">{tok.slice(2, -2)}</strong>)
    else if (tok.startsWith('`')) out.push(<code key={k} className="font-mono text-[0.85em] bg-gray-800 rounded px-1">{tok.slice(1, -1)}</code>)
    else if (tok.startsWith('[')) {
      const label = tok.slice(1, tok.indexOf(']'))
      const href = tok.slice(tok.indexOf('(') + 1, -1)
      out.push(<a key={k} href={href} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 underline underline-offset-2">{label}</a>)
    } else if (tok.startsWith('http')) out.push(<a key={k} href={tok} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 underline underline-offset-2 break-all">{tok}</a>)
    else out.push(<em key={k}>{tok.slice(1, -1)}</em>)
    last = at + tok.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

/** Paragraphs, "- " / "* " / "1. " lists and "#" headings. Anything else is plain text. */
export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = []
  const lines = text.replace(/\r/g, '').split('\n')
  let i = 0
  let b = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      i++
      continue
    }
    const k = `b${b++}`
    const bullet = /^\s*[-*]\s+/
    const numbered = /^\s*\d+[.)]\s+/
    if (bullet.test(line) || numbered.test(line)) {
      const ordered = numbered.test(line)
      const items: string[] = []
      while (i < lines.length && (ordered ? numbered : bullet).test(lines[i])) items.push(lines[i++].replace(ordered ? numbered : bullet, ''))
      const List = ordered ? 'ol' : 'ul'
      blocks.push(
        <List key={k} className={`${ordered ? 'list-decimal' : 'list-disc'} pl-5 space-y-1`}>
          {items.map((it, n) => (
            <li key={n}>{inline(it, `${k}-${n}`)}</li>
          ))}
        </List>
      )
      continue
    }
    const heading = /^#{1,6}\s+/.exec(line)
    if (heading) {
      blocks.push(<p key={k} className="font-semibold text-gray-100">{inline(line.slice(heading[0].length), k)}</p>)
      i++
      continue
    }
    const para: string[] = []
    while (i < lines.length && lines[i].trim() && !bullet.test(lines[i]) && !numbered.test(lines[i]) && !/^#{1,6}\s+/.test(lines[i])) para.push(lines[i++])
    blocks.push(
      <p key={k}>
        {para.map((p, n) => (
          <Fragment key={n}>
            {n > 0 && <br />}
            {inline(p, `${k}-${n}`)}
          </Fragment>
        ))}
      </p>
    )
  }
  return <div className="space-y-2 break-words">{blocks}</div>
}
