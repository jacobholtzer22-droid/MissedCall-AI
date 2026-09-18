'use client'

// ===========================================
// /admin/pipeline — every funnel person, booked or not
// ===========================================
// One card per PERSON (all their leads and bookings, joined on phone), so a
// verified lead who never booked is as trackable as someone who did. Two axes:
//   stage  — where they got to (derived): lead only / booked / showed / no-show / cancelled
//   status — the outcome call (stored):   pending / working / won / lost / not a fit / junk
//
// Built for a phone between calls: one tap for showed / no-show / cancelled on
// the live booking, one tap for status, and Log contact stamps the time and
// takes a note in the same step. Default order: who needs follow-up, soonest
// first (lib/pipeline.ts sortPipeline).
//
// Writes go to /api/admin/pipeline only, which touches PipelinePerson,
// PipelineNote and Appointment.showStatus, nothing the funnel reads.
// Every dollar figure is behind the same adminShowRevenue toggle as /admin.

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Eye, EyeOff, RefreshCw } from 'lucide-react'
import {
  FOLLOW_UP_STALE_DAYS,
  NO_SURFACE,
  NO_TERM,
  UNKNOWN_SURFACE,
  SHOW_LABELS,
  SHOW_STATUSES,
  STAGES,
  STAGE_LABELS,
  STATUSES,
  STATUS_LABELS,
  effectiveShow,
  followUpState,
  isOpenStatus,
  primaryBooking,
  rollupRoi,
  sortPipeline,
  stageOf,
  surfaceKey,
  surfaceOf,
  type PipelineBooking,
  type PipelinePerson,
  type RoiRow,
  type ShowStatus,
  type Stage,
  type Status,
} from '@/lib/pipeline'
import { formatPhoneNumber } from '@/lib/utils'
import { formatAge } from '../ui'

const REVENUE_COOKIE = 'adminShowRevenue'
const FOCUS = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500'

type Patch = Partial<
  Pick<PipelinePerson, 'status' | 'lostReason' | 'closedAt' | 'mrr' | 'setupFee' | 'lastContactedAt' | 'nextFollowUpAt'>
>
type NotePayload = { body: string; logContact: boolean; nextFollowUpAt?: string | null }

type Actions = {
  patch: (key: string, p: Patch) => Promise<boolean>
  note: (key: string, p: NotePayload) => Promise<boolean>
  show: (key: string, bookingId: string, s: ShowStatus) => Promise<boolean>
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

function fmtDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fmtStamp(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function money(n: number): string {
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

function pct(n: number | null): string {
  return n === null ? '–' : `${Math.round(n * 100)}%`
}

/** "3d ago", "just now". */
function ago(ms: number, now: number): string {
  const a = formatAge(new Date(ms).toISOString(), now)
  return a === 'now' ? 'just now' : `${a} ago`
}

const pad = (n: number) => String(n).padStart(2, '0')

/** ISO → value for <input type="datetime-local">, in the phone's own zone. */
function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromLocalInput(v: string): string | null {
  if (!v) return null
  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

function toDateInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Noon local, so a date never slides a day when shown in another zone. */
function fromDateInput(v: string): string | null {
  if (!v) return null
  const d = new Date(`${v}T12:00`)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

/** 10:00 AM local, N days from today. */
function daysFromNow(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  d.setHours(10, 0, 0, 0)
  return d.toISOString()
}

const SURFACE_LABELS: Record<string, string> = { landing: 'Landing', watch: 'Watch', calendar: 'Texted link' }

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

const TONE = {
  blue: 'bg-blue-500/15 text-blue-300 border-blue-500/50',
  green: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/50',
  red: 'bg-red-500/15 text-red-300 border-red-500/50',
  amber: 'bg-amber-500/15 text-amber-300 border-amber-500/50',
  gray: 'bg-gray-700 text-gray-100 border-gray-500',
} as const

const ACTIVE_TONE: Record<string, string> = {
  pending: TONE.blue,
  working: TONE.blue,
  showed: TONE.green,
  won: TONE.green,
  no_show: TONE.red,
  lost: TONE.red,
  cancelled: TONE.amber,
  not_a_fit: TONE.gray,
  junk: TONE.gray,
}

const STAGE_PILL: Record<Stage, string> = {
  lead_only: 'bg-gray-800 text-gray-200',
  booked: 'bg-blue-500/15 text-blue-300',
  showed: 'bg-emerald-500/15 text-emerald-300',
  no_show: 'bg-red-500/15 text-red-300',
  cancelled: 'bg-amber-500/15 text-amber-300',
}

function Segmented<T extends string>({
  label,
  options,
  labels,
  value,
  onChange,
}: {
  label: string
  options: readonly T[]
  labels: Record<T, string>
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const active = o === value
        return (
          <button
            key={o}
            type="button"
            aria-pressed={active}
            onClick={() => !active && onChange(o)}
            className={`min-h-[44px] shrink-0 whitespace-nowrap rounded-lg border px-3 text-sm font-medium ${FOCUS} ${
              active ? ACTIVE_TONE[o] : 'border-gray-800 bg-gray-950 text-gray-400 hover:text-gray-100'
            }`}
          >
            {labels[o]}
          </button>
        )
      })}
    </div>
  )
}

function Pill({ children, className = 'bg-gray-800 text-gray-300' }: { children: React.ReactNode; className?: string }) {
  return <span className={`inline-flex max-w-full items-center truncate rounded-full px-2.5 py-0.5 text-xs ${className}`}>{children}</span>
}
const PILL_MUTED = 'bg-gray-800/60 text-gray-500'
const PILL_AMBER = 'bg-amber-500/15 text-amber-300'

const inputCls = `w-full min-h-[44px] rounded-lg border border-gray-800 bg-gray-950 px-3 text-sm text-gray-100 placeholder:text-gray-600 ${FOCUS}`
const btnPrimary = `min-h-[44px] rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50 ${FOCUS}`
const btnGhost = `min-h-[44px] rounded-lg border border-gray-800 px-4 text-sm text-gray-300 hover:text-gray-100 hover:border-gray-700 disabled:opacity-50 ${FOCUS}`

// ---------------------------------------------------------------------------
// Log contact
// ---------------------------------------------------------------------------

const NEXT_CHOICES = [
  { key: 'keep', label: 'Keep as is' },
  { key: 'none', label: 'None' },
  { key: '1', label: 'Tomorrow' },
  { key: '3', label: 'In 3 days' },
  { key: '7', label: 'In a week' },
] as const
type NextChoice = (typeof NEXT_CHOICES)[number]['key']

function LogContactForm({ onSave, onCancel }: { onSave: (p: NotePayload) => Promise<boolean>; onCancel: () => void }) {
  const [text, setText] = useState('')
  const [next, setNext] = useState<NextChoice>('keep')
  const [busy, setBusy] = useState(false)

  const save = async () => {
    setBusy(true)
    const payload: NotePayload = { body: text, logContact: true }
    if (next === 'none') payload.nextFollowUpAt = null
    else if (next !== 'keep') payload.nextFollowUpAt = daysFromNow(Number(next))
    const ok = await onSave(payload)
    setBusy(false)
    if (ok) onCancel()
  }

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-gray-800 bg-gray-950 p-3">
      <textarea
        autoFocus
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="What happened? Optional."
        className={`${inputCls} py-2`}
      />
      <div>
        <div className="mb-1.5 text-sm text-gray-400">Next follow-up</div>
        <div className="flex flex-wrap gap-1.5">
          {NEXT_CHOICES.map((c) => (
            <button
              key={c.key}
              type="button"
              aria-pressed={next === c.key}
              onClick={() => setNext(c.key)}
              className={`min-h-[44px] rounded-lg border px-3 text-sm ${FOCUS} ${
                next === c.key ? TONE.blue : 'border-gray-800 text-gray-400 hover:text-gray-100'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={() => void save()} disabled={busy} className={btnPrimary}>
          {busy ? 'Saving' : 'Log contact now'}
        </button>
        <button type="button" onClick={onCancel} disabled={busy} className={btnGhost}>
          Cancel
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Details: every field editable (the backfill), every booking, the notes log
// ---------------------------------------------------------------------------

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-gray-400">{label}</span>
      {children}
    </label>
  )
}

function BookingLine({ b, now, onShow }: { b: PipelineBooking; now: number; onShow: (s: ShowStatus) => void }) {
  const upcoming = Date.parse(b.scheduledAt) > now
  return (
    <li className="space-y-2 rounded-lg border border-gray-800 p-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="tabular-nums text-gray-200">{fmtWhen(b.scheduledAt)}</span>
        <span className="text-gray-500">{upcoming ? 'Upcoming' : 'Past'}</span>
        {b.bookingSurface && <Pill>{SURFACE_LABELS[b.bookingSurface] ?? b.bookingSurface}</Pill>}
        {b.calendarStatus === 'cancelled' && <Pill className={PILL_AMBER}>Calendar cancelled</Pill>}
      </div>
      <Segmented<ShowStatus> label="Showed" options={SHOW_STATUSES} labels={SHOW_LABELS} value={effectiveShow(b)} onChange={onShow} />
    </li>
  )
}

function DetailsForm({
  person,
  now,
  showRevenue,
  actions,
}: {
  person: PipelinePerson
  now: number
  showRevenue: boolean
  actions: Actions
}) {
  const initial = useMemo(
    () => ({
      lostReason: person.lostReason ?? '',
      closedAt: toDateInput(person.closedAt),
      mrr: person.mrr === null ? '' : String(person.mrr),
      setupFee: person.setupFee === null ? '' : String(person.setupFee),
      lastContactedAt: toLocalInput(person.lastContactedAt),
      nextFollowUpAt: toLocalInput(person.nextFollowUpAt),
    }),
    [person]
  )
  const [form, setForm] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [noteBusy, setNoteBusy] = useState(false)

  // A save or a tap elsewhere on the card refreshes the person. Take the new
  // values, except in fields already being edited: tapping Closed won opens
  // this form while the save is still in flight, and its response must not
  // wipe an MRR typed in the meantime.
  const prevInitial = useRef(initial)
  useEffect(() => {
    const prev = prevInitial.current
    prevInitial.current = initial
    setForm((f) => {
      const out = { ...f }
      for (const k of Object.keys(initial) as (keyof typeof initial)[]) if (f[k] === prev[k]) out[k] = initial[k]
      return out
    })
  }, [initial])

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const dirty = (Object.keys(form) as (keyof typeof form)[]).filter((k) => form[k] !== initial[k])

  const save = async () => {
    const p: Record<string, unknown> = {}
    for (const k of dirty) {
      const v = form[k]
      if (k === 'closedAt') p.closedAt = fromDateInput(v)
      else if (k === 'lastContactedAt' || k === 'nextFollowUpAt') p[k] = fromLocalInput(v)
      else if (k === 'mrr' || k === 'setupFee') p[k] = v.trim() === '' ? null : Number(v.replace(/[$,\s]/g, ''))
      else p[k] = v.trim() || null
    }
    setBusy(true)
    await actions.patch(person.key, p as Patch)
    setBusy(false)
  }

  const addNote = async () => {
    setNoteBusy(true)
    const ok = await actions.note(person.key, { body: note, logContact: false })
    setNoteBusy(false)
    if (ok) setNote('')
  }

  return (
    <div className="mt-3 space-y-4 rounded-lg border border-gray-800 bg-gray-950 p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {showRevenue ? (
          <>
            <Field label="MRR they pay ($/mo)">
              <input inputMode="decimal" value={form.mrr} onChange={set('mrr')} placeholder="0" className={`${inputCls} tabular-nums`} />
            </Field>
            <Field label="Setup fee they paid ($)">
              <input inputMode="decimal" value={form.setupFee} onChange={set('setupFee')} placeholder="0" className={`${inputCls} tabular-nums`} />
            </Field>
          </>
        ) : (
          <p className="self-end text-sm text-gray-500">Revenue hidden. Use the eye icon in the header to show MRR and setup fee.</p>
        )}
        <Field label="Closed on">
          <input type="date" value={form.closedAt} onChange={set('closedAt')} className={inputCls} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Lost reason">
            <textarea rows={2} value={form.lostReason} onChange={set('lostReason')} className={`${inputCls} py-2`} />
          </Field>
        </div>
        <Field label="Last contacted">
          <input type="datetime-local" value={form.lastContactedAt} onChange={set('lastContactedAt')} className={inputCls} />
        </Field>
        <Field label="Next follow-up">
          <input type="datetime-local" value={form.nextFollowUpAt} onChange={set('nextFollowUpAt')} className={inputCls} />
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void save()} disabled={busy || dirty.length === 0} className={btnPrimary}>
          {busy ? 'Saving' : 'Save changes'}
        </button>
        {dirty.length > 0 && (
          <button type="button" onClick={() => setForm(initial)} disabled={busy} className={btnGhost}>
            Discard
          </button>
        )}
      </div>

      {person.bookings.length > 1 && (
        <div className="border-t border-gray-800 pt-4">
          <h4 className="mb-2 text-sm font-semibold text-gray-200">All bookings</h4>
          <ol className="space-y-2">
            {person.bookings.map((b) => (
              <BookingLine key={b.id} b={b} now={now} onShow={(s) => void actions.show(person.key, b.id, s)} />
            ))}
          </ol>
        </div>
      )}

      <div className="border-t border-gray-800 pt-4">
        <h4 className="mb-2 text-sm font-semibold text-gray-200">Notes</h4>
        <div className="flex flex-col gap-2 sm:flex-row">
          <textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a note. Does not change last contacted."
            className={`${inputCls} py-2`}
          />
          <button type="button" onClick={() => void addNote()} disabled={noteBusy || !note.trim()} className={`${btnGhost} shrink-0`}>
            {noteBusy ? 'Adding' : 'Add note'}
          </button>
        </div>
        {person.notes.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">No notes yet.</p>
        ) : (
          <ol className="mt-3 space-y-2">
            {person.notes.map((n) => (
              <li key={n.id} className="rounded-lg border border-gray-800 p-2.5">
                <div className="mb-1 flex items-center gap-2 text-xs text-gray-500">
                  <span className="tabular-nums">{fmtStamp(n.createdAt)}</span>
                  {n.kind === 'contact' && <Pill>Contact</Pill>}
                </div>
                <p className="whitespace-pre-wrap break-words text-sm text-gray-200">{n.body}</p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

const PersonCard = memo(function PersonCard({
  person,
  now,
  showRevenue,
  actions,
}: {
  person: PipelinePerson
  now: number
  showRevenue: boolean
  actions: Actions
}) {
  const [mode, setMode] = useState<null | 'contact' | 'details'>(null)
  const f = followUpState(person, now)
  const stage = stageOf(person)
  const primary = primaryBooking(person.bookings)
  const surface = surfaceOf(person)
  const note = useCallback((p: NotePayload) => actions.note(person.key, p), [actions, person.key])

  const setStatus = (s: Status) => {
    void actions.patch(person.key, { status: s })
    // A win wants the money filled in; a loss wants the reason.
    if (s === 'won' || s === 'lost') setMode('details')
  }

  let when: string
  if (primary) when = `${Date.parse(primary.scheduledAt) > now ? 'Call' : 'Called'} ${fmtWhen(primary.scheduledAt)}`
  else if (person.verifiedAt) when = `Verified ${fmtDay(person.verifiedAt)}, never booked`
  else if (person.leadCreatedAt) when = `Lead ${fmtDay(person.leadCreatedAt)}, not verified, never booked`
  else when = 'Never booked'

  return (
    <article className={`rounded-lg border bg-gray-900 p-3 sm:p-4 ${f.due ? 'border-amber-500/50' : 'border-gray-800'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="break-words text-base font-semibold text-gray-100">{person.name}</h3>
          {person.company && <p className="break-words text-sm text-gray-400">{person.company}</p>}
        </div>
        {f.due && (
          <span className="shrink-0 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-300 tabular-nums">
            {f.reason === 'overdue' ? `Follow-up due ${ago(f.since, now)}` : `No contact ${formatAge(new Date(f.since).toISOString(), now)}`}
          </span>
        )}
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-4 text-sm">
        {person.phone ? (
          <a href={`tel:${person.phone}`} className={`inline-flex min-h-[44px] items-center rounded tabular-nums text-blue-400 hover:text-blue-300 ${FOCUS}`}>
            {formatPhoneNumber(person.phone)}
          </a>
        ) : (
          <span className="inline-flex min-h-[44px] items-center text-gray-500">No phone</span>
        )}
        <span className="tabular-nums text-gray-300">{when}</span>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        <Pill className={STAGE_PILL[stage]}>{STAGE_LABELS[stage]}</Pill>
        {person.verifiedAt || person.bookings.length > 0 ? null : <Pill className={PILL_MUTED}>Not verified</Pill>}
        {surface && <Pill>{SURFACE_LABELS[surface] ?? surface}</Pill>}
        <Pill className={person.arm ? undefined : PILL_MUTED}>Arm {person.arm ?? 'none'}</Pill>
        <Pill className={person.utmTerm ? undefined : PILL_MUTED}>{person.utmTerm ?? 'No utm_term'}</Pill>
        {person.agencyFlagTerm && <Pill className={PILL_AMBER}>Agency flag: {person.agencyFlagTerm}</Pill>}
        {person.bookings.length > 1 && <Pill>{person.bookings.length} bookings</Pill>}
        {person.leadJunk && <Pill className={PILL_MUTED}>Lead marked junk</Pill>}
        {person.isTest && <Pill className={PILL_MUTED}>Test number</Pill>}
      </div>

      <div className="space-y-2">
        {primary && (
          <Segmented<ShowStatus>
            label="Showed"
            options={SHOW_STATUSES}
            labels={SHOW_LABELS}
            value={effectiveShow(primary)}
            onChange={(s) => void actions.show(person.key, primary.id, s)}
          />
        )}
        <Segmented<Status> label="Status" options={STATUSES} labels={STATUS_LABELS} value={person.status} onChange={setStatus} />
      </div>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-400">
        <span>
          Last contacted{' '}
          <span className="tabular-nums text-gray-200">{person.lastContactedAt ? ago(Date.parse(person.lastContactedAt), now) : 'never'}</span>
        </span>
        <span>
          Next follow-up <span className="tabular-nums text-gray-200">{person.nextFollowUpAt ? fmtStamp(person.nextFollowUpAt) : 'none'}</span>
        </span>
        {!isOpenStatus(person.status) && person.closedAt && (
          <span>
            Closed <span className="tabular-nums text-gray-200">{fmtDay(person.closedAt)}</span>
          </span>
        )}
        {showRevenue && person.status === 'won' && (
          <span className="tabular-nums text-emerald-300">
            {person.mrr !== null ? `${money(person.mrr)}/mo` : 'MRR not set'}
            {person.setupFee !== null && `, ${money(person.setupFee)} setup`}
          </span>
        )}
      </div>
      {person.lostReason && person.status !== 'won' && (
        <p className="mt-1 break-words text-sm text-gray-400">Reason: {person.lostReason}</p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setMode((m) => (m === 'contact' ? null : 'contact'))}
          aria-expanded={mode === 'contact'}
          className={mode === 'contact' ? btnGhost : btnPrimary}
        >
          Log contact
        </button>
        <button
          type="button"
          onClick={() => setMode((m) => (m === 'details' ? null : 'details'))}
          aria-expanded={mode === 'details'}
          className={btnGhost}
        >
          {mode === 'details' ? 'Hide details' : `Details and notes${person.notes.length ? ` (${person.notes.length})` : ''}`}
        </button>
      </div>

      {mode === 'contact' && <LogContactForm onSave={note} onCancel={() => setMode(null)} />}
      {mode === 'details' && <DetailsForm person={person} now={now} showRevenue={showRevenue} actions={actions} />}
    </article>
  )
})

// ---------------------------------------------------------------------------
// ROI
// ---------------------------------------------------------------------------

function RoiTable({
  title,
  keyLabel,
  data,
  showRevenue,
}: {
  title: string
  keyLabel: string
  data: { groups: RoiRow[]; total: RoiRow }
  showRevenue: boolean
}) {
  const cols: { key: string; label: string; get: (r: RoiRow) => string; money?: boolean }[] = [
    { key: 'leads', label: 'Leads', get: (r) => String(r.leads) },
    { key: 'verified', label: 'Verified', get: (r) => String(r.verified) },
    { key: 'bookings', label: 'Bookings', get: (r) => String(r.bookings) },
    { key: 'showed', label: 'Showed', get: (r) => String(r.showed) },
    { key: 'noShow', label: 'No-show', get: (r) => String(r.noShow) },
    { key: 'cancelled', label: 'Cancelled', get: (r) => String(r.cancelled) },
    { key: 'notMarked', label: 'Not marked', get: (r) => String(r.notMarked) },
    { key: 'showRate', label: 'Show rate', get: (r) => pct(r.showRate) },
    { key: 'won', label: 'Closed won', get: (r) => String(r.won) },
    { key: 'closeRate', label: 'Close rate', get: (r) => pct(r.closeRate) },
    { key: 'mrr', label: 'Total MRR', get: (r) => money(r.mrr), money: true },
    { key: 'setup', label: 'Total setup', get: (r) => money(r.setup), money: true },
  ]
  const visible = cols.filter((c) => !c.money || showRevenue)
  const label = (k: string) => SURFACE_LABELS[k] ?? k
  const muted = (k: string) => k === NO_TERM || k === NO_SURFACE || k === UNKNOWN_SURFACE

  return (
    <section className="rounded-lg border border-gray-800 bg-gray-900">
      <h2 className="border-b border-gray-800 px-4 py-3 text-base font-semibold text-gray-100">{title}</h2>
      {/* Phone: one block per group, every number visible without a sideways scroll. */}
      <ul className="divide-y divide-gray-800 sm:hidden">
        {[...data.groups, data.total].map((g, i) => {
          const isTotal = i === data.groups.length
          return (
            <li key={isTotal ? '__total' : g.key} className={`px-4 py-3 ${isTotal ? 'bg-gray-950/50' : ''}`}>
              <div className={`mb-2 break-all text-sm font-semibold ${muted(g.key) ? 'text-gray-500' : 'text-gray-100'}`}>
                {isTotal ? 'Total' : label(g.key)}
              </div>
              <dl className="grid grid-cols-3 gap-x-3 gap-y-2 tabular-nums">
                {visible.map((c) => (
                  <div key={c.key}>
                    <dt className="text-xs text-gray-500">{c.label}</dt>
                    <dd className="text-sm text-gray-100">{c.get(g)}</dd>
                  </div>
                ))}
              </dl>
            </li>
          )
        })}
      </ul>
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="text-left text-gray-400">
              <th className="px-4 py-2 font-medium">{keyLabel}</th>
              {visible.map((c) => (
                <th key={c.key} className="whitespace-nowrap px-3 py-2 text-right font-medium">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {data.groups.map((g) => (
              <tr key={g.key} className="border-t border-gray-800">
                <td className={`max-w-[260px] break-all px-4 py-2 ${muted(g.key) ? 'text-gray-500' : 'text-gray-100'}`}>{label(g.key)}</td>
                {visible.map((c) => (
                  <td key={c.key} className="px-3 py-2 text-right text-gray-200">{c.get(g)}</td>
                ))}
              </tr>
            ))}
            <tr className="border-t border-gray-700 font-semibold">
              <td className="px-4 py-2 text-gray-100">Total</td>
              {visible.map((c) => (
                <td key={c.key} className="px-3 py-2 text-right text-gray-100">{c.get(data.total)}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type StatusFilter = 'all' | 'open' | Status
type Filters = {
  stage: 'all' | Stage
  status: StatusFilter
  surface: string
  term: string
  verified: 'all' | 'yes' | 'no'
  dueOnly: boolean
}
const NO_FILTERS: Filters = { stage: 'all', status: 'all', surface: 'all', term: 'all', verified: 'all', dueOnly: false }

/** The two lists Jacob lives in, plus the follow-up queue, one tap each. */
const PRESETS: { key: string; label: string; filters: Filters }[] = [
  { key: 'verified-unbooked', label: 'Verified, never booked', filters: { ...NO_FILTERS, stage: 'lead_only', verified: 'yes', status: 'open' } },
  { key: 'showed-open', label: 'Showed, not closed', filters: { ...NO_FILTERS, stage: 'showed', status: 'open' } },
  { key: 'due', label: 'Needs follow-up', filters: { ...NO_FILTERS, dueOnly: true } },
]
const sameFilters = (a: Filters, b: Filters) => (Object.keys(a) as (keyof Filters)[]).every((k) => a[k] === b[k])

export function PipelineClient({ initialShowRevenue = false }: { initialShowRevenue?: boolean }) {
  const [people, setPeople] = useState<PipelinePerson[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'pipeline' | 'roi'>('pipeline')
  const [showRevenue, setShowRevenue] = useState(initialShowRevenue)
  const [now, setNow] = useState(() => Date.now())
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const setFilter = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters((f) => ({ ...f, [k]: v }))

  // Latest request per person. A slower, older response must never overwrite
  // the result of a newer tap on the same card.
  const seq = useRef(new Map<string, number>())
  const peopleRef = useRef(people)
  peopleRef.current = people

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/pipeline', { cache: 'no-store' })
      if (res.status === 403) {
        window.location.href = '/dashboard'
        return
      }
      if (!res.ok) throw new Error('load')
      const data = (await res.json()) as { people: PipelinePerson[] }
      setPeople(data.people)
      setNow(Date.now())
    } catch {
      setError('Could not load the pipeline.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [load])

  const toggleRevenue = useCallback(() => {
    setShowRevenue((prev) => {
      const next = !prev
      document.cookie = next
        ? `${REVENUE_COOKIE}=1; path=/; max-age=31536000; samesite=lax`
        : `${REVENUE_COOKIE}=; path=/; max-age=0; samesite=lax`
      return next
    })
  }, [])

  /** Shared by every write: optimistic apply, then the server's person, or revert. */
  const write = useCallback(
    async (key: string, url: string, method: 'PATCH' | 'POST', body: unknown, optimistic: (p: PipelinePerson) => PipelinePerson) => {
      const mine = (seq.current.get(key) ?? 0) + 1
      seq.current.set(key, mine)
      const before = peopleRef.current.find((p) => p.key === key)
      setPeople((ps) => ps.map((p) => (p.key === key ? optimistic(p) : p)))
      setError('')
      try {
        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const data = (await res.json().catch(() => ({}))) as { person?: PipelinePerson; error?: string }
        if (!res.ok || !data.person) throw new Error(data.error || 'Save failed')
        if (seq.current.get(key) === mine) setPeople((ps) => ps.map((p) => (p.key === key ? data.person! : p)))
        return true
      } catch (err) {
        if (seq.current.get(key) === mine && before) setPeople((ps) => ps.map((p) => (p.key === key ? before : p)))
        setError(`Not saved: ${err instanceof Error ? err.message : 'unknown error'}`)
        return false
      }
    },
    []
  )

  const actions = useMemo<Actions>(
    () => ({
      patch: (key, patch) => write(key, '/api/admin/pipeline/person', 'PATCH', { key, ...patch }, (p) => ({ ...p, ...patch })),
      note: (key, n) =>
        write(key, '/api/admin/pipeline/person/notes', 'POST', { key, ...n }, (p) =>
          n.logContact
            ? { ...p, lastContactedAt: new Date().toISOString(), ...(n.nextFollowUpAt !== undefined ? { nextFollowUpAt: n.nextFollowUpAt } : {}) }
            : p
        ),
      show: (key, bookingId, s) =>
        write(key, `/api/admin/pipeline/booking/${bookingId}`, 'PATCH', { showStatus: s }, (p) => ({
          ...p,
          bookings: p.bookings.map((b) => (b.id === bookingId ? { ...b, showStatus: s } : b)),
        })),
    }),
    [write]
  )

  const terms = useMemo(
    () => Array.from(new Set(people.map((p) => p.utmTerm).filter((t): t is string => Boolean(t)))).sort(),
    [people]
  )

  const visible = useMemo(() => {
    const f = filters
    const matched = people.filter((p) => {
      if (f.stage !== 'all' && stageOf(p) !== f.stage) return false
      if (f.status === 'open' ? !isOpenStatus(p.status) : f.status !== 'all' && p.status !== f.status) return false
      if (f.surface !== 'all' && surfaceKey(p) !== f.surface) return false
      if (f.term !== 'all' && (p.utmTerm ?? NO_TERM) !== f.term) return false
      if (f.verified !== 'all' && Boolean(p.verifiedAt) !== (f.verified === 'yes')) return false
      if (f.dueOnly && !followUpState(p, now).due) return false
      return true
    })
    return sortPipeline(matched, now)
  }, [people, filters, now])

  const dueCount = useMemo(() => people.filter((p) => followUpState(p, now).due).length, [people, now])
  const byTerm = useMemo(() => rollupRoi(people, 'utmTerm'), [people])
  const bySurface = useMemo(() => rollupRoi(people, 'surface'), [people])
  const filtered = !sameFilters(filters, NO_FILTERS)

  const selectCls = `min-h-[44px] min-w-0 rounded-lg border border-gray-800 bg-gray-900 px-3 text-sm text-gray-200 ${FOCUS}`

  return (
    <div className="min-h-dvh bg-gray-950 text-gray-100">
      <header className="sticky top-0 z-10 border-b border-gray-800 bg-gray-950">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-3 py-2 sm:px-6">
          <Link href="/admin" className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-1 text-sm text-gray-400 hover:text-gray-100 ${FOCUS}`}>
            <ArrowLeft className="h-4 w-4" /> Admin
          </Link>
          <h1 className="ml-1 text-lg font-bold">Pipeline</h1>
          {dueCount > 0 && (
            <span className="whitespace-nowrap rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-300 tabular-nums">
              {dueCount} due
            </span>
          )}
          <div className="ml-auto flex items-center">
            <button
              type="button"
              onClick={toggleRevenue}
              aria-pressed={showRevenue}
              aria-label={showRevenue ? 'Hide revenue' : 'Show revenue'}
              title={showRevenue ? 'Hide revenue' : 'Show revenue'}
              className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-gray-400 hover:text-gray-100 ${FOCUS}`}
            >
              {showRevenue ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => void load()}
              aria-label="Refresh"
              title="Refresh"
              className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-gray-400 hover:text-gray-100 ${FOCUS}`}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
        <div className="mx-auto flex max-w-5xl gap-1 px-3 sm:px-6" role="tablist">
          {(['pipeline', 'roi'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`min-h-[44px] border-b-2 px-3 text-sm font-medium ${FOCUS} ${
                tab === t ? 'border-blue-500 text-gray-100' : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              {t === 'pipeline' ? 'Pipeline' : 'ROI'}
            </button>
          ))}
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-4 px-3 py-4 sm:px-6">
        {error && (
          <p role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        {tab === 'pipeline' ? (
          <>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => {
                const active = sameFilters(filters, p.filters)
                return (
                  <button
                    key={p.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setFilters(active ? NO_FILTERS : p.filters)}
                    className={`min-h-[44px] rounded-full border px-4 text-sm font-medium ${FOCUS} ${
                      active ? TONE.amber : 'border-gray-800 bg-gray-900 text-gray-300 hover:text-gray-100'
                    }`}
                  >
                    {p.label}
                  </button>
                )
              })}
            </div>

            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              <select aria-label="Stage" value={filters.stage} onChange={(e) => setFilter('stage', e.target.value as Filters['stage'])} className={selectCls}>
                <option value="all">All stages</option>
                {STAGES.map((s) => (
                  <option key={s} value={s}>{STAGE_LABELS[s]}</option>
                ))}
              </select>
              <select aria-label="Status" value={filters.status} onChange={(e) => setFilter('status', e.target.value as StatusFilter)} className={selectCls}>
                <option value="all">All statuses</option>
                <option value="open">Open (pending or working)</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
              <select aria-label="Surface" value={filters.surface} onChange={(e) => setFilter('surface', e.target.value)} className={selectCls}>
                <option value="all">All surfaces</option>
                <option value="landing">Landing</option>
                <option value="watch">Watch</option>
                <option value="calendar">Texted link</option>
                <option value={UNKNOWN_SURFACE}>Booked, surface not recorded</option>
                <option value={NO_SURFACE}>No booking</option>
              </select>
              <select aria-label="Verified" value={filters.verified} onChange={(e) => setFilter('verified', e.target.value as Filters['verified'])} className={selectCls}>
                <option value="all">Verified or not</option>
                <option value="yes">Verified</option>
                <option value="no">Not verified</option>
              </select>
              <select aria-label="utm_term" value={filters.term} onChange={(e) => setFilter('term', e.target.value)} className={`${selectCls} col-span-2 max-w-full`}>
                <option value="all">All utm_terms</option>
                {terms.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
                <option value={NO_TERM}>No utm_term</option>
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 text-sm text-gray-500 tabular-nums">
              <span hidden={loading && people.length === 0}>
                {visible.length} of {people.length} people. Needs follow-up first, then next follow-up soonest.
              </span>
              {filtered && (
                <button type="button" onClick={() => setFilters(NO_FILTERS)} className={`min-h-[44px] rounded text-blue-400 hover:text-blue-300 ${FOCUS}`}>
                  Clear filters
                </button>
              )}
            </div>

            {loading && people.length === 0 ? (
              <p className="text-sm text-gray-400">Loading</p>
            ) : visible.length === 0 ? (
              <p className="text-sm text-gray-400">Nobody matches these filters.</p>
            ) : (
              <div className="space-y-3">
                {visible.map((p) => (
                  <PersonCard key={p.key} person={p} now={now} showRevenue={showRevenue} actions={actions} />
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <RoiTable title="By ad (utm_term)" keyLabel="utm_term" data={byTerm} showRevenue={showRevenue} />
            <RoiTable title="By surface" keyLabel="Surface" data={bySurface} showRevenue={showRevenue} />
            <div className="space-y-1 text-sm text-gray-500">
              <p>Leads are people, booked or not. Verified means they passed the phone code or booked. Test numbers are the only thing left out.</p>
              <p>Bookings count every booking, cancelled and junk included: each one was paid for. A booking the calendar cancelled counts as cancelled until you mark it otherwise.</p>
              <p>Show rate is showed divided by showed plus no-show. Cancelled and not-marked bookings stay out of it, and are counted in their own columns.</p>
              <p>Close rate is people closed won divided by people who showed. MRR and setup total closed-won people only.</p>
              <p>By surface uses each person&apos;s live booking. People who never booked are in their own row, and so are old bookings from before the calendar was recorded.</p>
              {!showRevenue && <p>Revenue hidden. Use the eye icon to show total MRR and setup.</p>}
              <p>
                Needs follow-up: the next follow-up date has passed, or the person is still open (pending or working) with no contact in{' '}
                {FOLLOW_UP_STALE_DAYS} days since their call (or since verifying, if they never booked). People with a call still ahead are not flagged, and neither are unverified leads, unless you set a date.
              </p>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
