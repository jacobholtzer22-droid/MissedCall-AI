'use client'

// ===========================================
// ADMIN: SPAM / SCORED LEADS
// ===========================================
// READ ONLY. No mutations anywhere on this page — auditing false positives must
// not be able to change client data. To rescue a wrongly-condemned lead, edit the
// row's status directly in the database.
//
// Shows scored submissions across ALL tenants, condemned and not. The default
// filter is >= 70 rather than >= threshold, because the interesting rows during
// the tuning period are the near misses in both directions.

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, RefreshCw, ShieldAlert } from 'lucide-react'

interface SpamLead {
  id: string
  businessName: string
  name: string
  phone: string | null
  email: string | null
  message: string | null
  status: string
  spamScore: number | null
  reasons: string[]
  sourceIp: string | null
  userAgent: string | null
  createdAt: string
}

const FILTERS = [
  { key: 0, label: 'All scored' },
  { key: 70, label: 'Score 70+' },
  { key: -1, label: 'Condemned only' },
] as const

function scoreColor(score: number | null, threshold: number): string {
  if (score === null) return 'text-gray-500'
  if (score >= threshold) return 'text-red-400'
  if (score >= 70) return 'text-amber-400'
  return 'text-gray-400'
}

function formatWhen(iso: string): string {
  const d = new Date(iso)
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
}

export default function AdminSpamPage() {
  const router = useRouter()
  const [leads, setLeads] = useState<SpamLead[]>([])
  const [threshold, setThreshold] = useState(100)
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<number>(70)
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(async (min: number) => {
    setLoading(true)
    setError(null)
    try {
      // "Condemned only" is applied client-side against the live threshold so the
      // filter keeps working if SPAM_SCORE_THRESHOLD is retuned.
      const query = min > 0 ? `?minScore=${min}` : ''
      const res = await fetch(`/api/admin/spam-leads${query}`)
      if (!res.ok) throw new Error(`Request failed (${res.status})`)
      const data = await res.json()
      setThreshold(data.threshold)
      setTruncated(Boolean(data.truncated))
      setLeads(data.leads as SpamLead[])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(filter > 0 ? filter : 0)
  }, [filter, load])

  const visible =
    filter === -1 ? leads.filter((l) => (l.spamScore ?? 0) >= threshold) : leads

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-4 sm:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <button
            onClick={() => router.push('/admin')}
            className="flex items-center gap-1.5 px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-sm font-medium transition"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Admin
          </button>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-400" />
            Scored submissions
          </h1>
          <span className="text-sm text-gray-500">threshold {threshold}</span>
          <button
            onClick={() => void load(filter > 0 ? filter : 0)}
            className="ml-auto flex items-center gap-1.5 px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-sm font-medium transition"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        <div className="flex gap-2 mb-4 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`whitespace-nowrap flex-shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
                filter === f.key
                  ? 'bg-gray-100 text-gray-900 border-gray-100'
                  : 'bg-gray-900 text-gray-300 border-gray-700 hover:bg-gray-800'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {error && (
          <p className="mb-4 text-sm text-red-400">{error}</p>
        )}
        {truncated && (
          <p className="mb-4 text-xs text-amber-400">
            Showing the most recent 200 rows only — older matches are not listed.
          </p>
        )}

        {loading && leads.length === 0 ? (
          <p className="text-gray-500 text-sm">Loading…</p>
        ) : visible.length === 0 ? (
          <p className="text-gray-500 text-sm">
            Nothing scored at this level yet. Rows appear here once /api/contact receives
            submissions after the scoring deploy.
          </p>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-gray-800 border border-gray-800 rounded-xl overflow-hidden">
              {visible.map((l) => (
                <div key={l.id} className="p-4 bg-gray-900">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-semibold">{l.name}</span>
                    <span className={`font-mono text-sm ${scoreColor(l.spamScore, threshold)}`}>
                      {l.spamScore ?? '—'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {l.businessName} · {formatWhen(l.createdAt)} · {l.status}
                  </p>
                  <p className="text-xs text-gray-400 mt-1 break-all">
                    {l.phone || 'no phone'} · {l.email || 'no email'}
                  </p>
                  <p className="text-xs text-amber-400/80 mt-1">{l.reasons.join(', ') || 'no signals'}</p>
                  <p className="text-sm text-gray-300 mt-2 whitespace-pre-wrap break-words">
                    {l.message || <span className="text-gray-600">no message</span>}
                  </p>
                  <p className="text-[11px] text-gray-600 mt-2 break-all">
                    {l.sourceIp || 'no ip'} · {l.userAgent || 'no user agent'}
                  </p>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block border border-gray-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-900 text-gray-400 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="text-left font-medium px-3 py-2.5">When</th>
                    <th className="text-left font-medium px-3 py-2.5">Business</th>
                    <th className="text-right font-medium px-3 py-2.5">Score</th>
                    <th className="text-left font-medium px-3 py-2.5">Reasons</th>
                    <th className="text-left font-medium px-3 py-2.5">Name</th>
                    <th className="text-left font-medium px-3 py-2.5">Contact</th>
                    <th className="text-left font-medium px-3 py-2.5">Message</th>
                    <th className="text-left font-medium px-3 py-2.5">Origin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {visible.map((l) => {
                    const open = expanded === l.id
                    return (
                      <tr
                        key={l.id}
                        onClick={() => setExpanded(open ? null : l.id)}
                        className="bg-gray-950 hover:bg-gray-900 cursor-pointer align-top"
                      >
                        <td className="px-3 py-2.5 text-gray-400 whitespace-nowrap">{formatWhen(l.createdAt)}</td>
                        <td className="px-3 py-2.5 text-gray-300">{l.businessName}</td>
                        <td className={`px-3 py-2.5 text-right font-mono ${scoreColor(l.spamScore, threshold)}`}>
                          {l.spamScore ?? '—'}
                        </td>
                        <td className="px-3 py-2.5 text-amber-400/80 text-xs max-w-[220px]">
                          {l.reasons.join(', ') || '—'}
                        </td>
                        <td className="px-3 py-2.5">{l.name}</td>
                        <td className="px-3 py-2.5 text-gray-400 text-xs break-all max-w-[180px]">
                          {l.phone || '—'}
                          <br />
                          {l.email || '—'}
                        </td>
                        <td className={`px-3 py-2.5 text-gray-300 max-w-[320px] ${open ? 'whitespace-pre-wrap break-words' : 'truncate'}`}>
                          {l.message || '—'}
                        </td>
                        <td className="px-3 py-2.5 text-gray-600 text-[11px] break-all max-w-[200px]">
                          {l.sourceIp || '—'}
                          <br />
                          <span className={open ? '' : 'line-clamp-1'}>{l.userAgent || '—'}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-600 mt-3">
              Click a row to expand the full message and user agent. This view is read only.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
