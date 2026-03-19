'use client'

import { useEffect, useState } from 'react'
import { Globe } from 'lucide-react'

type WebsiteLeadRow = {
  id: string
  name: string
  phone: string | null
  email: string | null
  message: string | null
  status: string
  createdAt: string
}

type LeadsResponse = {
  leads: WebsiteLeadRow[]
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  new: { label: 'New', bg: 'bg-blue-100', text: 'text-blue-800' },
  contacted: { label: 'Contacted', bg: 'bg-yellow-100', text: 'text-yellow-800' },
  converted: { label: 'Converted', bg: 'bg-green-100', text: 'text-green-800' },
  closed: { label: 'Closed', bg: 'bg-gray-100', text: 'text-gray-800' },
}

const STATUSES = ['new', 'contacted', 'converted', 'closed'] as const

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

export function WebsiteLeadsClient() {
  const [leads, setLeads] = useState<WebsiteLeadRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch('/api/dashboard/website-leads')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed to load leads'))))
      .then((d: LeadsResponse) => {
        if (!cancelled) setLeads(d.leads ?? [])
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message ?? 'Failed to load leads')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function updateStatus(leadId: string, status: string) {
    setUpdatingId(leadId)
    try {
      const res = await fetch('/api/dashboard/website-leads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, status }),
      })
      if (!res.ok) throw new Error('Failed to update status')
      const { lead } = await res.json()
      setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, status: lead.status } : l)))
    } catch {
      setError('Failed to update lead status')
    } finally {
      setUpdatingId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-gray-500">Loading...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-800">{error}</div>
    )
  }

  if (leads.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 text-center py-12">
        <Globe className="h-12 w-12 text-gray-300 mx-auto mb-4" />
        <p className="text-gray-500">
          No website leads yet. When someone fills out your contact form, they&apos;ll appear here.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
      {leads.map((lead) => {
        const cfg = STATUS_CONFIG[lead.status] ?? STATUS_CONFIG.new
        return (
          <div key={lead.id} className="px-6 py-4">
            <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-3">
                <p className="font-medium text-gray-900">{lead.name}</p>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.bg} ${cfg.text}`}
                >
                  {cfg.label}
                </span>
              </div>
              <p className="text-sm text-gray-500">{timeAgo(lead.createdAt)}</p>
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600 mb-2">
              {lead.phone && <span>{lead.phone}</span>}
              {lead.email && <span>{lead.email}</span>}
            </div>

            {lead.message && (
              <p className="text-sm text-gray-600 p-3 bg-gray-50 rounded-lg mb-3 line-clamp-2">
                {lead.message}
              </p>
            )}

            <div className="flex gap-1.5 flex-wrap">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  disabled={lead.status === s || updatingId === lead.id}
                  onClick={() => updateStatus(lead.id, s)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    lead.status === s
                      ? `${STATUS_CONFIG[s].bg} ${STATUS_CONFIG[s].text} cursor-default`
                      : 'bg-gray-50 text-gray-500 hover:bg-gray-100 disabled:opacity-50'
                  }`}
                >
                  {STATUS_CONFIG[s].label}
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
