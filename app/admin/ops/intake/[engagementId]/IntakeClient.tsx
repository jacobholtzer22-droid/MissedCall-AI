'use client'

// /admin/ops/intake/[engagementId]: everything Jacob has for a client's site,
// in one place. Sections follow Engagement.intake (lib/ops/intake.ts). Each
// section saves on blur (PATCH .../intake with that key) and shows Saved.
// Photos and the logo upload straight from the browser to Vercel Blob (a
// token from .../assets/token), then register with POST .../assets; one file
// at a time so a batch never races. Per photo: caption, hero candidate,
// service, before or after.

import { useRef, useState } from 'react'
import Link from 'next/link'
import { upload } from '@vercel/blob/client'
import { ArrowLeft, ImagePlus, Plus, Star, Trash2, X } from 'lucide-react'
import { intakeMissing, type Intake, type IntakeAsset } from '@/lib/ops/intake'

const control =
  'w-full bg-gray-950 border border-gray-800 rounded-md px-3 min-h-[44px] text-sm text-gray-100 placeholder:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500'
const area = `${control} py-2 resize-y`
const label = 'block text-xs font-medium text-gray-500 mb-1'
const smallBtn =
  'inline-flex items-center justify-center gap-1 px-3 min-h-[44px] rounded-lg border border-gray-700 bg-gray-800 hover:bg-gray-700 text-xs font-medium text-gray-200 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500'

type SaveState = 'idle' | 'saving' | 'saved' | 'error'
const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean)

export function IntakeClient({
  engagementId,
  name,
  initial,
  hasBrief,
  fallback,
}: {
  engagementId: string
  name: string
  initial: Intake
  hasBrief: boolean
  fallback: { phone: string | null; email: string | null; trade: string | null; location: string | null }
}) {
  const [intake, setIntake] = useState<Intake>(initial)
  const [state, setState] = useState<SaveState>('idle')
  const [error, setError] = useState<string | null>(null)
  const base = `/api/admin/ops/engagements/${engagementId}`

  const save = async (patch: Partial<Intake>) => {
    setState('saving')
    setError(null)
    try {
      const res = await fetch(`${base}/intake`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(data.error ?? 'Could not save'))
      setIntake(data.intake)
      setState('saved')
    } catch (err) {
      setState('error')
      setError(err instanceof Error ? err.message : 'Could not save')
    }
  }

  const missing = intakeMissing(intake)
  const b = intake.business ?? {}
  const serviceNames = (intake.services ?? []).map((s) => s.name).filter(Boolean)

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800 px-3 sm:px-6">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3 min-h-[56px]">
          <div className="flex items-center gap-2 min-w-0">
            <Link
              href="/admin/ops?tab=clients"
              aria-label="Back to Ops"
              className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg text-gray-400 hover:text-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="text-lg font-semibold truncate">Intake: {name}</h1>
          </div>
          <span aria-live="polite" className={`text-xs ${state === 'error' ? 'text-red-400' : 'text-gray-500'}`}>
            {state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : state === 'error' ? 'Not saved' : ''}
          </span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-3 sm:px-6 py-5 space-y-6">
        <p className={`text-sm ${missing.length ? 'text-amber-300' : 'text-emerald-300'}`}>
          {missing.length ? `Still empty: ${missing.join(', ')}.` : 'Everything the build needs is here.'}{' '}
          <span className="text-gray-500">{hasBrief ? 'A brief is written; the chief rewrites it from this when asked.' : 'Then ask the chief to write the brief.'}</span>
        </p>
        {error && <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}

        <Section title="Business">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(
              [
                ['legalName', 'Legal name'],
                ['displayName', 'Display name'],
                ['trade', 'Trade', fallback.trade],
                ['phone', 'Phone that should ring', fallback.phone],
                ['email', 'Email for the site', fallback.email],
                ['hours', 'Hours'],
                ['yearsInBusiness', 'Years in business'],
                ['licenses', 'Licenses and insurance'],
                ['languages', 'Languages'],
                ['customerType', 'Residential, commercial or both'],
                ['address', 'Home base address (not public)'],
                ['priorityArea', 'Where they want the most jobs'],
                ['maxDistance', 'Farthest they will drive'],
                ['whoAnswers', 'Who answers the phone'],
                ['emergency', 'Emergency or after-hours work'],
              ] as [keyof NonNullable<Intake['business']>, string, string | null | undefined][]
            ).map(([k, l, hint]) => (
              <Field key={k} label={l} value={(b[k] as string | undefined) ?? ''} placeholder={hint ?? ''} onSave={(v) => save({ business: { [k]: v } })} />
            ))}
          </div>
          <Lines
            label="Service area: main city first, one town per line"
            value={b.serviceArea ?? []}
            placeholder={fallback.location ?? 'Rochester, MN'}
            onSave={(v) => save({ business: { serviceArea: v } })}
          />
        </Section>

        <Section title="Services">
          <Services value={intake.services ?? []} onSave={(v) => save({ services: v })} />
        </Section>

        <Section title="About">
          <Text label="The owner's story, in the client's words" value={intake.about ?? ''} rows={5} onSave={(v) => save({ about: v })} />
          <Lines label="What makes them different, one per line" value={intake.differentiators ?? []} onSave={(v) => save({ differentiators: v })} />
        </Section>

        <Section title="Google Ads">
          <Lines label="Calls they do NOT want (become negatives), one per line" value={intake.ads?.exclusions ?? []} onSave={(v) => save({ ads: { exclusions: v } })} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Gmail for the Ads account" value={intake.ads?.accountEmail ?? ''} onSave={(v) => save({ ads: { accountEmail: v } })} />
            <Field
              label="Monthly ad budget ($, to Google)"
              value={intake.ads?.budgetMonthly != null ? String(intake.ads.budgetMonthly) : ''}
              onSave={(v) => {
                const n = Number(v.replace(/[$,\s]/g, ''))
                save({ ads: { budgetMonthly: v && Number.isFinite(n) ? n : undefined } })
              }}
            />
            <Field label="Main goal: calls, quote requests or both" value={intake.ads?.goal ?? ''} onSave={(v) => save({ ads: { goal: v } })} />
            <Field label="Busy and slow seasons" value={intake.ads?.seasons ?? ''} onSave={(v) => save({ ads: { seasons: v } })} />
            <Field label="Offer they would run" value={intake.offer ?? ''} onSave={(v) => save({ offer: v })} />
          </div>
          <Lines label="Competitors to go after, one per line" value={intake.ads?.competitors ?? []} onSave={(v) => save({ ads: { competitors: v } })} />
        </Section>

        <Section title="Google Business Profile">
          <div className="flex flex-wrap gap-x-6">
            {(
              [
                ['exists', 'Has a profile'],
                ['verified', 'Verified'],
                ['managerAccess', 'Jacob is a manager'],
              ] as const
            ).map(([k, l]) => (
              <label key={k} className="flex items-center gap-3 min-h-[44px] text-sm text-gray-200">
                <input type="checkbox" checked={Boolean(intake.gbp?.[k])} onChange={(e) => save({ gbp: { [k]: e.target.checked } })} className="h-4 w-4 accent-blue-500" />
                {l}
              </label>
            ))}
          </div>
          <Field label="Reviews: how many and where" value={intake.gbp?.reviewCount ?? ''} onSave={(v) => save({ gbp: { reviewCount: v } })} />
        </Section>

        <Section title="Reviews">
          <Field label="Google Business Profile link" value={intake.reviews?.gbpUrl ?? ''} onSave={(v) => save({ reviews: { gbpUrl: v } })} />
          <Quotes value={intake.reviews?.quotes ?? []} onSave={(v) => save({ reviews: { quotes: v } })} />
        </Section>

        <Section title="Old site">
          <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-3">
            <Field label="URL" value={intake.oldSite?.url ?? ''} placeholder="https://" onSave={(v) => save({ oldSite: { url: v } })} />
            <label className="block">
              <span className={label}>How to use it</span>
              <select
                value={intake.oldSite?.use ?? 'facts_only'}
                onChange={(e) => save({ oldSite: { use: e.target.value as 'verbatim' | 'facts_only' | 'ignore' } })}
                className={control}
              >
                <option value="verbatim">Carry its copy over</option>
                <option value="facts_only">Facts only, fresh copy</option>
                <option value="ignore">Ignore it</option>
              </select>
            </label>
          </div>
          <Field label="Notes" value={intake.oldSite?.notes ?? ''} onSave={(v) => save({ oldSite: { notes: v } })} />
        </Section>

        <Section title="Socials">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(['facebook', 'instagram', 'yelp', 'nextdoor'] as const).map((k) => (
              <Field key={k} label={k[0].toUpperCase() + k.slice(1)} value={intake.socials?.[k] ?? ''} placeholder="https://" onSave={(v) => save({ socials: { [k]: v } })} />
            ))}
          </div>
        </Section>

        <Section title="Style">
          <Lines label="Reference sites, one per line" value={intake.style?.referenceSites ?? []} placeholder="https://kalights.com" onSave={(v) => save({ style: { referenceSites: v } })} />
          <Lines label="Colours (hex if known), one per line" value={intake.style?.colors ?? []} onSave={(v) => save({ style: { colors: v } })} />
          <Field label="Avoid" value={intake.style?.avoid ?? ''} onSave={(v) => save({ style: { avoid: v } })} />
        </Section>

        <Section title="Domain">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Current" value={intake.domain?.current ?? ''} onSave={(v) => save({ domain: { current: v } })} />
            <Field label="Wanted" value={intake.domain?.wanted ?? ''} onSave={(v) => save({ domain: { wanted: v } })} />
            <Field label="Registrar" value={intake.domain?.registrar ?? ''} onSave={(v) => save({ domain: { registrar: v } })} />
          </div>
          <label className="flex items-center gap-3 min-h-[44px] text-sm text-gray-200">
            <input
              type="checkbox"
              checked={Boolean(intake.domain?.ownerHasAccess)}
              onChange={(e) => save({ domain: { ownerHasAccess: e.target.checked } })}
              className="h-4 w-4 accent-blue-500"
            />
            The owner can log in to the registrar
          </label>
        </Section>

        <Section title="Photos">
          <Assets engagementId={engagementId} kind="photo" assets={(intake.assets ?? []).filter((a) => a.kind === 'photo')} services={serviceNames} onChange={setIntake} onError={setError} />
        </Section>

        <Section title="Logo">
          <Assets engagementId={engagementId} kind="logo" assets={(intake.assets ?? []).filter((a) => a.kind === 'logo')} services={[]} onChange={setIntake} onError={setError} />
        </Section>

        <Section title="Raw notes">
          <Text label="Paste texts, emails, anything the client sent" value={intake.rawNotes ?? ''} rows={10} onSave={(v) => save({ rawNotes: v })} />
        </Section>
      </main>
    </div>
  )
}

// ── Pieces ──────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
      <h2 className="text-sm font-semibold text-gray-100">{title}</h2>
      {children}
    </section>
  )
}

/** One text input that saves on blur when it changed. */
function Field({ label: l, value, placeholder, onSave }: { label: string; value: string; placeholder?: string; onSave: (v: string) => void }) {
  const [draft, setDraft] = useState(value)
  const [prev, setPrev] = useState(value)
  if (prev !== value) {
    setPrev(value)
    setDraft(value)
  }
  return (
    <label className="block">
      <span className={label}>{l}</span>
      <input value={draft} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)} onBlur={() => draft.trim() !== value && onSave(draft.trim())} className={control} />
    </label>
  )
}

function Text({ label: l, value, rows, onSave }: { label: string; value: string; rows: number; onSave: (v: string) => void }) {
  const [draft, setDraft] = useState(value)
  const [prev, setPrev] = useState(value)
  if (prev !== value) {
    setPrev(value)
    setDraft(value)
  }
  return (
    <label className="block">
      <span className={label}>{l}</span>
      <textarea rows={rows} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => draft.trim() !== value && onSave(draft.trim())} className={area} />
    </label>
  )
}

/** A list edited as one line per item. */
function Lines({ label: l, value, placeholder, onSave }: { label: string; value: string[]; placeholder?: string; onSave: (v: string[]) => void }) {
  const joined = value.join('\n')
  const [draft, setDraft] = useState(joined)
  const [prev, setPrev] = useState(joined)
  if (prev !== joined) {
    setPrev(joined)
    setDraft(joined)
  }
  return (
    <label className="block">
      <span className={label}>{l}</span>
      <textarea
        rows={Math.max(3, value.length + 1)}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => lines(draft).join('\n') !== joined && onSave(lines(draft))}
        className={area}
      />
    </label>
  )
}

function Services({ value, onSave }: { value: NonNullable<Intake['services']>; onSave: (v: NonNullable<Intake['services']>) => void }) {
  const [rows, setRows] = useState(value.length ? value : [{ name: '' }])
  const commit = (next = rows) => onSave(next.filter((r) => r.name.trim()).map((r) => ({ ...r, name: r.name.trim() })))
  const set = (i: number, k: 'name' | 'description' | 'priceNote' | 'avgJobValue', v: string) => setRows((p) => p.map((r, n) => (n === i ? { ...r, [k]: v } : r)))
  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <div key={i} className="rounded-lg border border-gray-800 p-3 space-y-2">
          <div className="flex gap-2">
            <input aria-label={`Service ${i + 1} name`} placeholder="Service name" value={r.name} onChange={(e) => set(i, 'name', e.target.value)} onBlur={() => commit()} className={control} />
            <button
              type="button"
              aria-label={`Remove service ${i + 1}`}
              onClick={() => {
                const next = rows.filter((_, n) => n !== i)
                setRows(next.length ? next : [{ name: '' }])
                commit(next)
              }}
              className={smallBtn}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <textarea aria-label={`Service ${i + 1} description`} placeholder="What it includes" rows={2} value={r.description ?? ''} onChange={(e) => set(i, 'description', e.target.value)} onBlur={() => commit()} className={area} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input aria-label={`Service ${i + 1} price note`} placeholder="Price note (optional)" value={r.priceNote ?? ''} onChange={(e) => set(i, 'priceNote', e.target.value)} onBlur={() => commit()} className={control} />
            <input aria-label={`Service ${i + 1} average job value`} placeholder="Average job value" value={r.avgJobValue ?? ''} onChange={(e) => set(i, 'avgJobValue', e.target.value)} onBlur={() => commit()} className={control} />
          </div>
          <label className="flex items-center gap-3 min-h-[44px] text-sm text-gray-200">
            <input
              type="checkbox"
              checked={Boolean(r.moneyMaker)}
              onChange={(e) => {
                const next = rows.map((x, n) => (n === i ? { ...x, moneyMaker: e.target.checked || undefined } : x))
                setRows(next)
                commit(next)
              }}
              className="h-4 w-4 accent-blue-500"
            />
            Money maker (they want more of these)
          </label>
        </div>
      ))}
      <button type="button" onClick={() => setRows((p) => [...p, { name: '' }])} className={smallBtn}>
        <Plus className="h-4 w-4" /> Add a service
      </button>
    </div>
  )
}

function Quotes({ value, onSave }: { value: { text: string; author: string }[]; onSave: (v: { text: string; author: string }[]) => void }) {
  const [rows, setRows] = useState(value)
  const commit = (next = rows) => onSave(next.filter((r) => r.text.trim()))
  return (
    <div className="space-y-2">
      <span className={label}>Review quotes, exactly as written</span>
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-1 sm:grid-cols-[3fr_1fr_auto] gap-2">
          <input aria-label={`Quote ${i + 1}`} placeholder="Quote" value={r.text} onChange={(e) => setRows((p) => p.map((x, n) => (n === i ? { ...x, text: e.target.value } : x)))} onBlur={() => commit()} className={control} />
          <input aria-label={`Quote ${i + 1} author`} placeholder="Author" value={r.author} onChange={(e) => setRows((p) => p.map((x, n) => (n === i ? { ...x, author: e.target.value } : x)))} onBlur={() => commit()} className={control} />
          <button
            type="button"
            aria-label={`Remove quote ${i + 1}`}
            onClick={() => {
              const next = rows.filter((_, n) => n !== i)
              setRows(next)
              commit(next)
            }}
            className={smallBtn}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button type="button" onClick={() => setRows((p) => [...p, { text: '', author: '' }])} className={smallBtn}>
        <Plus className="h-4 w-4" /> Add a quote
      </button>
    </div>
  )
}

/** Drop or pick files; upload one at a time; edit and delete each. */
function Assets({
  engagementId,
  kind,
  assets,
  services,
  onChange,
  onError,
}: {
  engagementId: string
  kind: 'photo' | 'logo'
  assets: IntakeAsset[]
  services: string[]
  onChange: (i: Intake) => void
  onError: (m: string | null) => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [over, setOver] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const base = `/api/admin/ops/engagements/${engagementId}`

  const add = async (files: FileList | File[]) => {
    onError(null)
    const list = Array.from(files).slice(0, kind === 'logo' ? 1 : 40)
    for (let n = 0; n < list.length; n++) {
      const f = list[n]
      if (/\.(heic|heif)$/i.test(f.name) || /heic|heif/i.test(f.type)) {
        onError(`${f.name}: HEIC photos cannot be converted here. Export them as JPG and upload again.`)
        continue
      }
      if (f.size > 15 * 1024 * 1024) {
        onError(`${f.name} is over 15 MB.`)
        continue
      }
      setBusy(`Uploading ${n + 1} of ${list.length}: ${f.name}`)
      try {
        const safe = f.name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'file'
        const blob = await upload(`ops-intake/${engagementId}/${crypto.randomUUID()}-${safe}`, f, {
          access: 'public',
          handleUploadUrl: `${base}/assets/token`,
          clientPayload: JSON.stringify({ kind }),
          contentType: f.type || undefined,
        })
        const res = await fetch(`${base}/assets`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: blob.url, filename: f.name, kind }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(String(data.error ?? 'Could not save the file'))
        onChange(data.intake)
      } catch (err) {
        onError(`${f.name}: ${err instanceof Error ? err.message : 'upload failed'}`)
      }
    }
    setBusy(null)
  }

  const patch = async (id: string, body: Record<string, unknown>) => {
    const res = await fetch(`${base}/assets/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await res.json().catch(() => ({}))
    if (res.ok) onChange(data.intake)
    else onError(String(data.error ?? 'Could not save'))
  }
  const remove = async (id: string) => {
    const res = await fetch(`${base}/assets/${id}`, { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    if (res.ok) onChange(data.intake)
    else onError(String(data.error ?? 'Could not delete'))
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          void add(e.dataTransfer.files)
        }}
        className={`rounded-lg border-2 border-dashed p-5 text-center text-sm ${over ? 'border-blue-500 bg-blue-500/10' : 'border-gray-700'}`}
      >
        <input
          ref={input}
          type="file"
          multiple={kind === 'photo'}
          accept={kind === 'logo' ? 'image/png,image/jpeg,image/webp,image/svg+xml' : 'image/png,image/jpeg,image/webp'}
          className="sr-only"
          onChange={(e) => e.target.files && void add(e.target.files)}
        />
        <button type="button" disabled={Boolean(busy)} onClick={() => input.current?.click()} className={smallBtn}>
          <ImagePlus className="h-4 w-4" /> {kind === 'logo' ? (assets.length ? 'Replace the logo' : 'Add the logo') : 'Add photos'}
        </button>
        <p className="mt-2 text-xs text-gray-500">
          {busy ?? `or drop ${kind === 'logo' ? 'it' : 'them'} here. JPG, PNG or WebP${kind === 'logo' ? ' or SVG' : ''}, up to 15 MB each. HEIC: export as JPG first.`}
        </p>
      </div>

      {assets.length > 0 && (
        <ul className={`grid gap-3 ${kind === 'photo' ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
          {assets.map((a) => (
            <li key={a.id} className="rounded-lg border border-gray-800 bg-gray-950 overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.url} alt={a.caption || a.filename} className={`w-full ${kind === 'logo' ? 'h-24 object-contain bg-white/90 p-2' : 'aspect-[4/3] object-cover'}`} loading="lazy" />
              <div className="p-3 space-y-2">
                <p className="text-xs text-gray-500 truncate" title={a.filename}>
                  {a.filename}
                </p>
                {kind === 'photo' && (
                  <>
                    <Field label="Caption (which job, which town)" value={a.caption ?? ''} onSave={(v) => patch(a.id, { caption: v })} />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        aria-pressed={Boolean(a.heroCandidate)}
                        onClick={() => patch(a.id, { heroCandidate: !a.heroCandidate })}
                        className={`${smallBtn} ${a.heroCandidate ? 'border-amber-500 bg-amber-500/15 text-amber-200' : ''}`}
                      >
                        <Star className="h-3.5 w-3.5" /> Hero candidate
                      </button>
                      <select aria-label="Service" value={a.service ?? ''} onChange={(e) => patch(a.id, { service: e.target.value || null })} className={`${control} w-auto`}>
                        <option value="">No service</option>
                        {services.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                      <select aria-label="Before or after" value={a.beforeAfter ?? ''} onChange={(e) => patch(a.id, { beforeAfter: e.target.value || null })} className={`${control} w-auto`}>
                        <option value="">Not a pair</option>
                        <option value="before">Before</option>
                        <option value="after">After</option>
                      </select>
                    </div>
                  </>
                )}
                <button type="button" onClick={() => remove(a.id)} className={`${smallBtn} text-red-300`}>
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
