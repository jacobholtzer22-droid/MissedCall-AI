'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Briefcase, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'invoiced', label: 'Invoiced' },
] as const

type JobRow = {
  id: string
  contactId: string
  contactName: string
  serviceName: string
  scheduledDate: string | null
  status: string
  amount: number | null
  createdAt: string
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

export function JobsClient() {
  const [jobs, setJobs] = useState<JobRow[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [stats, setStats] = useState({
    jobsThisMonth: 0,
    revenueThisMonth: 0,
    inProgress: 0,
  })
  const [newJobOpen, setNewJobOpen] = useState(false)

  const fetchJobs = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter)
    const res = await fetch(`/api/dashboard/jobs?${params}`)
    const data = await res.json()
    if (res.ok) {
      setJobs(data.jobs ?? [])
    }
    setLoading(false)
  }, [statusFilter])

  const fetchStats = useCallback(async () => {
    const res = await fetch('/api/dashboard/jobs')
    const data = await res.json()
    const list = data.jobs ?? []
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const jobsThisMonth = list.filter(
      (j: JobRow) => new Date(j.createdAt) >= startOfMonth
    ).length
    const revenueThisMonth = list
      .filter(
        (j: JobRow) =>
          (j.status === 'completed' || j.status === 'invoiced') &&
          new Date(j.createdAt) >= startOfMonth
      )
      .reduce((sum: number, j: JobRow) => sum + (j.amount ?? 0), 0)
    const inProgress = list.filter(
      (j: JobRow) => j.status === 'scheduled' || j.status === 'in_progress'
    ).length
    setStats({ jobsThisMonth, revenueThisMonth, inProgress })
  }, [])

  useEffect(() => {
    fetchJobs()
  }, [fetchJobs])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  async function handleCreateJob(payload: {
    contactId: string
    serviceName: string
    scheduledDate?: string
    amount?: number
    notes?: string
  }) {
    const res = await fetch('/api/dashboard/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (res.ok) {
      setNewJobOpen(false)
      fetchJobs()
      fetchStats()
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Jobs</h1>
          <p className="text-gray-500 mt-1">Services and jobs for your contacts</p>
        </div>
        <button
          type="button"
          onClick={() => setNewJobOpen(true)}
          className="inline-flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] w-full md:w-auto bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition font-medium"
        >
          <Plus className="h-4 w-4" />
          New Job
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-lg bg-gray-50 border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Jobs this month</p>
          <p className="text-2xl font-bold text-gray-900">{stats.jobsThisMonth}</p>
        </div>
        <div className="rounded-lg bg-gray-50 border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Revenue this month</p>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(stats.revenueThisMonth)}</p>
        </div>
        <div className="rounded-lg bg-blue-50 border border-blue-100 p-4">
          <p className="text-sm text-blue-600">Jobs in progress</p>
          <p className="text-2xl font-bold text-blue-700">{stats.inProgress}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-gray-200 pb-2">
        {STATUS_OPTIONS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => setStatusFilter(value)}
            className={cn(
              'px-3 py-2.5 min-h-[44px] md:min-h-0 rounded-lg text-sm font-medium transition',
              statusFilter === value ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-gray-500">Loading...</div>
        ) : jobs.length === 0 ? (
          <div className="py-16 text-center">
            <Briefcase className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No jobs match your filters.</p>
            <button
              type="button"
              onClick={() => setNewJobOpen(true)}
              className="mt-4 py-3 min-h-[44px] px-4 text-gray-900 font-medium rounded-lg hover:bg-gray-100"
            >
              Create your first job
            </button>
          </div>
        ) : (
          <>
            {/* Mobile: card list */}
            <div className="md:hidden divide-y divide-gray-100">
              {jobs.map((j) => (
                <Link
                  key={j.id}
                  href={`/dashboard/contacts/${j.contactId}`}
                  className="block p-4 hover:bg-gray-50"
                >
                  <p className="font-medium text-gray-900">{j.contactName}</p>
                  <p className="text-sm text-gray-600 mt-0.5">{j.serviceName}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span className="text-xs text-gray-500">
                      {j.scheduledDate
                        ? new Date(j.scheduledDate).toLocaleDateString()
                        : '—'}
                    </span>
                    <span
                      className={cn(
                        'inline-flex px-2 py-0.5 rounded-full text-xs font-medium',
                        j.status === 'completed' && 'bg-green-100 text-green-700',
                        j.status === 'invoiced' && 'bg-purple-100 text-purple-700',
                        j.status === 'scheduled' && 'bg-blue-100 text-blue-700',
                        j.status === 'in_progress' && 'bg-amber-100 text-amber-700',
                        j.status === 'cancelled' && 'bg-gray-100 text-gray-600'
                      )}
                    >
                      {j.status.replace(/_/g, ' ')}
                    </span>
                    {j.amount != null && (
                      <span className="text-sm font-medium text-gray-900">{formatCurrency(j.amount)}</span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
            {/* Desktop: table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Contact</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Service</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Scheduled Date</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Status</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j) => (
                    <tr key={j.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <Link
                          href={`/dashboard/contacts/${j.contactId}`}
                          className="font-medium text-gray-900 hover:underline"
                        >
                          {j.contactName}
                        </Link>
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-600">{j.serviceName}</td>
                      <td className="py-3 px-4 text-sm text-gray-600">
                        {j.scheduledDate
                          ? new Date(j.scheduledDate).toLocaleDateString()
                          : '—'}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={cn(
                            'inline-flex px-2 py-0.5 rounded-full text-xs font-medium',
                            j.status === 'completed' && 'bg-green-100 text-green-700',
                            j.status === 'invoiced' && 'bg-purple-100 text-purple-700',
                            j.status === 'scheduled' && 'bg-blue-100 text-blue-700',
                            j.status === 'in_progress' && 'bg-amber-100 text-amber-700',
                            j.status === 'cancelled' && 'bg-gray-100 text-gray-600'
                          )}
                        >
                          {j.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-600">
                        {j.amount != null ? formatCurrency(j.amount) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {newJobOpen && (
        <NewJobModal
          onClose={() => setNewJobOpen(false)}
          onSave={handleCreateJob}
        />
      )}
    </div>
  )
}

function NewJobModal({
  onClose,
  onSave,
}: {
  onClose: () => void
  onSave: (payload: {
    contactId: string
    serviceName: string
    scheduledDate?: string
    amount?: number
    notes?: string
  }) => Promise<void>
}) {
  const [contacts, setContacts] = useState<{ id: string; name: string | null; phoneNumber: string }[]>([])
  const [contactId, setContactId] = useState('')
  const [serviceName, setServiceName] = useState('')
  const [scheduledDate, setScheduledDate] = useState('')
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/dashboard/contacts')
      .then((r) => r.json())
      .then((data) => {
        const list = data.contacts ?? []
        setContacts(list)
        if (list.length && !contactId) setContactId(list[0].id)
      })
      .catch(() => {})
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!contactId || !serviceName.trim()) return
    setSaving(true)
    try {
      await onSave({
        contactId,
        serviceName: serviceName.trim(),
        scheduledDate: scheduledDate || undefined,
        amount: amount ? parseFloat(amount) : undefined,
        notes: notes.trim() || undefined,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-4 bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-none md:rounded-xl shadow-xl max-w-md w-full h-full md:h-auto md:max-h-[90vh] overflow-y-auto flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 md:p-6 border-b border-gray-200 flex items-center justify-between gap-3 shrink-0">
          <div>
            <h2 className="text-xl font-bold text-gray-900">New Job</h2>
            <p className="text-sm text-gray-500 mt-1">Create a job for a contact</p>
          </div>
          <button type="button" onClick={onClose} className="md:hidden min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-600" aria-label="Close">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 md:p-6 space-y-4 flex-1 overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contact *</label>
            <select
              value={contactId}
              onChange={(e) => setContactId(e.target.value)}
              className="w-full px-3 py-3 min-h-[44px] border border-gray-200 rounded-lg text-gray-900"
              required
            >
              <option value="">Select contact</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name || c.phoneNumber || c.id}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Service *</label>
            <input
              type="text"
              value={serviceName}
              onChange={(e) => setServiceName(e.target.value)}
              placeholder="e.g. Lawn mowing"
              className="w-full px-3 py-3 min-h-[44px] border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Scheduled date</label>
            <input
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              className="w-full px-3 py-3 min-h-[44px] border border-gray-200 rounded-lg text-gray-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount ($)</label>
            <input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-3 py-3 min-h-[44px] border border-gray-200 rounded-lg text-gray-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-3 min-h-[44px] border border-gray-200 rounded-lg text-gray-900"
            />
          </div>
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className="px-4 py-3 min-h-[44px] text-gray-700 hover:bg-gray-100 rounded-lg">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-3 min-h-[44px] bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50"
            >
              {saving ? 'Creating...' : 'Create Job'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
