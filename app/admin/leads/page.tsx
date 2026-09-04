'use client'

// ===========================================
// ADMIN: FUNNEL LEADS + ATTRIBUTION
// ===========================================
// READ ONLY. Every row answers "where did this person come from" without ever
// printing the word untagged: a lead with no captured signal says so in plain
// English and names the date instead.
//
// List on the left, detail on the right, same split-pane shape as
// /admin/marketing. On a phone the detail replaces the list (see mobileOpen),
// the pattern established in MessagesClient and ConversationsClient.

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, RefreshCw, Users } from 'lucide-react'

type Touch = {
  source?: string
  medium?: string
  campaign?: string
  content?: string
  term?: string
  utmId?: string
  fbclid?: string
  referrer?: string
  arm?: string
  path?: string
  ts?: string
}

type Lead = {
  id: string
  name: string
  company: string
  trade: string
  phone: string | null
  email: string | null
  status: string
  arm: string | null
  verified: boolean
  createdAt: string
  first: Touch | null
  last: Touch | null
  firstLabel: string | null
  lastLabel: string | null
  hasFbclid: boolean
  hasFbp: boolean
  hasFbc: boolean
  bookingSurface: string | null
  bookedAt: string | null
  journey: string
}

const INK = '#F2F0EB'
const MUTED = '#6E7681'
const ACCENT = '#EE6B1A'
const BORDER = 'rgba(110,118,129,0.30)'

function day(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function Pill({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'on' | 'off' }) {
  const style =
    tone === 'on'
      ? { background: 'rgba(238,107,26,0.15)', color: ACCENT }
      : tone === 'off'
      ? { background: 'rgba(110,118,129,0.15)', color: MUTED }
      : { background: 'rgba(242,240,235,0.07)', color: INK }
  return (
    <span className="rounded px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider" style={style}>
      {children}
    </span>
  )
}

/** A touch rendered field by field. Absent fields are omitted, never blanked. */
function TouchBlock({ label, touch }: { label: string; touch: Touch | null }) {
  const rows: [string, string | undefined][] = [
    ['source', touch?.source],
    ['medium', touch?.medium],
    ['campaign', touch?.campaign],
    ['content', touch?.content],
    ['term', touch?.term],
    ['referrer', touch?.referrer],
    ['landed on', touch?.path],
  ]
  const present = rows.filter(([, v]) => v)
  return (
    <div className="rounded border p-3" style={{ borderColor: BORDER }}>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="font-mono text-[10px] uppercase tracking-wider" style={{ color: MUTED }}>{label}</span>
        <span className="text-[11px]" style={{ color: MUTED }}>{day(touch?.ts)}</span>
      </div>
      {!touch ? (
        <p className="text-[13px]" style={{ color: MUTED }}>Nothing captured on this visit.</p>
      ) : present.length === 0 ? (
        <p className="text-[13px]" style={{ color: INK }}>Direct visit, no campaign on the link.</p>
      ) : (
        <dl className="space-y-1">
          {present.map(([k, v]) => (
            <div key={k} className="flex gap-2 text-[13px]">
              <dt className="w-20 shrink-0" style={{ color: MUTED }}>{k}</dt>
              <dd className="break-all" style={{ color: INK }}>{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}

/** Which video an arm serves. A is pt.3, B is pt.2 — see lib/funnel-videos.ts. */
const ARM_VIDEO: Record<string, string> = { A: 'pt.3', B: 'pt.2' }

const CHANNEL_LABELS: Record<string, string> = {
  facebook_referral: 'Facebook',
  instagram_referral: 'Instagram',
  google_organic: 'Google search',
  direct: 'Direct / no referrer',
}

/**
 * The block Jacob reads. Every line resolves to something concrete: an untagged
 * lead falls back to the referrer class rather than printing "none", which is
 * the whole reason this page exists.
 */
function CameFrom({ lead }: { lead: Lead }) {
  const t = lead.first ?? lead.last
  const referrer = t?.referrer ? CHANNEL_LABELS[t.referrer] ?? t.referrer : 'Direct / no referrer'
  const tagged = Boolean(t?.term || t?.content || t?.campaign || t?.utmId || t?.source)

  const rows: [string, React.ReactNode][] = [
    ['Ad', t?.term ?? (tagged ? 'not in the link' : referrer)],
    ['Ad set', t?.content ?? (tagged ? 'not in the link' : referrer)],
    [
      'Campaign',
      t?.campaign ? (
        <>
          {t.campaign}
          {t.utmId && <span style={{ color: MUTED }}> · {t.utmId}</span>}
        </>
      ) : t?.utmId ? (
        t.utmId
      ) : tagged ? (
        'not in the link'
      ) : (
        referrer
      ),
    ],
    ['Click ID', lead.hasFbclid ? 'yes' : 'no'],
    ['Referrer', referrer],
    ['Arm', lead.arm ?? 'unassigned'],
    ['Video', lead.arm ? ARM_VIDEO[lead.arm] ?? 'unknown' : 'unassigned'],
    ['Booked from', lead.bookingSurface ?? 'not booked'],
  ]

  return (
    <div className="rounded border p-3" style={{ borderColor: BORDER }}>
      <div className="mb-2 font-mono text-[10px] uppercase tracking-wider" style={{ color: MUTED }}>
        Came from
      </div>
      <dl className="space-y-1.5">
        {rows.map(([k, v]) => (
          <div key={k} className="flex gap-3 text-[14px]">
            <dt className="w-24 shrink-0" style={{ color: MUTED }}>{k}</dt>
            <dd className="break-all" style={{ color: INK }}>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

export default function AdminLeadsPage() {
  const router = useRouter()
  const [leads, setLeads] = useState<Lead[]>([])
  const [selected, setSelected] = useState<Lead | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [verifiedOnly, setVerifiedOnly] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/funnel-leads${verifiedOnly ? '?verified=1' : ''}`)
      if (res.status === 403) return router.push('/dashboard')
      if (!res.ok) throw new Error('load')
      const data = (await res.json()) as { leads: Lead[] }
      setLeads(data.leads)
      setSelected((cur) => (cur ? data.leads.find((l) => l.id === cur.id) ?? null : null))
    } catch {
      setError('Could not load leads.')
    } finally {
      setLoading(false)
    }
  }, [router, verifiedOnly])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <main className="min-h-dvh px-4 py-6 sm:px-6" style={{ background: '#16181C', color: INK }}>
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => router.push('/admin')}
            className="flex min-h-[44px] items-center gap-2 text-[14px]"
            style={{ color: MUTED }}
          >
            <ArrowLeft size={16} /> Admin
          </button>
          <h1 className="flex items-center gap-2 text-[20px] font-bold">
            <Users size={18} style={{ color: ACCENT }} /> Funnel leads
          </h1>
          <label className="ml-auto flex min-h-[44px] items-center gap-2 text-[13px]" style={{ color: MUTED }}>
            <input
              type="checkbox"
              checked={verifiedOnly}
              onChange={(e) => setVerifiedOnly(e.target.checked)}
            />
            Verified only
          </label>
          <button
            type="button"
            onClick={() => void load()}
            className="flex min-h-[44px] items-center gap-2 text-[13px]"
            style={{ color: MUTED }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>

        {error && <p className="mb-4 text-[14px]" style={{ color: ACCENT }}>{error}</p>}

        <div className="grid gap-6 md:grid-cols-5">
          {/* List */}
          <div className={`md:col-span-2 ${mobileOpen ? 'hidden md:block' : ''}`}>
            {loading && leads.length === 0 ? (
              <p className="text-[14px]" style={{ color: MUTED }}>Loading…</p>
            ) : leads.length === 0 ? (
              <p className="text-[14px]" style={{ color: MUTED }}>No leads yet.</p>
            ) : (
              <ul className="space-y-2">
                {leads.map((l) => (
                  <li key={l.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(l)
                        setMobileOpen(true)
                      }}
                      className="w-full rounded border p-3 text-left"
                      style={{
                        borderColor: selected?.id === l.id ? ACCENT : BORDER,
                        background: selected?.id === l.id ? 'rgba(238,107,26,0.06)' : 'transparent',
                      }}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-[15px] font-semibold">{l.name || l.phone || 'Unnamed'}</span>
                        <span className="shrink-0 text-[11px]" style={{ color: MUTED }}>{day(l.createdAt)}</span>
                      </div>
                      {/* The whole point of this page: a source on every row. */}
                      <div className="mt-1 truncate text-[13px]" style={{ color: ACCENT }}>
                        {l.firstLabel ?? 'no signal captured'}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Pill tone={l.arm ? 'on' : 'off'}>arm {l.arm ?? '—'}</Pill>
                        {l.bookingSurface && <Pill tone="on">booked · {l.bookingSurface}</Pill>}
                        {!l.verified && <Pill tone="off">unverified</Pill>}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Detail */}
          <div className={`md:col-span-3 ${mobileOpen ? '' : 'hidden md:block'}`}>
            {!selected ? (
              <p className="text-[14px]" style={{ color: MUTED }}>Pick a lead to see how they got here.</p>
            ) : (
              <div className="space-y-4">
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  className="flex min-h-[44px] items-center gap-2 text-[14px] md:hidden"
                  style={{ color: MUTED }}
                >
                  <ArrowLeft size={16} /> All leads
                </button>

                <div>
                  <h2 className="text-[19px] font-bold">{selected.name || selected.phone || 'Unnamed'}</h2>
                  <p className="text-[13px]" style={{ color: MUTED }}>
                    {[selected.company, selected.trade, selected.phone, selected.email].filter(Boolean).join(' · ') || '—'}
                  </p>
                </div>

                {/* The sentence. Reads like a person wrote it, on purpose: this
                    is the line Jacob actually looks at. */}
                <div className="rounded border p-3" style={{ borderColor: ACCENT, background: 'rgba(238,107,26,0.06)' }}>
                  <div className="mb-1 font-mono text-[10px] uppercase tracking-wider" style={{ color: MUTED }}>
                    How they got here
                  </div>
                  <p className="text-[15px] leading-[1.55]">{selected.journey}</p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <TouchBlock label="First touch" touch={selected.first} />
                  <TouchBlock label="Last touch" touch={selected.last} />
                </div>

                <CameFrom lead={selected} />

                <div className="flex flex-wrap gap-1.5">
                  <Pill tone={selected.hasFbp ? 'on' : 'off'}>_fbp {selected.hasFbp ? 'yes' : 'no'}</Pill>
                  <Pill tone={selected.hasFbc ? 'on' : 'off'}>_fbc {selected.hasFbc ? 'yes' : 'no'}</Pill>
                  <Pill tone={selected.verified ? 'on' : 'off'}>
                    {selected.verified ? 'phone verified' : 'unverified'}
                  </Pill>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
