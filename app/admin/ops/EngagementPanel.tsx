'use client'

// Right-side detail panel for one engagement, same shell as
// app/admin/ClientDetailPanel. Top to bottom: header fields, Stripe, alerts,
// deliverables, the client's timeline, notes, activity, links. Every field saves on its own
// (change for selects and checkboxes, blur for text) through OpsActions,
// which updates the board optimistically and reverts on failure.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ExternalLink, X } from 'lucide-react'
import type { BoardActivity, BoardDeliverable, BoardEngagement } from '@/lib/ops/board'
import type { UnmatchedPayingCustomer } from '@/lib/ops/sync'
import { DELIVERABLE_STATUSES, ENGAGEMENT_STAGES, OPS_ACTIVITY_KINDS, SERVICE_KEYS, type DeliverableType } from '@/lib/ops/types'
import { EVIDENCE_FIELDS_FOR_TYPE, SYNC_EVIDENCE_FOR_TYPE } from '@/lib/ops/evidence'
import { derivedStatusLine } from '@/lib/ops/client-status'
import { STEP_CATALOG, defaultWaitingOn, effectiveStatusOf, stepFor } from '@/lib/ops/steps'
import { RUN_KINDS, defaultRepoName, type RunKind } from '@/lib/ops/agents/names'
import { formatPhoneNumber } from '@/lib/utils'
import { Age, HealthDot } from '../ui'
import { Timeline } from './Timeline'
import { StripeCustomerPicker } from './Pickers'
import {
  ALERT_TONE,
  AmountInput,
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
/** status has its own input at the top of the panel. */
const LOG_KINDS = OPS_ACTIVITY_KINDS.filter((k) => k !== 'status_change' && k !== 'system' && k !== 'status')

const label = 'block text-xs font-medium text-gray-500 mb-1'

interface Props {
  engagement: BoardEngagement
  focus?: 'activity'
  actions: OpsActions
  unmatched: UnmatchedPayingCustomer[] | null
  unmatchedLoading: boolean
  onLoadUnmatched: (refresh?: boolean) => void
  onClose: () => void
  /** Refetch the board after an agent action wrote to it. */
  onRefresh: () => Promise<void>
}

export function EngagementPanel({ engagement: e, focus, actions, unmatched, unmatchedLoading, onLoadUnmatched, onClose, onRefresh }: Props) {
  const activityRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      // A run feed opened from Jobs closes first on its own Escape.
      if (ev.key === 'Escape' && !document.querySelector('[aria-label="Run feed"]')) onClose()
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
          <StatusLineField e={e} onSave={(body) => actions.logActivity(e.id, { kind: 'status', body })} />

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

          {e.business && <PlatformAccountSection e={e} actions={actions} onRefresh={onRefresh} />}

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
                  <DeliverableCard
                    key={d.id}
                    engagementId={e.id}
                    displayName={e.displayName}
                    d={d}
                    actions={actions}
                    onRefresh={onRefresh}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Everything that happened for this client (read only) */}
          <Timeline engagementId={e.id} />

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

// ── Platform account ────────────────────────────────────────────────────────

/**
 * The linked Business's Telnyx number, forwarding number and Google Ads id,
 * edited in place through PATCH /api/admin/businesses/[id] (the admin page's
 * own validation and phone normalisation). Jacob's own edits apply at once;
 * only the chief's routing changes wait for Push.
 */
function PlatformAccountSection({ e, actions, onRefresh }: { e: BoardEngagement; actions: OpsActions; onRefresh: () => Promise<void> }) {
  const b = e.business!
  const save = async (field: string, value: string | null) => {
    try {
      const res = await fetch(`/api/admin/businesses/${b.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(data.error ?? 'Could not save'))
      actions.toast('Saved', 'success')
    } catch (err) {
      actions.toast(err instanceof Error ? err.message : 'Could not save', 'error')
    }
    await onRefresh()
  }
  return (
    <section>
      <h3 className="text-sm font-semibold text-gray-100 mb-2">
        Platform account <span className="font-normal text-gray-500">{b.slug}</span>
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <TextField label="Telnyx number" type="tel" value={b.telnyxPhoneNumber} placeholder="+1…" onSave={(v) => save('telnyxPhoneNumber', v)} />
        <TextField label="Forwarding number" type="tel" value={b.forwardingNumber} placeholder="Owner's phone" onSave={(v) => save('forwardingNumber', v)} />
        <TextField label="Google Ads customer id" value={b.googleAdsCustomerId} placeholder="10 digits" onSave={(v) => save('googleAdsCustomerId', v ? v.replace(/\D/g, '') : null)} />
        <div>
          <span className={label}>Platform status</span>
          <p className="text-sm text-gray-300 min-h-[36px] flex items-center">{b.subscriptionStatus}</p>
        </div>
      </div>
    </section>
  )
}

// ── Status line ─────────────────────────────────────────────────────────────

/**
 * The client's one-sentence current status (the card's status line). Saving
 * logs a 'status' activity; the newest one wins. Empty shows the derived line
 * from the oldest open step as a placeholder.
 */
function StatusLineField({ e, onSave }: { e: BoardEngagement; onSave: (body: string) => Promise<boolean> }) {
  const [draft, setDraft] = useState(e.statusLine ?? '')
  const [prev, setPrev] = useState(e.statusLine)
  if (prev !== e.statusLine) {
    setPrev(e.statusLine)
    setDraft(e.statusLine ?? '')
  }
  const commit = async () => {
    const v = draft.trim()
    if (!v || v === (e.statusLine ?? '')) return
    await onSave(v)
  }
  return (
    <section>
      <label htmlFor="ops-status-line" className="text-sm font-semibold text-gray-100 mb-2 block">
        Status
      </label>
      <input
        id="ops-status-line"
        value={draft}
        maxLength={300}
        placeholder={derivedStatusLine(e)}
        onChange={(ev) => setDraft(ev.target.value)}
        onBlur={commit}
        onKeyDown={(ev) => ev.key === 'Enter' && (ev.currentTarget as HTMLInputElement).blur()}
        className={`${smallControl} min-h-[44px] placeholder:text-gray-600`}
      />
      <p className="mt-1 text-xs text-gray-600">
        {e.statusAt ? <>Set <Age iso={e.statusAt} />. </> : 'Not set; the card shows the line above in grey. '}
        Saves when you press Enter or click away.
      </p>
    </section>
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
          <AmountInput
            value={e.monthlyAmount}
            label={`Monthly amount for ${e.displayName}`}
            onSave={(v) => actions.patchEngagement(e.id, { monthlyAmount: v }, { monthlyAmount: v })}
          />
          {e.monthlyStartedAt && <span className="ml-2 text-xs text-gray-500">since {detroitDate(e.monthlyStartedAt)}</span>}
        </dd>
        <dt className="text-gray-500">Upfront</dt>
        <dd className="tabular-nums text-gray-200">
          <AmountInput
            value={e.upfrontAmount}
            label={`Upfront amount for ${e.displayName}`}
            onSave={(v) => actions.patchEngagement(e.id, { upfrontAmount: v }, { upfrontAmount: v })}
          />
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

function DeliverableCard({
  engagementId,
  displayName,
  d,
  actions,
  onRefresh,
}: {
  engagementId: string
  displayName: string
  d: BoardDeliverable
  actions: OpsActions
  onRefresh: () => Promise<void>
}) {
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

      {d.type === 'website' && (
        <WebsiteAgent engagementId={engagementId} displayName={displayName} d={d} toast={actions.toast} onRefresh={onRefresh} />
      )}
    </div>
  )
}

// ── Web designer agent (website deliverable only) ───────────────────────────
// Provision (no repo yet), Run agent (repo exists), Sync workflow (repo lacks
// aa-build.yml). Every write runs dry first: the dry result is shown, and the
// real call needs a second, confirmed click.

type PlanStep = { action: string; detail: string; result?: string; error?: string }

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    return { ok: res.ok, status: res.status, data: ((await res.json().catch(() => ({}))) as Record<string, unknown>) ?? {} }
  } catch {
    return { ok: false, status: 0, data: { error: 'Network error' } }
  }
}

function WebsiteAgent({
  engagementId,
  displayName,
  d,
  toast,
  onRefresh,
}: {
  engagementId: string
  displayName: string
  d: BoardDeliverable
  toast: OpsActions['toast']
  onRefresh: () => Promise<void>
}) {
  const repoUrl = typeof d.evidence.repoUrl === 'string' ? d.evidence.repoUrl : null
  return (
    <div className="border-t border-gray-800 pt-3 space-y-3">
      <p className="text-xs font-medium text-gray-400">Web designer agent</p>
      {!repoUrl ? (
        <ProvisionForm engagementId={engagementId} displayName={displayName} toast={toast} onRefresh={onRefresh} />
      ) : (
        <>
          <RunAgentForm engagementId={engagementId} repoUrl={repoUrl} toast={toast} onRefresh={onRefresh} />
          {d.evidence.repoHasWorkflow === false && <SyncWorkflowButton engagementId={engagementId} toast={toast} onRefresh={onRefresh} />}
        </>
      )}
    </div>
  )
}

function PlanList({ steps, blocked }: { steps: PlanStep[]; blocked: string[] }) {
  return (
    <div className="space-y-1 text-xs">
      {blocked.map((b) => (
        <p key={b} className="text-red-300">
          Blocked: {b}
        </p>
      ))}
      <ol className="list-decimal pl-5 space-y-0.5 text-gray-300">
        {steps.map((s, i) => (
          <li key={i}>
            <span className="text-gray-100">{s.action}</span> · {s.detail}
            {s.result && <span className="text-emerald-300"> ✓ {s.result}</span>}
            {s.error && <span className="text-red-300"> ✗ {s.error}</span>}
          </li>
        ))}
      </ol>
    </div>
  )
}

function ProvisionForm({
  engagementId,
  displayName,
  toast,
  onRefresh,
}: {
  engagementId: string
  displayName: string
  toast: OpsActions['toast']
  onRefresh: () => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [repoName, setRepoName] = useState(defaultRepoName(displayName))
  const [plan, setPlan] = useState<{ steps: PlanStep[]; blocked: string[]; dry: boolean } | null>(null)
  const [busy, setBusy] = useState(false)

  const call = async (dry: boolean) => {
    setBusy(true)
    const r = await postJson(`/api/admin/ops/engagements/${engagementId}/provision`, { repoName, dry })
    setBusy(false)
    const steps = (r.data.steps as PlanStep[]) ?? []
    const blocked = (r.data.blocked as string[]) ?? (r.data.error ? [String(r.data.error)] : [])
    setPlan({ steps, blocked, dry })
    if (!dry) {
      toast(r.ok ? 'Site provisioned' : 'Provisioning stopped; see the steps', r.ok ? 'success' : 'error')
      await onRefresh()
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={smallButton}>
        Provision site
      </button>
    )
  }
  return (
    <div className="rounded-md border border-gray-800 p-2 space-y-2">
      <label className="block">
        <span className={label}>Repo name (private, from AA-Template)</span>
        <input
          value={repoName}
          onChange={(ev) => {
            setRepoName(ev.target.value)
            setPlan(null)
          }}
          className={smallControl}
        />
      </label>
      {plan && <PlanList steps={plan.steps} blocked={plan.blocked} />}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy || !repoName.trim()} onClick={() => call(true)} className={smallButton}>
          {busy && !plan ? 'Checking…' : 'Preview (dry run)'}
        </button>
        <button
          type="button"
          disabled={busy || !plan || !plan.dry || plan.blocked.length > 0}
          onClick={() => {
            if (window.confirm(`Create the private repo ${repoName}, set its secrets and create the Vercel project?`)) void call(false)
          }}
          className={`${smallButton} border-blue-600 text-blue-200`}
        >
          {busy && plan ? 'Creating…' : 'Create'}
        </button>
        <button type="button" disabled={busy} onClick={() => { setOpen(false); setPlan(null) }} className={smallButton}>
          Cancel
        </button>
      </div>
    </div>
  )
}

const RUN_KIND_LABELS: Record<RunKind, string> = {
  site_build: 'Build the site (brief)',
  site_update: 'Update the site (instructions)',
  go_live: 'Go live (make indexable)',
}

function RunAgentForm({
  engagementId,
  repoUrl,
  toast,
  onRefresh,
}: {
  engagementId: string
  repoUrl: string
  toast: OpsActions['toast']
  onRefresh: () => Promise<void>
}) {
  const [kind, setKind] = useState<RunKind>('site_update')
  const [text, setText] = useState('')
  const [preview, setPreview] = useState<{ blocked: string[]; payload: Record<string, unknown> | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const needsText = kind !== 'go_live'

  const body = (dry: boolean) => ({
    kind,
    ...(kind === 'site_build' ? { brief: text } : {}),
    ...(kind === 'site_update' ? { instructions: text } : {}),
    dry,
  })
  const run = async (dry: boolean) => {
    setBusy(true)
    const r = await postJson(`/api/admin/ops/engagements/${engagementId}/runs`, body(dry))
    setBusy(false)
    const blocked = (r.data.blocked as string[]) ?? (r.data.error ? [String(r.data.error)] : [])
    if (dry) {
      setPreview({ blocked, payload: (r.data.payload as Record<string, unknown>) ?? null })
      return
    }
    setPreview(null)
    if (r.ok) {
      toast(`Agent ${kind} dispatched`, 'success')
      setText('')
    } else toast(String(r.data.error ?? blocked.join('; ') ?? 'Dispatch failed'), 'error')
    await onRefresh()
  }

  return (
    <div className="rounded-md border border-gray-800 p-2 space-y-2">
      <p className="text-xs text-gray-500 break-all">Repo: {repoUrl.replace(/^https:\/\/github\.com\//, '')}</p>
      <select
        aria-label="Run kind"
        value={kind}
        onChange={(ev) => {
          setKind(ev.target.value as RunKind)
          setPreview(null)
        }}
        className={smallControl}
      >
        {RUN_KINDS.map((k) => (
          <option key={k} value={k}>
            {RUN_KIND_LABELS[k]}
          </option>
        ))}
      </select>
      {needsText && (
        <textarea
          aria-label={kind === 'site_build' ? 'Brief' : 'Instructions'}
          rows={5}
          value={text}
          onChange={(ev) => {
            setText(ev.target.value)
            setPreview(null)
          }}
          placeholder={kind === 'site_build' ? 'BRIEF.md: business, services, areas, voice, photos…' : 'INSTRUCTIONS.md: the scoped change to make'}
          className={`${smallControl} resize-y font-mono text-xs`}
        />
      )}
      {preview && (
        <div className="text-xs space-y-1">
          {preview.blocked.map((b) => (
            <p key={b} className="text-red-300">
              Blocked: {b}
            </p>
          ))}
          {preview.payload && (
            <pre className="whitespace-pre-wrap break-all rounded bg-gray-900 p-2 text-gray-300">{JSON.stringify(preview.payload, null, 2)}</pre>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy || (needsText && !text.trim())} onClick={() => run(true)} className={smallButton}>
          Preview (dry run)
        </button>
        <button
          type="button"
          disabled={busy || !preview || preview.blocked.length > 0}
          onClick={() => {
            if (window.confirm(`Dispatch ${kind} to ${repoUrl}? The workflow opens a PR for review.`)) void run(false)
          }}
          className={`${smallButton} border-blue-600 text-blue-200`}
        >
          {busy ? 'Working…' : 'Dispatch'}
        </button>
      </div>
    </div>
  )
}

function SyncWorkflowButton({
  engagementId,
  toast,
  onRefresh,
}: {
  engagementId: string
  toast: OpsActions['toast']
  onRefresh: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const sync = async () => {
    setBusy(true)
    const dry = await postJson('/api/admin/ops/agents/sync-workflow', { mode: 'pr', only: [engagementId], dry: true })
    const blocked = (dry.data.blocked as string[]) ?? []
    const repo = ((dry.data.repos as { repo: string; adds: string[] }[]) ?? [])[0]
    if (!dry.ok || blocked.length > 0 || !repo) {
      setBusy(false)
      toast(blocked.join('; ') || String(dry.data.error ?? 'Nothing to sync for this client'), 'error')
      return
    }
    if (!window.confirm(`Open a PR on ${repo.repo} adding:\n- ${repo.adds.join('\n- ')}`)) {
      setBusy(false)
      return
    }
    const live = await postJson('/api/admin/ops/agents/sync-workflow', { mode: 'pr', only: [engagementId], dry: false })
    setBusy(false)
    const result = ((live.data.repos as { prUrl?: string; errors: string[] }[]) ?? [])[0]
    if (live.ok && result && result.errors.length === 0) toast(result.prUrl ? `PR opened: ${result.prUrl}` : 'Workflow synced', 'success')
    else toast(result?.errors.join('; ') || String(live.data.error ?? 'Workflow sync failed'), 'error')
    await onRefresh()
  }
  return (
    <button type="button" disabled={busy} onClick={sync} className={smallButton}>
      {busy ? 'Syncing workflow…' : 'Sync workflow (PR)'}
    </button>
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
