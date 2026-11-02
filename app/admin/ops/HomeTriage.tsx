'use client'

// Home's three triage pieces (lib/ops/triage.ts):
//   Approvals  pending approvals as compact cards (the gate stays visible),
//              plus one line each for those decided in the last 30 minutes.
//   Sales      prospect follow-ups due and demo calls today: not clients.
//   Clients    ONE list in four sections, Today, Get done, Waiting on client,
//              All set and live. Each client once: its card, its reasons and
//              one action. Live starts collapsed to names.

import { useState } from 'react'
import Link from 'next/link'
import { Check, ChevronDown, Copy, ExternalLink, MessageSquare, Plus, Video } from 'lucide-react'
import type { BoardEngagement, OpsBoard } from '@/lib/ops/board'
import { BUCKET_LABELS, type BucketKey, type Triage, type TriageEntry } from '@/lib/ops/triage'
import { formatPhoneNumber } from '@/lib/utils'
import { ClientCard } from './ClientCard'
import { ApprovalCard } from './HqApprovals'
import type { FeedApproval } from './hqShared'
import { detroitTime, overdueLabel, smallButton, type OpsActions } from './opsUi'

export const OUTCOME: Record<string, { label: string; tone: string }> = {
  approved: { label: 'Applying', tone: 'text-emerald-300' },
  applied: { label: 'Applied', tone: 'text-emerald-400' },
  rejected: { label: 'Rejected', tone: 'text-gray-500' },
  failed: { label: 'Failed', tone: 'text-red-400' },
}

export function ApprovalsStrip({
  approvals,
  onDecide,
}: {
  approvals: FeedApproval[]
  onDecide: (id: string, decision: 'approve' | 'reject') => Promise<string | null>
}) {
  const pending = approvals.filter((a) => a.status === 'pending').sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const recent = approvals.filter((a) => a.status !== 'pending').sort((a, b) => (b.decidedAt ?? '').localeCompare(a.decidedAt ?? ''))
  if (!pending.length && !recent.length) return null
  return (
    <section id="ops-approvals" aria-label="Waiting for Push" className="bg-gray-900 border border-gray-800 rounded-lg scroll-mt-4">
      <div className="px-4 py-3 border-b border-gray-800">
        <h2 className="text-sm font-semibold text-gray-100">
          Waiting for Push
          <span className="ml-2 text-gray-500 font-normal tabular-nums">{pending.length}</span>
        </h2>
      </div>
      {recent.length > 0 && (
        <ul className="px-4 py-2 border-b border-gray-800 space-y-1" aria-label="Decided in the last 30 minutes">
          {recent.map((a) => (
            <li key={a.id} className="text-xs flex items-baseline gap-2 min-w-0">
              <span className={`shrink-0 ${OUTCOME[a.status]?.tone ?? 'text-gray-400'}`}>{OUTCOME[a.status]?.label ?? a.status}</span>
              <span className="min-w-0 truncate text-gray-400" title={a.error ? `${a.title}: ${a.error}` : a.title}>
                {a.client ? `${a.client}: ` : ''}
                {a.title}
              </span>
            </li>
          ))}
        </ul>
      )}
      {pending.length > 0 && (
        <div className="p-3 grid gap-3 sm:grid-cols-2">
          {pending.map((a) => (
            <ApprovalCard key={a.id} approval={a} onDecide={onDecide} compact />
          ))}
        </div>
      )}
    </section>
  )
}

export function SalesStrip({ sales, board, actions }: { sales: Triage['sales']; board: OpsBoard; actions: OpsActions }) {
  if (!sales.prospectFollowUps.length && !sales.demoCallsToday.length) return null
  return (
    <section aria-label="Sales" className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 space-y-2">
      <h2 className="text-sm font-semibold text-gray-100">
        Sales
        <span className="ml-2 text-gray-500 font-normal">not clients yet</span>
      </h2>
      <ul className="space-y-2">
        {sales.demoCallsToday.map((b) => {
          const full = board.bookedToday.find((x) => x.id === b.id)
          return (
            <li key={b.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="w-16 shrink-0 tabular-nums text-gray-100">{detroitTime(b.scheduledAt)}</span>
              <span className="text-gray-200">Demo call: {b.customerName}</span>
              <span className="ml-auto flex flex-wrap gap-2">
                {full?.googleMeetLink && (
                  <a href={full.googleMeetLink} target="_blank" rel="noreferrer" className={`${smallButton} min-h-[44px]`}>
                    <Video className="h-3.5 w-3.5" /> Meet
                  </a>
                )}
                {(['showed', 'no_show'] as const).map((v) => {
                  const on = b.showStatus === v
                  return (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={on}
                      onClick={() => actions.setShowStatus(b.id, on ? 'pending' : v)}
                      className={`${smallButton} min-h-[44px] ${on ? (v === 'showed' ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300' : 'border-red-500 bg-red-500/15 text-red-300') : ''}`}
                    >
                      {v === 'showed' ? 'Showed' : 'No-show'}
                    </button>
                  )
                })}
              </span>
            </li>
          )
        })}
        {sales.prospectFollowUps.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-gray-200">Prospect follow-up: {p.name}</span>
            {p.phone && (
              <a href={`tel:${p.phone}`} className="text-xs text-blue-400 tabular-nums">
                {formatPhoneNumber(p.phone)}
              </a>
            )}
            <span className="text-xs text-amber-300">{overdueLabel(p.dueAt)}</span>
            <Link href="/admin/pipeline" className={`${smallButton} min-h-[44px] ml-auto`}>
              Log in pipeline <ExternalLink className="h-3 w-3" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

const SEND_LABEL: Record<string, string> = { questionnaire: 'Onboarding questions', preview: 'Website preview', live: "You're live", questions: 'Questions from the build' }

/**
 * CLIENT_SEND_DRAFTS (off by default): texts ready for Jacob to send himself, with
 * Copy and Open in Messages. Nothing is sent from here. "Mark sent" is his tap and
 * only records that he sent it. Renders nothing when the board carries no list.
 */
export function SendDraftsStrip({ board }: { board: OpsBoard }) {
  const drafts = board.sendDrafts
  const [copied, setCopied] = useState<string | null>(null)
  const [done, setDone] = useState<Set<string>>(new Set())
  if (!drafts?.length) return null
  const shown = drafts.filter((d) => !done.has(`${d.engagementId}:${d.kind}`))
  if (!shown.length) return null
  const copy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(id)
    } catch {
      setCopied(null)
    }
  }
  const mark = async (engagementId: string, kind: string, key: string) => {
    const res = await fetch(`/api/admin/ops/engagements/${engagementId}/send-drafts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, key }),
    }).catch(() => null)
    if (res?.ok) setDone((s) => new Set(s).add(`${engagementId}:${kind}`))
  }
  return (
    <section id="ops-ready-to-send" aria-label="Ready to send" className="scroll-mt-4 bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 space-y-2">
      <h2 className="text-sm font-semibold text-gray-100">
        Ready to send
        <span className="ml-2 text-gray-500 font-normal">you send these yourself</span>
      </h2>
      <ul className="space-y-3">
        {shown.map((d) => {
          const id = `${d.engagementId}:${d.kind}`
          return (
            <li key={id} className="space-y-1 text-sm">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-gray-100">{d.client}</span>
                <span className="text-gray-400">{SEND_LABEL[d.kind] ?? d.kind}</span>
                <span className="text-xs text-gray-500">{d.why}</span>
              </div>
              <p className="max-h-40 overflow-y-auto text-xs text-gray-300 whitespace-pre-wrap">{d.text}</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => copy(id, d.text)} className={`${smallButton} min-h-[44px]`}>
                  {copied === id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied === id ? 'Copied' : 'Copy text'}
                </button>
                {d.phone && (
                  <a href={`sms:${d.phone}?&body=${encodeURIComponent(d.text)}`} className={`${smallButton} min-h-[44px]`}>
                    <MessageSquare className="h-3.5 w-3.5" /> Open in Messages
                  </a>
                )}
                <button type="button" onClick={() => void mark(d.engagementId, d.kind, d.key)} className={`${smallButton} min-h-[44px]`}>
                  Mark sent
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/**
 * READY_TO_BILL (off by default): everything a client bought is live and no
 * subscription is seen. One row each; Dismiss is Jacob's tap (an activity marker).
 * Stripe is never touched from here. Renders nothing when the board carries no rows.
 */
export function ReadyToBillStrip({ board }: { board: OpsBoard }) {
  const rows = board.billRows
  const [gone, setGone] = useState<Set<string>>(new Set())
  const [proposed, setProposed] = useState<Record<string, string>>({})
  if (!rows?.length) return null
  const shown = rows.filter((r) => !gone.has(r.engagementId))
  if (!shown.length) return null
  const liveDraft = new Set((board.sendDrafts ?? []).filter((d) => d.kind === 'live').map((d) => d.engagementId))
  const dismiss = async (id: string) => {
    const res = await fetch(`/api/admin/ops/engagements/${id}/ready-to-bill`, { method: 'POST' }).catch(() => null)
    if (res?.ok) setGone((s) => new Set(s).add(id))
  }
  // STRIPE_CARD_AT_SIGNUP: propose the Start subscription card (nothing is charged until Push).
  const propose = async (id: string) => {
    setProposed((s) => ({ ...s, [id]: 'Proposing...' }))
    const res = await fetch(`/api/admin/ops/engagements/${id}/start-subscription`, { method: 'POST' }).catch(() => null)
    const data = (await res?.json().catch(() => ({}))) ?? {}
    setProposed((s) => ({ ...s, [id]: res?.ok ? 'Waiting for your Push in Ops HQ' : String(data.error ?? 'Could not propose it') }))
  }
  return (
    <section aria-label="Ready to bill" className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 space-y-2">
      <h2 className="text-sm font-semibold text-gray-100">
        Ready to bill
        <span className="ml-2 text-gray-500 font-normal">set it up in Stripe yourself</span>
      </h2>
      <ul className="space-y-3">
        {shown.map((r) => (
          <li key={r.engagementId} className="space-y-1 text-sm">
            <p className="text-gray-100">{r.text}</p>
            {r.details.map((d) => (
              <p key={d} className={`text-xs ${d.startsWith('Check Stripe') ? 'text-amber-300' : 'text-gray-400'}`}>
                {d}
              </p>
            ))}
            <div className="flex flex-wrap gap-2">
              {liveDraft.has(r.engagementId) && (
                <a href="#ops-ready-to-send" className={`${smallButton} min-h-[44px]`}>
                  The you&apos;re live text is ready
                </a>
              )}
              {r.cardOnFile && (
                <button type="button" onClick={() => void propose(r.engagementId)} className={`${smallButton} min-h-[44px]`}>
                  Start subscription
                </button>
              )}
              <button type="button" onClick={() => void dismiss(r.engagementId)} className={`${smallButton} min-h-[44px]`}>
                Dismiss
              </button>
            </div>
            {proposed[r.engagementId] && <p className="text-xs text-gray-400">{proposed[r.engagementId]}</p>}
          </li>
        ))}
      </ul>
    </section>
  )
}

const BUCKET_TONE: Record<BucketKey, string> = {
  today: 'text-red-300',
  getDone: 'text-orange-300',
  waitingOnClient: 'text-blue-300',
  live: 'text-emerald-300',
}

export function ClientBuckets({
  triage,
  board,
  actions,
  working,
  showRevenue,
}: {
  triage: Triage
  board: OpsBoard
  actions: OpsActions
  working: Map<string, string>
  showRevenue: boolean
}) {
  const [liveOpen, setLiveOpen] = useState(false)
  const byId = new Map(board.engagements.map((e) => [e.id, e]))
  const total = triage.today.length + triage.getDone.length + triage.waitingOnClient.length + triage.live.length

  return (
    <section aria-label="Clients" className="space-y-4">
      <div className="flex items-center justify-between gap-2 px-1">
        <h2 className="text-sm font-semibold text-gray-100">
          Clients
          <span className="ml-2 text-gray-500 font-normal tabular-nums">{total}</span>
        </h2>
        <button
          type="button"
          onClick={actions.newClient}
          className="inline-flex items-center gap-1 px-2 min-h-[44px] rounded-lg text-sm text-blue-400 hover:text-blue-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <Plus className="h-4 w-4" /> New client
        </button>
      </div>

      {(['today', 'getDone', 'waitingOnClient'] as const).map((key) => (
        <div key={key} className="space-y-2">
          <h3 className={`px-1 text-sm font-semibold ${BUCKET_TONE[key]}`}>
            {BUCKET_LABELS[key]}
            <span className="ml-2 text-gray-500 font-normal tabular-nums">{triage[key].length}</span>
          </h3>
          {triage[key].length === 0 ? (
            <p className="px-1 text-sm text-gray-500">{key === 'today' ? 'Nothing urgent.' : 'None.'}</p>
          ) : (
            <ul className="grid gap-2 md:grid-cols-2">
              {triage[key].map((t) => {
                const e = byId.get(t.engagementId)
                return e ? (
                  <li key={t.engagementId}>
                    <TriageRow t={t} e={e} actions={actions} working={working.get(e.id) ?? null} showRevenue={showRevenue} />
                  </li>
                ) : null
              })}
            </ul>
          )}
        </div>
      ))}

      <div className="space-y-2">
        <button
          type="button"
          aria-expanded={liveOpen}
          onClick={() => setLiveOpen((o) => !o)}
          className={`w-full flex items-center justify-between gap-2 px-1 min-h-[44px] text-sm font-semibold ${BUCKET_TONE.live} focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded`}
        >
          <span>
            {BUCKET_LABELS.live}
            <span className="ml-2 text-gray-500 font-normal tabular-nums">{triage.live.length}</span>
          </span>
          <ChevronDown className={`h-4 w-4 text-gray-500 ${liveOpen ? 'rotate-180' : ''}`} />
        </button>
        {liveOpen ? (
          <ul className="grid gap-2 md:grid-cols-2">
            {triage.live.map((t) => {
              const e = byId.get(t.engagementId)
              return e ? (
                <li key={t.engagementId}>
                  <ClientCard e={e} working={working.get(e.id) ?? null} showRevenue={showRevenue} onOpen={actions.openEngagement} />
                </li>
              ) : null
            })}
          </ul>
        ) : (
          <p className="px-1 text-sm text-gray-400 break-words">{triage.live.map((t) => t.name).join(', ') || 'None yet.'}</p>
        )}
      </div>

      {triage.churnedCount > 0 && (
        <p className="px-1 text-xs text-gray-500">
          {triage.churnedCount} churned, on the{' '}
          <Link href="/admin/ops?tab=clients" className="text-blue-400 hover:text-blue-300">
            Clients tab
          </Link>
        </p>
      )}
    </section>
  )
}

function TriageRow({
  t,
  e,
  actions,
  working,
  showRevenue,
}: {
  t: TriageEntry
  e: BoardEngagement
  actions: OpsActions
  working: string | null
  showRevenue: boolean
}) {
  const [busy, setBusy] = useState(false)
  const snooze = async (days: number) => {
    setBusy(true)
    await actions.snooze(e.id, days)
    setBusy(false)
  }
  const own = t.reasons.filter((r) => r.bucket === t.bucket)
  const other = t.reasons.filter((r) => r.bucket !== t.bucket)
  return (
    <div className="space-y-1.5">
      <ClientCard e={e} working={working} showRevenue={showRevenue} onOpen={actions.openEngagement} />
      <ul className="px-1 space-y-0.5 text-xs">
        {own.map((r, i) => (
          <li key={`o${i}`} className="text-gray-200 break-words">
            {r.text}
          </li>
        ))}
        {other.map((r, i) => (
          <li key={`x${i}`} className="text-gray-500 break-words">
            {r.text}
          </li>
        ))}
      </ul>
      {t.primaryAction && (
        <div className="px-1 flex flex-wrap gap-2">
          {t.primaryAction.kind === 'push' && (
            <a href="#ops-approvals" className={`${smallButton} min-h-[44px]`}>
              Review and Push
            </a>
          )}
          {t.primaryAction.kind === 'log_contact' && (
            <>
              <button type="button" onClick={() => actions.openEngagement(e.id, 'activity')} className={`${smallButton} min-h-[44px]`}>
                Log contact
              </button>
              {[1, 3, 7].map((d) => (
                <button key={d} type="button" disabled={busy} onClick={() => snooze(d)} aria-label={`Snooze ${d} day${d === 1 ? '' : 's'}`} className={`${smallButton} min-h-[44px] min-w-[44px]`}>
                  {d}d
                </button>
              ))}
            </>
          )}
          {t.primaryAction.kind === 'open' && (
            <button type="button" onClick={() => actions.openEngagement(e.id)} className={`${smallButton} min-h-[44px]`}>
              Open
            </button>
          )}
        </div>
      )}
    </div>
  )
}
