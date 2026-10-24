'use client'

// Right-side detail panel for one engagement, same shell as
// app/admin/ClientDetailPanel. Top to bottom: header fields, Stripe, alerts,
// deliverables, notes, activity, links. Every field saves on its own
// (change for selects and checkboxes, blur for text) through OpsActions,
// which updates the board optimistically and reverts on failure.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ExternalLink, X } from 'lucide-react'
import type { BoardActivity, BoardDeliverable, BoardEngagement } from '@/lib/ops/board'
import type { UnmatchedPayingCustomer } from '@/lib/ops/sync'
import { DELIVERABLE_STATUSES, ENGAGEMENT_STAGES, OPS_ACTIVITY_KINDS, SERVICE_KEYS, type DeliverableType } from '@/lib/ops/types'
import { EVIDENCE_FIELDS_FOR_TYPE, SYNC_EVIDENCE_FOR_TYPE } from '@/lib/ops/evidence'
import { STEP_CATALOG, defaultWaitingOn, effectiveStatusOf, stepFor } from '@/lib/ops/steps'
import { formatPhoneNumber } from '@/lib/utils'
import { Age, HealthDot } from '../ui'
import { StripeCustomerPicker } from './Pickers'
import {
  ALERT_TONE,
  DELIVERABLE_STATUS_LABELS,
  DeliverableChip,
  OWNER_LABELS,
  STAGE_LABELS,
  StepChip,
  StripeStatusPill,
  detroitDate,
  money,
  smallButton,
  smallControl,
  toLocalInput,
  type OpsActions,
} from './opsUi'

/** Kinds offered in the Log contact form; status_change and system are written by the API. */
const LOG_KINDS = OPS_ACTIVITY_KINDS.filter((k) => k !== 'status_change' && k !== 'system')

const label = 'block text-xs font-medium text-gray-500 mb-1'

interface Props {
  engagement: BoardEngagement
  focus?: 'activity'
  actions: OpsActions
  unmatched: UnmatchedPayingCustomer[] | null
  unmatchedLoading: boolean
  onLoadUnmatched: (refresh?: boolean) => void
  onClose: () => void
}

export function EngagementPanel({ engagement: e, focus, actions, unmatched, unmatchedLoading, onLoadUnmatched, onClose }: Props) {
  const activityRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    if (focus === 'activity') activityRef.current?.scrollIntoView({ block: 'start' })
  }, [focus, e.id])

  const patch = (p: Record<string, unknown>) => actions.patchEngagement(e.id, p, p as Partial<BoardEngagement>)

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-label={`${e.displayName} details`}
        className="fixed top-0 right-0 h-full w-full sm:w-[520px] lg:w-[600px] bg-gray-900 border-l border-gray-800 z-50 flex flex-col"
      >
        {/* Header */}
        <div className="px-4 sm:px-6 pt-4 pb-3 border-b border-gray-800 shrink-0">
          <div className="flex items-start gap-2">
            <HealthDot health={e.health} className="mt-[9px]" />
            <EditableName value={e.displayName} onSave={(v) => patch({ displayName: v })} />
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] -mt-2 -mr-2 rounded-lg text-gray-400 hover:text-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <p className="pl-[18px] text-xs text-gray-500">
            source {e.source} · created {detroitDate(e.createdAt)}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-6">
          {/* Profile */}
          <section className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label} htmlFor="ops-stage">
                  Stage
                </label>
                <select
                  id="ops-stage"
                  value={e.stage}
                  onChange={(ev) => patch({ stage: ev.target.value })}
                  className={smallControl}
                >
                  {ENGAGEMENT_STAGES.map((s) => (
                    <option key={s} value={s}>
                      {STAGE_LABELS[s]}
                    </option>
                  ))}
                </select>
              </div>
              <TextField label="Trade" value={e.trade} onSave={(v) => patch({ trade: v })} />
            </div>
            <fieldset>
              <legend className={label}>Services</legend>
              <div className="flex flex-wrap gap-2">
                {SERVICE_KEYS.map((s) => {
                  const on = e.services.includes(s)
                  return (
                    <label
                      key={s}
                      className={`inline-flex items-center gap-2 px-3 min-h-[40px] rounded-lg border text-sm cursor-pointer ${
                        on ? 'border-blue-500 bg-blue-500/10 text-blue-300' : 'border-gray-800 text-gray-400'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => {
                          const next = on ? e.services.filter((x) => x !== s) : [...e.services, s]
                          patch({ services: SERVICE_KEYS.filter((k) => next.includes(k)) })
                        }}
                        className="h-4 w-4 accent-blue-500"
                      />
                      {s}
                    </label>
                  )
                })}
              </div>
              <p className="mt-1 text-xs text-gray-600">Adding a service creates its deliverables. Removing one deletes nothing.</p>
            </fieldset>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <TextField label="Contact name" value={e.contactName} onSave={(v) => patch({ contactName: v })} />
              <TextField label="Location" value={e.location} placeholder="City, ST" onSave={(v) => patch({ location: v })} />
              <TextField label="Email" type="email" value={e.email} onSave={(v) => patch({ email: v })} />
              <TextField label="Phone" type="tel" value={e.phone} onSave={(v) => patch({ phone: v })} />
            </div>
          </section>

          <StripeSection
            e={e}
            actions={actions}
            unmatched={unmatched}
            unmatchedLoading={unmatchedLoading}
            onLoadUnmatched={onLoadUnmatched}
          />

          {/* Alerts */}
          <section>
            <h3 className="text-sm font-semibold text-gray-100 mb-2">Alerts</h3>
            {e.alerts.length === 0 ? (
              <p className="text-sm text-gray-500">{e.stage === 'ignored' ? 'Ignored rows have no alerts.' : 'None.'}</p>
            ) : (
              <ul className="space-y-1.5">
                {e.alerts.map((a) => (
                  <li key={a.code} className={`rounded-md border px-3 py-2 text-sm ${ALERT_TONE[a.severity]}`}>
                    {a.message}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Deliverables */}
          <section>
            <h3 className="text-sm font-semibold text-gray-100 mb-2">Deliverables</h3>
            {e.deliverables.length === 0 ? (
              <p className="text-sm text-gray-500">None yet. Tick a service above to create them.</p>
            ) : (
              <div className="space-y-3">
                {e.deliverables.map((d) => (
                  <DeliverableCard key={d.id} engagementId={e.id} d={d} actions={actions} />
                ))}
              </div>
            )}
          </section>

          {/* Notes */}
          <section>
            <label className="text-sm font-semibold text-gray-100 mb-2 block" htmlFor="ops-notes">
              Notes
            </label>
            <NotesField value={e.notes} onSave={(v) => patch({ notes: v })} />
          </section>

          {/* Activity */}
          <section ref={activityRef} className="scroll-mt-4">
            <h3 className="text-sm font-semibold text-gray-100 mb-2">Activity</h3>
            <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
              <span>
                last contact <Age iso={e.lastContactedAt} />
              </span>
              <span>next follow-up {e.nextFollowUpAt ? new Date(e.nextFollowUpAt).toLocaleString() : 'none'}</span>
            </div>
            <ActivityLog engagementId={e.id} recent={e.activities} onError={(m) => actions.toast(m, 'error')} />
            <LogContactForm autoFocus={focus === 'activity'} onSave={(input) => actions.logActivity(e.id, input)} />
          </section>

          {/* Links */}
          <section>
            <h3 className="text-sm font-semibold text-gray-100 mb-2">Links</h3>
            <ul className="space-y-1.5 text-sm">
              <li>
                {e.business ? (
                  <span className="text-gray-300">
                    Platform account: <span className="text-gray-100">{e.business.name}</span>{' '}
                    <span className="text-gray-500">(slug {e.business.slug})</span>{' '}
                    <Link href="/admin" className="text-blue-400 hover:text-blue-300 inline-flex items-center gap-1">
                      /admin <ExternalLink className="h-3 w-3" />
                    </Link>
                  </span>
                ) : (
                  <span className="text-gray-500">No platform account linked.</span>
                )}
              </li>
              <li>
                {e.pipelinePerson ? (
                  <span className="text-gray-300">
                    Pipeline person: <span className="text-gray-100">{e.pipelinePerson.status}</span>{' '}
                    <Link href="/admin/pipeline" className="text-blue-400 hover:text-blue-300 inline-flex items-center gap-1">
                      /admin/pipeline <ExternalLink className="h-3 w-3" />
                    </Link>
                  </span>
                ) : (
                  <span className="text-gray-500">Not from the pipeline.</span>
                )}
              </li>
            </ul>
          </section>
        </div>
      </div>
    </>
  )
}

// ── Fields ──────────────────────────────────────────────────────────────────

function EditableName({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(value)
          setEditing(true)
        }}
        title="Rename"
        className="flex-1 min-w-0 text-left text-base font-semibold text-gray-100 leading-6 py-1 rounded hover:bg-gray-800/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        {value}
      </button>
    )
  }
  const commit = () => {
    setEditing(false)
    const v = draft.trim()
    if (v && v !== value) onSave(v)
  }
  return (
    <input
      autoFocus
      aria-label="Client name"
      value={draft}
      onChange={(ev) => setDraft(ev.target.value)}
      onBlur={commit}
      onKeyDown={(ev) => {
        if (ev.key === 'Enter') commit()
        if (ev.key === 'Escape') setEditing(false)
      }}
      className={`${smallControl} flex-1 text-base font-semibold`}
    />
  )
}

function TextField({
  label: text,
  value,
  onSave,
  type = 'text',
  placeholder,
}: {
  label: string
  value: string | null
  onSave: (v: string | null) => void
  type?: string
  placeholder?: string
}) {
  const [draft, setDraft] = useState(value ?? '')
  const [prev, setPrev] = useState(value)
  if (prev !== value) {
    setPrev(value)
    setDraft(value ?? '')
  }
  return (
    <label className="block">
      <span className={label}>{text}</span>
      <input
        type={type}
        value={draft}
        placeholder={placeholder}
        onChange={(ev) => setDraft(ev.target.value)}
        onBlur={() => {
          const v = draft.trim() || null
          if (v !== (value ?? null)) onSave(v)
        }}
        className={smallControl}
      />
    </label>
  )
}

function NotesField({ value, onSave }: { value: string | null; onSave: (v: string | null) => void }) {
  const [draft, setDraft] = useState(value ?? '')
  const [prev, setPrev] = useState(value)
  if (prev !== value) {
    setPrev(value)
    setDraft(value ?? '')
  }
  return (
    <textarea
      id="ops-notes"
      rows={4}
      value={draft}
      onChange={(ev) => setDraft(ev.target.value)}
      onBlur={() => {
        const v = draft.trim() || null
        if (v !== (value ?? null)) onSave(v)
      }}
      placeholder="Saves when you click away"
      className={`${smallControl} resize-y`}
    />
  )
}

// ── Stripe ──────────────────────────────────────────────────────────────────

function StripeSection({
  e,
  actions,
  unmatched,
  unmatchedLoading,
  onLoadUnmatched,
}: {
  e: BoardEngagement
  actions: OpsActions
  unmatched: UnmatchedPayingCustomer[] | null
  unmatchedLoading: boolean
  onLoadUnmatched: (refresh?: boolean) => void
}) {
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)

  const link = async (customerId: string) => {
    setPicking(false)
    setBusy(true)
    const ok = await actions.patchEngagement(e.id, { stripeCustomerId: customerId }, { stripeCustomerId: customerId })
    setBusy(false)
    if (ok) onLoadUnmatched(true)
  }
  const unlink = async () => {
    if (!window.confirm(`Unlink ${e.stripeCustomerId} from ${e.displayName}? The subscription status clears; the amounts stay.`)) return
    setBusy(true)
    await actions.patchEngagement(
      e.id,
      { stripeCustomerId: null },
      { stripeCustomerId: null, stripeSubscriptionId: null, stripeSubscriptionStatus: null, stripeSyncedAt: null }
    )
    setBusy(false)
    onLoadUnmatched(true)
  }

  return (
    <section>
      <h3 className="text-sm font-semibold text-gray-100 mb-2">Stripe</h3>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <dt className="text-gray-500">Subscription</dt>
        <dd>{e.stripeSubscriptionStatus ? <StripeStatusPill status={e.stripeSubscriptionStatus} /> : <span className="text-gray-500">—</span>}</dd>
        <dt className="text-gray-500">Monthly</dt>
        <dd className="tabular-nums text-gray-200">
          {money(e.monthlyAmount)}
          {e.monthlyStartedAt && <span className="ml-2 text-xs text-gray-500">since {detroitDate(e.monthlyStartedAt)}</span>}
        </dd>
        <dt className="text-gray-500">Upfront</dt>
        <dd className="tabular-nums text-gray-200">
          {money(e.upfrontAmount)}
          {e.upfrontPaidAt && <span className="ml-2 text-xs text-gray-500">paid {detroitDate(e.upfrontPaidAt)}</span>}
        </dd>
        <dt className="text-gray-500">Customer</dt>
        <dd className="min-w-0">
          {e.stripeCustomerId ? (
            <a
              href={`https://dashboard.stripe.com/customers/${e.stripeCustomerId}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 font-mono text-xs break-all"
            >
              {e.stripeCustomerId} <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
          ) : (
            <span className="text-gray-500">not linked</span>
          )}
        </dd>
        <dt className="text-gray-500">Synced</dt>
        <dd className="text-gray-400">
          <Age iso={e.stripeSyncedAt} />
        </dd>
      </dl>
      <div className="mt-3 flex gap-2">
        {e.stripeCustomerId ? (
          <button type="button" disabled={busy} onClick={unlink} className={smallButton}>
            Unlink
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setPicking((p) => !p)
              if (unmatched === null) onLoadUnmatched()
            }}
            className={smallButton}
          >
            Link Stripe customer
          </button>
        )}
      </div>
      {picking && (
        <StripeCustomerPicker customers={unmatched} loading={unmatchedLoading} onPick={link} onCancel={() => setPicking(false)} />
      )}
    </section>
  )
}

// ── Deliverables ────────────────────────────────────────────────────────────

function DeliverableCard({ engagementId, d, actions }: { engagementId: string; d: BoardDeliverable; actions: OpsActions }) {
  const type = d.type as DeliverableType
  const editable = EVIDENCE_FIELDS_FOR_TYPE[type] ?? []
  const syncKeys = SYNC_EVIDENCE_FOR_TYPE[type] ?? []
  const save = (p: Record<string, unknown>, optimistic: Partial<BoardDeliverable>) =>
    actions.patchDeliverable(engagementId, d.id, p, optimistic)

  /** The step fields a change implies, for the optimistic board update. */
  const stepView = (key: string | null): Partial<BoardDeliverable> => {
    const st = stepFor(type, key)
    return {
      step: key,
      stepLabel: st?.label ?? null,
      stepOwner: st?.owner ?? null,
      stepTerminal: st?.terminal ?? false,
      waitingOn: defaultWaitingOn(type, key),
      stepUpdatedAt: new Date().toISOString(),
      effectiveStatus: effectiveStatusOf({ type, manualStatus: d.manualStatus, computedStatus: d.computedStatus, step: key }),
    }
  }
  const groups = (['jacob', 'client', 'vendor', 'done'] as const).map((g) => ({
    g,
    steps: (STEP_CATALOG[type] ?? []).filter((st) =>
      g === 'done' ? st.terminal || st.owner === 'none' : !st.terminal && st.owner === g
    ),
  }))

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-950 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-2 min-w-0">
          <DeliverableChip type={type} status={d.effectiveStatus} manual={Boolean(d.manualStatus)} view={d} />
          <span className="text-sm font-medium text-gray-100 capitalize">{d.type}</span>
          <StepChip d={d} />
        </span>
        <span className="text-xs text-gray-600 shrink-0">computed: {d.computedStatus}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="block">
          <span className={label}>Step</span>
          <select
            value={d.step ?? ''}
            onChange={(ev) => {
              const key = ev.target.value || null
              save({ step: key }, stepView(key))
            }}
            className={smallControl}
          >
            <option value="">No step set</option>
            {groups.map(({ g, steps }) =>
              steps.length === 0 ? null : (
                <optgroup key={g} label={g === 'done' ? 'Done' : OWNER_LABELS[g]}>
                  {steps.map((st) => (
                    <option key={st.key} value={st.key}>
                      {st.label}
                    </option>
                  ))}
                </optgroup>
              )
            )}
          </select>
          <span className="mt-1 block text-xs text-gray-500">
            {d.waitingOn ? `Waiting on ${OWNER_LABELS[d.waitingOn]?.toLowerCase() ?? d.waitingOn}` : 'Waiting on nobody'}
            {d.stepUpdatedAt && (
              <>
                {' · '}
                <Age iso={d.stepUpdatedAt} />
              </>
            )}
          </span>
        </label>
        <BlurInput
          label="Waiting note"
          value={d.waitingNote}
          placeholder="phone plan change, ~2 weeks"
          onSave={(v) => save({ waitingNote: v }, { waitingNote: v })}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="block">
          <span className={label}>Manual status</span>
          <select
            value={d.manualStatus ?? ''}
            onChange={(ev) => {
              const v = ev.target.value || null
              save(
                { manualStatus: v },
                {
                  manualStatus: v,
                  effectiveStatus: effectiveStatusOf({ type, manualStatus: v, computedStatus: d.computedStatus, step: d.step }),
                }
              )
            }}
            className={smallControl}
          >
            <option value="">None (use step / computed)</option>
            {DELIVERABLE_STATUSES.filter((s) => s !== 'unknown').map((s) => (
              <option key={s} value={s}>
                {DELIVERABLE_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <BlurInput
          label="Reason"
          value={d.manualStatusNote}
          placeholder="domain not switched yet"
          onSave={(v) => save({ manualStatusNote: v }, { manualStatusNote: v })}
        />
      </div>

      {(editable.length > 0 || syncKeys.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {editable.map((k) => (
            <BlurInput
              key={k}
              label={k}
              value={typeof d.evidence[k] === 'string' ? (d.evidence[k] as string) : null}
              onSave={(v) => save({ evidence: { [k]: v } }, { evidence: { ...d.evidence, ...(v === null ? {} : { [k]: v }) } })}
            />
          ))}
          {syncKeys.map((k) => (
            <div key={k}>
              <span className={label}>{k} (from sync)</span>
              <p className="text-sm text-gray-300 font-mono py-1.5">
                {k === 'telnyxNumber' && typeof d.evidence[k] === 'string'
                  ? formatPhoneNumber(d.evidence[k] as string)
                  : String(d.evidence[k] ?? '—')}
              </p>
            </div>
          ))}
        </div>
      )}

      {d.checks.length > 0 ? (
        <ul className="divide-y divide-gray-800 border-t border-gray-800">
          {d.checks.map((c) => (
            <li key={c.key} className="flex items-start justify-between gap-2 py-1.5 text-xs">
              <span className="min-w-0">
                <span className="font-mono text-gray-300">{c.key}</span>
                {c.detail && <span className="block text-gray-500 break-words">{c.detail}</span>}
              </span>
              <span className="shrink-0 flex items-center gap-2">
                <span className={c.passed === null ? 'text-gray-500' : c.passed ? 'text-emerald-400' : 'text-red-400'}>
                  {c.passed === null ? 'could not run' : c.passed ? 'pass' : 'fail'}
                </span>
                <Age iso={c.lastRunAt} className="text-gray-600" />
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-gray-600 border-t border-gray-800 pt-2">No automated checks for this type yet.</p>
      )}
    </div>
  )
}

function BlurInput({
  label: text,
  value,
  onSave,
  placeholder,
}: {
  label: string
  value: string | null
  onSave: (v: string | null) => void
  placeholder?: string
}) {
  const [draft, setDraft] = useState(value ?? '')
  const [prev, setPrev] = useState(value)
  if (prev !== value) {
    setPrev(value)
    setDraft(value ?? '')
  }
  return (
    <label className="block">
      <span className={label}>{text}</span>
      <input
        value={draft}
        placeholder={placeholder}
        onChange={(ev) => setDraft(ev.target.value)}
        onBlur={() => {
          const v = draft.trim() || null
          if (v !== (value ?? null)) onSave(v)
        }}
        className={smallControl}
      />
    </label>
  )
}

// ── Activity log ────────────────────────────────────────────────────────────

/**
 * The board's last 5 entries, or the full log once "Show all" has loaded it.
 * The full list is dropped as soon as the board brings a newer entry, so a
 * contact logged after loading is never hidden behind a stale list.
 */
function ActivityLog({
  engagementId,
  recent,
  onError,
}: {
  engagementId: string
  recent: BoardActivity[]
  onError: (message: string) => void
}) {
  const [full, setFull] = useState<{ newestId: string | null; rows: BoardActivity[] } | null>(null)
  const [loading, setLoading] = useState(false)
  const newestId = recent[0]?.id ?? null
  const rows = full && full.newestId === newestId ? full.rows : recent
  const showingAll = rows !== recent

  const loadAll = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/ops/engagements/${engagementId}/activities`, { cache: 'no-store' })
      const data = (await res.json()) as { activities?: BoardActivity[]; error?: string }
      if (!res.ok || !data.activities) throw new Error(data.error ?? 'Could not load the activity log')
      setFull({ newestId, rows: data.activities })
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not load the activity log')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mb-3">
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">Nothing logged yet.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((a) => (
            <li key={a.id} className="rounded-md border border-gray-800 bg-gray-950 px-3 py-2">
              <div className="flex items-center justify-between gap-2 text-xs text-gray-500">
                <span className="uppercase tracking-wide">{a.kind.replace('_', ' ')}</span>
                <Age iso={a.createdAt} />
              </div>
              <p className="mt-1 text-sm text-gray-200 whitespace-pre-wrap">{a.body}</p>
              {a.followUpAt && <p className="mt-1 text-xs text-gray-500">follow-up {new Date(a.followUpAt).toLocaleString()}</p>}
            </li>
          ))}
        </ul>
      )}
      {!showingAll && recent.length >= 5 && (
        <button type="button" onClick={loadAll} disabled={loading} className={`${smallButton} mt-2`}>
          {loading ? 'Loading…' : 'Show all'}
        </button>
      )}
      {showingAll && <p className="mt-2 text-xs text-gray-600">Showing all {rows.length} entries.</p>}
    </div>
  )
}

// ── Log contact ─────────────────────────────────────────────────────────────

function LogContactForm({
  autoFocus,
  onSave,
}: {
  autoFocus: boolean
  onSave: (input: { kind: string; body: string; followUpAt?: string | null }) => Promise<boolean>
}) {
  const [kind, setKind] = useState<string>('call')
  const [body, setBody] = useState('')
  const [followUp, setFollowUp] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault()
    if (!body.trim() && !followUp) return
    setSaving(true)
    const ok = await onSave({ kind, body: body.trim(), followUpAt: followUp ? new Date(followUp).toISOString() : null })
    setSaving(false)
    if (ok) {
      setBody('')
      setFollowUp('')
    }
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-gray-800 p-3 space-y-2">
      <p className="text-xs font-medium text-gray-400">Log contact</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <select aria-label="Kind" value={kind} onChange={(ev) => setKind(ev.target.value)} className={smallControl}>
          {LOG_KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <input
          type="datetime-local"
          aria-label="Next follow-up"
          value={followUp}
          min={toLocalInput(new Date().toISOString())}
          onChange={(ev) => setFollowUp(ev.target.value)}
          className={smallControl}
        />
      </div>
      <textarea
        autoFocus={autoFocus}
        aria-label="What happened"
        rows={2}
        value={body}
        onChange={(ev) => setBody(ev.target.value)}
        placeholder="What happened (optional when only scheduling a follow-up)"
        className={`${smallControl} resize-y`}
      />
      <button type="submit" disabled={saving || (!body.trim() && !followUp)} className={smallButton}>
        {saving ? 'Saving…' : 'Save'}
      </button>
    </form>
  )
}
