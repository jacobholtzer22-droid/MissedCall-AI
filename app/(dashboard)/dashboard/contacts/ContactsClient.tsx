'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Users, Plus, Search, Upload } from 'lucide-react'
import { formatPhoneNumber, formatRelativeTime } from '@/lib/utils'
import { cn } from '@/lib/utils'

const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'quoted', label: 'Quoted' },
  { value: 'booked', label: 'Booked' },
  { value: 'completed', label: 'Completed' },
  { value: 'lost', label: 'Lost' },
] as const

const SOURCE_COLORS: Record<string, string> = {
  missed_call: 'bg-orange-100 text-orange-800 border border-orange-200',
  website_form: 'bg-blue-100 text-blue-800 border border-blue-200',
  referral: 'bg-green-100 text-green-800 border border-green-200',
  google_ad: 'bg-purple-100 text-purple-800 border border-purple-200',
  jobber_import: 'bg-yellow-100 text-yellow-800 border border-yellow-200',
  manual: 'bg-gray-100 text-gray-800 border border-gray-200',
  sms_conversation: 'bg-indigo-100 text-indigo-700',
  servicetitan_import: 'bg-teal-100 text-teal-800 border border-teal-200',
  housecallpro_import: 'bg-indigo-100 text-indigo-800 border border-indigo-200',
  quickbooks_import: 'bg-green-100 text-green-800 border border-green-200',
  square_import: 'bg-slate-100 text-slate-800 border border-slate-200',
  google_contacts_import: 'bg-red-100 text-red-800 border border-red-200',
  excel_import: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
  other_crm_import: 'bg-cyan-100 text-cyan-800 border border-cyan-200',
  manual_list: 'bg-gray-100 text-gray-800 border border-gray-200',
}

const SOURCE_LABELS: Record<string, string> = {
  missed_call: 'Missed Call',
  website_form: 'Website Form',
  referral: 'Referral',
  google_ad: 'Google Ad',
  jobber_import: 'Jobber Import',
  manual: 'Manual Entry',
  servicetitan_import: 'ServiceTitan',
  housecallpro_import: 'Housecall Pro',
  quickbooks_import: 'QuickBooks',
  square_import: 'Square',
  google_contacts_import: 'Google Contacts',
  excel_import: 'Excel Import',
  other_crm_import: 'Other CRM',
  manual_list: 'Manual List',
}

const ADD_CONTACT_SOURCE_OPTIONS = [
  { value: 'website_form', label: 'Website Form' },
  { value: 'missed_call', label: 'Missed Call' },
  { value: 'referral', label: 'Referral' },
  { value: 'google_ad', label: 'Google Ad' },
  { value: 'jobber_import', label: 'Jobber Import' },
  { value: 'manual', label: 'Manual Entry' },
] as const

const STATUS_COLORS: Record<string, string> = {
  new: 'bg-gray-100 text-gray-700',
  contacted: 'bg-sky-100 text-sky-700',
  quoted: 'bg-amber-100 text-amber-700',
  booked: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  lost: 'bg-red-100 text-red-700',
}

type ContactRow = {
  id: string
  name: string | null
  phoneNumber: string
  email: string | null
  source: string | null
  status: string
  tags: { id: string; name: string; color: string | null }[]
  lastContactedAt: string | null
  totalRevenue: number
  updatedAt: string
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

function displayPhone(phone: string) {
  if (phone.startsWith('__email_only__')) return '—'
  return formatPhoneNumber(phone)
}

export function ContactsClient() {
  const [contacts, setContacts] = useState<ContactRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null)

  const fetchContacts = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter)
    const res = await fetch(`/api/dashboard/contacts?${params}`)
    const data = await res.json()
    if (res.ok) {
      setContacts(data.contacts ?? [])
      setTotal(data.total ?? 0)
    }
    setLoading(false)
  }, [search, statusFilter])

  useEffect(() => {
    fetchContacts()
  }, [fetchContacts])

  async function handleStatusChange(contactId: string, newStatus: string) {
    setUpdatingStatusId(contactId)
    try {
      const res = await fetch(`/api/dashboard/contacts/${contactId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (res.ok) await fetchContacts()
    } finally {
      setUpdatingStatusId(null)
    }
  }

  async function handleAddContact(formData: Record<string, string>) {
    const res = await fetch('/api/dashboard/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
        name: formData.name || undefined,
        phone: formData.phone || undefined,
        email: formData.email || undefined,
        address: formData.address || undefined,
        city: formData.city || undefined,
        state: formData.state || undefined,
        zip: formData.zip || undefined,
        source: formData.source || undefined,
        notes: formData.notes || undefined,
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Failed to add contact')
    }
    setAddModalOpen(false)
    fetchContacts()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contacts</h1>
          <p className="text-gray-500 mt-1">Manage your contacts and leads</p>
        </div>
        <div className="flex flex-col gap-2 w-full md:w-auto md:flex-row md:items-center">
          <Link
            href="/dashboard/contacts/import"
            className="inline-flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] w-full md:w-auto border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition font-medium"
          >
            <Upload className="h-4 w-4" />
            Import Contacts
          </Link>
          <button
            type="button"
            onClick={() => setAddModalOpen(true)}
            className="inline-flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] w-full md:w-auto bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition font-medium"
          >
            <Plus className="h-4 w-4" />
            Add Contact
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name, phone, or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-3 min-h-[44px] border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-gray-900 focus:border-transparent"
          />
        </div>
        <div className="flex flex-wrap gap-1 border-b border-gray-200 pb-2 md:border-0 md:pb-0">
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
      </div>

      <div className="rounded-lg bg-gray-50 border border-gray-200 p-4">
        <span className="text-sm text-gray-500">Total contacts: </span>
        <span className="font-semibold text-gray-900">{total}</span>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-gray-500">Loading...</div>
        ) : contacts.length === 0 ? (
          <div className="py-16 text-center">
            <Users className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No contacts match your filters.</p>
            <button
              type="button"
              onClick={() => setAddModalOpen(true)}
              className="mt-4 py-3 min-h-[44px] px-4 text-gray-900 font-medium rounded-lg hover:bg-gray-100"
            >
              Add your first contact
            </button>
          </div>
        ) : (
          <>
            {/* Mobile: card list */}
            <div className="md:hidden divide-y divide-gray-100">
              {contacts.map((c) => (
                <div key={c.id} className="p-4 hover:bg-gray-50">
                  <Link href={`/dashboard/contacts/${c.id}`} className="block">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-gray-900 truncate">
                        {c.name || displayPhone(c.phoneNumber) || '—'}
                      </p>
                      <span
                        className={cn(
                          'shrink-0 inline-flex px-2.5 py-1 rounded-md text-xs font-semibold uppercase tracking-wide',
                          SOURCE_COLORS[c.source ?? 'manual'] ?? 'bg-gray-100 text-gray-700'
                        )}
                      >
                        {SOURCE_LABELS[c.source ?? 'manual'] ?? (c.source ?? 'manual').replace(/_/g, ' ')}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mt-0.5">{displayPhone(c.phoneNumber)}</p>
                  </Link>
                  <div className="flex flex-wrap items-center gap-2 mt-2" onClick={(e) => e.stopPropagation()}>
                    <select
                      value={c.status}
                      onChange={(e) => handleStatusChange(c.id, e.target.value)}
                      disabled={updatingStatusId === c.id}
                      className={cn(
                        'text-sm rounded-lg border border-gray-200 px-2 py-2 min-h-[44px] font-medium',
                        STATUS_COLORS[c.status] ?? 'bg-gray-100 text-gray-700',
                        'text-gray-900'
                      )}
                    >
                      {STATUS_OPTIONS.filter((o) => o.value !== 'all').map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    {c.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {c.tags.slice(0, 2).map((t) => (
                          <span
                            key={t.id}
                            className="text-xs px-2 py-0.5 rounded-full"
                            style={{ backgroundColor: t.color ? `${t.color}20` : undefined, color: t.color || '#374151' }}
                          >
                            {t.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {/* Desktop: table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Name</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Phone</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Email</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Source</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Status</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Tags</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Last Contacted</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Total Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((c) => (
                    <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <Link href={`/dashboard/contacts/${c.id}`} className="font-medium text-gray-900 hover:underline block">
                          {c.name || displayPhone(c.phoneNumber) || '—'}
                        </Link>
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-600">{displayPhone(c.phoneNumber)}</td>
                      <td className="py-3 px-4 text-sm text-gray-600">{c.email || '—'}</td>
                      <td className="py-3 px-4">
                        <span
                          className={cn(
                            'inline-flex px-2.5 py-1 rounded-md text-xs font-semibold uppercase tracking-wide',
                            SOURCE_COLORS[c.source ?? 'manual'] ?? 'bg-gray-100 text-gray-700'
                          )}
                        >
                          {SOURCE_LABELS[c.source ?? 'manual'] ?? (c.source ?? 'manual').replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <select
                          value={c.status}
                          onChange={(e) => handleStatusChange(c.id, e.target.value)}
                          disabled={updatingStatusId === c.id}
                          className={cn(
                            'text-sm rounded-lg border border-gray-200 px-2 py-1 font-medium',
                            STATUS_COLORS[c.status] ?? 'bg-gray-100 text-gray-700',
                            'text-gray-900'
                          )}
                        >
                          {STATUS_OPTIONS.filter((o) => o.value !== 'all').map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap gap-1">
                          {c.tags.length
                            ? c.tags.map((t) => (
                                <span
                                  key={t.id}
                                  className="text-xs px-2 py-0.5 rounded-full"
                                  style={{ backgroundColor: t.color ? `${t.color}20` : undefined, color: t.color || '#374151' }}
                                >
                                  {t.name}
                                </span>
                              ))
                            : '—'}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-600">
                        {c.lastContactedAt ? formatRelativeTime(new Date(c.lastContactedAt)) : '—'}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-600">{formatCurrency(c.totalRevenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {addModalOpen && (
        <AddContactModal
          onClose={() => setAddModalOpen(false)}
          onSuccess={handleAddContact}
        />
      )}
    </div>
  )
}

function AddContactModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void
  onSuccess: (formData: Record<string, string>) => Promise<void>
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<Record<string, string>>({
    name: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    source: '',
    notes: '',
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!form.source?.trim()) {
      setError('Please select a source for this contact.')
      return
    }
    setSaving(true)
    try {
      await onSuccess(form)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-4 bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-none md:rounded-xl shadow-xl max-w-lg w-full h-full md:h-auto md:max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 md:p-6 border-b border-gray-200 flex items-center justify-between gap-3 shrink-0">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Add Contact</h2>
            <p className="text-sm text-gray-500 mt-1">Add a new contact to your CRM</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="md:hidden shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-600"
            aria-label="Close"
          >
            <span className="text-lg font-bold">×</span>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 md:p-6 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full px-3 py-3 min-h-[44px] border border-gray-200 rounded-lg text-gray-900 focus:ring-2 focus:ring-gray-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              className="w-full px-3 py-3 min-h-[44px] border border-gray-200 rounded-lg text-gray-900 focus:ring-2 focus:ring-gray-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className="w-full px-3 py-3 min-h-[44px] border border-gray-200 rounded-lg text-gray-900 focus:ring-2 focus:ring-gray-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
            <input
              type="text"
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              className="w-full px-3 py-3 min-h-[44px] border border-gray-200 rounded-lg text-gray-900 focus:ring-2 focus:ring-gray-900"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
              <input
                type="text"
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                className="w-full px-3 py-3 min-h-[44px] border border-gray-200 rounded-lg text-gray-900 focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
              <input
                type="text"
                value={form.state}
                onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
                className="w-full px-3 py-3 min-h-[44px] border border-gray-200 rounded-lg text-gray-900 focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Zip</label>
              <input
                type="text"
                value={form.zip}
                onChange={(e) => setForm((f) => ({ ...f, zip: e.target.value }))}
                className="w-full px-3 py-3 min-h-[44px] border border-gray-200 rounded-lg text-gray-900 focus:ring-2 focus:ring-gray-900"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Source <span className="text-red-500">*</span>
            </label>
            <select
              value={form.source}
              onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
              required
              className="w-full px-3 py-3 min-h-[44px] border border-gray-200 rounded-lg text-gray-900 focus:ring-2 focus:ring-gray-900"
            >
              <option value="">Select source...</option>
              {ADD_CONTACT_SOURCE_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={3}
              className="w-full px-3 py-3 min-h-[44px] border border-gray-200 rounded-lg text-gray-900 focus:ring-2 focus:ring-gray-900"
            />
          </div>
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-3 min-h-[44px] text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-3 min-h-[44px] bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50"
            >
              {saving ? 'Adding...' : 'Add Contact'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
