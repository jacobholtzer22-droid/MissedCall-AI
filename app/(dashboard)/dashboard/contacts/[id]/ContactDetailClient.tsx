'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  MessageSquare,
  Briefcase,
  StickyNote,
  Plus,
  Pencil,
  PhoneMissed,
  FileText,
  Mail as MailIcon,
} from 'lucide-react'
import { formatPhoneNumber, formatRelativeTime } from '@/lib/utils'
import { cn } from '@/lib/utils'

const STATUS_OPTIONS = ['new', 'contacted', 'quoted', 'booked', 'completed', 'lost'] as const
const STATUS_COLORS: Record<string, string> = {
  new: 'bg-gray-100 text-gray-700',
  contacted: 'bg-sky-100 text-sky-700',
  quoted: 'bg-amber-100 text-amber-700',
  booked: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  lost: 'bg-red-100 text-red-700',
}

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

const ACTIVITY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  missed_call: PhoneMissed,
  sms_conversation: MessageSquare,
  voicemail: Phone,
  website_form: FileText,
  email_sent: MailIcon,
  job_created: Briefcase,
  job_completed: Briefcase,
  note_added: StickyNote,
  status_changed: Pencil,
  manual: UserIcon,
}

function UserIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  )
}

type Activity = { id: string; type: string; description: string; createdAt: string }
type Job = { id: string; serviceName: string; status: string; scheduledDate: string | null; amount: number | null; completedDate: string | null }
type Conversation = { id: string; callerPhone: string; status: string; lastMessageAt: string; lastMessage: string | null }

type ContactDetail = {
  id: string
  name: string | null
  phoneNumber: string
  email: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  source: string | null
  status: string
  notes: string | null
  lastContactedAt: string | null
  totalRevenue: number
  tags: { id: string; name: string; color: string | null }[]
  activities: Activity[]
  jobs: Job[]
  conversations: Conversation[]
}

function displayPhone(phone: string) {
  if (phone.startsWith('__email_only__')) return '—'
  return formatPhoneNumber(phone)
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

export function ContactDetailClient({ contact: initialContact }: { contact: ContactDetail }) {
  const [contact, setContact] = useState(initialContact)
  const [editOpen, setEditOpen] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [jobModalOpen, setJobModalOpen] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)

  async function refreshContact() {
    const res = await fetch(`/api/dashboard/contacts/${initialContact.id}`)
    if (res.ok) {
      const data = await res.json()
      setContact(data.contact)
    }
  }

  async function handleStatusChange(newStatus: string) {
    setUpdatingStatus(true)
    try {
      const res = await fetch(`/api/dashboard/contacts/${initialContact.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (res.ok) setContact((c) => ({ ...c, status: newStatus }))
    } finally {
      setUpdatingStatus(false)
    }
  }

  async function handleEditSubmit(formData: Record<string, string | null>) {
    const res = await fetch(`/api/dashboard/contacts/${initialContact.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    })
    if (res.ok) {
      const data = await res.json()
      setContact((c) => ({ ...c, ...data.contact }))
      setEditOpen(false)
    }
  }

  async function handleAddNote(content: string) {
    const res = await fetch(`/api/dashboard/contacts/${initialContact.id}/activities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    })
    if (res.ok) {
      await refreshContact()
      setNoteOpen(false)
    }
  }

  async function handleAddJob(payload: { serviceName: string; scheduledDate?: string; amount?: number; notes?: string }) {
    const res = await fetch('/api/dashboard/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contactId: initialContact.id, ...payload }),
    })
    if (res.ok) {
      await refreshContact()
      setJobModalOpen(false)
    }
  }

  const fullAddress = [contact.address, [contact.city, contact.state, contact.zip].filter(Boolean).join(', ')]
    .filter(Boolean)
    .join(', ')

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/contacts"
          className="p-2 hover:bg-gray-100 rounded-lg transition"
        >
          <ArrowLeft className="h-5 w-5 text-gray-500" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 truncate">
            {contact.name || displayPhone(contact.phoneNumber) || 'Contact'}
          </h1>
          <p className="text-gray-500 text-sm mt-0.5 flex items-center gap-2 flex-wrap">
            {contact.source && (
              <span
                className={cn(
                  'inline-flex px-2.5 py-0.5 rounded-md text-xs font-semibold uppercase tracking-wide',
                  SOURCE_COLORS[contact.source] ?? 'bg-gray-100 text-gray-700'
                )}
              >
                {SOURCE_LABELS[contact.source] ?? contact.source.replace(/_/g, ' ')}
              </span>
            )}
            <span>
              Last contacted {contact.lastContactedAt ? formatRelativeTime(new Date(contact.lastContactedAt)) : 'never'}
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditOpen(true)}
          className="inline-flex items-center justify-center gap-2 px-3 py-3 min-h-[44px] md:min-h-0 md:py-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-sm font-medium"
        >
          <Pencil className="h-4 w-4" />
          Edit
        </button>
      </div>

      {/* Contact info card - stacked on mobile */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6">
        <div className="flex flex-col gap-4 md:grid md:grid-cols-2 md:gap-6">
          <div>
            <p className="text-sm text-gray-500 flex items-center gap-2">
              <Phone className="h-4 w-4" />
              {displayPhone(contact.phoneNumber)}
            </p>
            {contact.email && (
              <p className="text-sm text-gray-500 flex items-center gap-2 mt-2">
                <Mail className="h-4 w-4" />
                <a href={`mailto:${contact.email}`} className="text-gray-900 hover:underline">
                  {contact.email}
                </a>
              </p>
            )}
            {fullAddress && (
              <p className="text-sm text-gray-500 flex items-center gap-2 mt-2">
                <MapPin className="h-4 w-4" />
                {fullAddress}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-gray-700">Status</span>
            <select
              value={contact.status}
              onChange={(e) => handleStatusChange(e.target.value)}
              disabled={updatingStatus}
              className={cn(
                'text-sm rounded-lg border border-gray-200 px-3 py-3 min-h-[44px] md:min-h-0 md:py-1.5 font-medium',
                STATUS_COLORS[contact.status] ?? 'bg-gray-100 text-gray-700',
                'text-gray-900'
              )}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
            {contact.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {contact.tags.map((t) => (
                  <span
                    key={t.id}
                    className="text-xs px-2 py-0.5 rounded-full"
                    style={{
                      backgroundColor: t.color ? `${t.color}20` : undefined,
                      color: t.color || '#374151',
                    }}
                  >
                    {t.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        {contact.notes && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-sm font-medium text-gray-700 mb-1">Notes</p>
            <p className="text-sm text-gray-600 whitespace-pre-wrap">{contact.notes}</p>
          </div>
        )}
      </div>

      {/* Activity Timeline */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Activity</h2>
          <button
            type="button"
            onClick={() => setNoteOpen(true)}
            className="inline-flex items-center justify-center gap-2 px-3 py-3 min-h-[44px] md:min-h-0 md:py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
          >
            <StickyNote className="h-4 w-4" />
            Add Note
          </button>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {contact.activities.length === 0 ? (
            <div className="py-8 text-center text-gray-500 text-sm">No activity yet.</div>
          ) : (
            contact.activities.map((a) => {
              const Icon = ACTIVITY_ICONS[a.type] ?? StickyNote
              return (
                <div key={a.id} className="flex gap-4 px-6 py-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                    <Icon className="h-5 w-5 text-gray-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900">{a.description}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {formatRelativeTime(new Date(a.createdAt))}
                    </p>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Conversations */}
      {contact.conversations.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Conversations</h2>
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {contact.conversations.map((conv) => (
              <Link
                key={conv.id}
                href={`/dashboard/conversations/${conv.id}`}
                className="flex items-center justify-between px-6 py-4 hover:bg-gray-50"
              >
                <div className="flex items-center gap-3">
                  <MessageSquare className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {displayPhone(conv.callerPhone)} • {conv.status.replace(/_/g, ' ')}
                    </p>
                    {conv.lastMessage && (
                      <p className="text-sm text-gray-500 truncate max-w-md">{conv.lastMessage}</p>
                    )}
                  </div>
                </div>
                <span className="text-xs text-gray-500">{formatRelativeTime(new Date(conv.lastMessageAt))}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Jobs */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Jobs</h2>
          <button
            type="button"
            onClick={() => setJobModalOpen(true)}
            className="inline-flex items-center justify-center gap-2 px-3 py-3 min-h-[44px] md:min-h-0 md:py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
          >
            <Plus className="h-4 w-4" />
            Add Job
          </button>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {contact.jobs.length === 0 ? (
            <div className="py-8 text-center text-gray-500 text-sm">No jobs yet.</div>
          ) : (
            <>
              {/* Mobile: card list for jobs */}
              <div className="md:hidden divide-y divide-gray-100">
                {contact.jobs.map((j) => (
                  <div key={j.id} className="p-4">
                    <p className="font-medium text-gray-900">{j.serviceName}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <span
                        className={cn(
                          'text-xs px-2 py-0.5 rounded-full font-medium',
                          j.status === 'completed' && 'bg-green-100 text-green-700',
                          j.status === 'scheduled' && 'bg-blue-100 text-blue-700',
                          j.status === 'in_progress' && 'bg-amber-100 text-amber-700',
                          j.status === 'cancelled' && 'bg-gray-100 text-gray-600',
                          j.status === 'invoiced' && 'bg-purple-100 text-purple-700'
                        )}
                      >
                        {j.status.replace(/_/g, ' ')}
                      </span>
                      <span className="text-sm text-gray-600">
                        {j.scheduledDate
                          ? new Date(j.scheduledDate).toLocaleDateString()
                          : j.completedDate
                          ? new Date(j.completedDate).toLocaleDateString()
                          : '—'}
                      </span>
                      {j.amount != null && (
                        <span className="text-sm text-gray-600">{formatCurrency(j.amount)}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <table className="w-full hidden md:table">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Service</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Status</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Date</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Amount</th>
                </tr>
              </thead>
              <tbody>
                {contact.jobs.map((j) => (
                  <tr key={j.id} className="border-b border-gray-100">
                    <td className="py-3 px-4 font-medium text-gray-900">{j.serviceName}</td>
                    <td className="py-3 px-4">
                      <span
                        className={cn(
                          'text-xs px-2 py-0.5 rounded-full font-medium',
                          j.status === 'completed' && 'bg-green-100 text-green-700',
                          j.status === 'scheduled' && 'bg-blue-100 text-blue-700',
                          j.status === 'in_progress' && 'bg-amber-100 text-amber-700',
                          j.status === 'cancelled' && 'bg-gray-100 text-gray-600',
                          j.status === 'invoiced' && 'bg-purple-100 text-purple-700'
                        )}
                      >
                        {j.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600">
                      {j.scheduledDate
                        ? new Date(j.scheduledDate).toLocaleDateString()
                        : j.completedDate
                        ? new Date(j.completedDate).toLocaleDateString()
                        : '—'}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600">
                      {j.amount != null ? formatCurrency(j.amount) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </>
          )}
        </div>
      </div>

      {editOpen && (
        <EditContactModal
          contact={contact}
          onClose={() => setEditOpen(false)}
          onSave={handleEditSubmit}
        />
      )}
      {noteOpen && (
        <AddNoteModal
          onClose={() => setNoteOpen(false)}
          onSave={handleAddNote}
        />
      )}
      {jobModalOpen && (
        <AddJobModal
          onClose={() => setJobModalOpen(false)}
          onSave={handleAddJob}
        />
      )}
    </div>
  )
}

function EditContactModal({
  contact,
  onClose,
  onSave,
}: {
  contact: ContactDetail
  onClose: () => void
  onSave: (data: Record<string, string | null>) => Promise<void>
}) {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: contact.name ?? '',
    phoneNumber: contact.phoneNumber.startsWith('__email_only__') ? '' : contact.phoneNumber,
    email: contact.email ?? '',
    address: contact.address ?? '',
    city: contact.city ?? '',
    state: contact.state ?? '',
    zip: contact.zip ?? '',
    source: contact.source ?? 'manual',
    status: contact.status,
    notes: contact.notes ?? '',
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await onSave({
        name: form.name || null,
        phoneNumber: form.phoneNumber || null,
        email: form.email || null,
        address: form.address || null,
        city: form.city || null,
        state: form.state || null,
        zip: form.zip || null,
        source: form.source || null,
        status: form.status,
        notes: form.notes || null,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-4 bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-none md:rounded-xl shadow-xl max-w-lg w-full h-full md:h-auto md:max-h-[90vh] overflow-y-auto flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 md:p-6 border-b border-gray-200 flex items-center justify-between gap-3 shrink-0">
          <h2 className="text-xl font-bold text-gray-900">Edit Contact</h2>
          <button type="button" onClick={onClose} className="md:hidden min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-600" aria-label="Close">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 md:p-6 space-y-4 flex-1 overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full px-3 py-3 min-h-[44px] border border-gray-200 rounded-lg text-gray-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <input
              type="tel"
              value={form.phoneNumber}
              onChange={(e) => setForm((f) => ({ ...f, phoneNumber: e.target.value }))}
              className="w-full px-3 py-3 min-h-[44px] border border-gray-200 rounded-lg text-gray-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className="w-full px-3 py-3 min-h-[44px] border border-gray-200 rounded-lg text-gray-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
            <input
              type="text"
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              className="w-full px-3 py-3 min-h-[44px] border border-gray-200 rounded-lg text-gray-900"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
              <input
                type="text"
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                className="w-full px-3 py-3 min-h-[44px] border border-gray-200 rounded-lg text-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
              <input
                type="text"
                value={form.state}
                onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
                className="w-full px-3 py-3 min-h-[44px] border border-gray-200 rounded-lg text-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Zip</label>
              <input
                type="text"
                value={form.zip}
                onChange={(e) => setForm((f) => ({ ...f, zip: e.target.value }))}
                className="w-full px-3 py-3 min-h-[44px] border border-gray-200 rounded-lg text-gray-900"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Source</label>
            <select
              value={form.source}
              onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
              className="w-full px-3 py-3 min-h-[44px] border border-gray-200 rounded-lg text-gray-900"
            >
              <option value="manual">Manual</option>
              <option value="missed_call">Missed Call</option>
              <option value="website_form">Website Form</option>
              <option value="referral">Referral</option>
              <option value="google_ad">Google Ad</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
              className="w-full px-3 py-3 min-h-[44px] border border-gray-200 rounded-lg text-gray-900"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={3}
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
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function AddNoteModal({ onClose, onSave }: { onClose: () => void; onSave: (content: string) => Promise<void> }) {
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await onSave(content.trim() || 'Note added')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-4 bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-none md:rounded-xl shadow-xl max-w-md w-full h-full md:h-auto md:max-h-[90vh] flex flex-col p-4 md:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 shrink-0 mb-4">
          <h2 className="text-lg font-bold text-gray-900">Add Note</h2>
          <button type="button" onClick={onClose} className="md:hidden min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-600" aria-label="Close">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-y-auto">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Enter note..."
            rows={4}
            className="w-full px-3 py-3 min-h-[44px] border border-gray-200 rounded-lg mb-4 text-gray-900 placeholder-gray-400"
          />
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 mt-auto">
            <button type="button" onClick={onClose} className="px-4 py-3 min-h-[44px] text-gray-700 hover:bg-gray-100 rounded-lg">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-3 min-h-[44px] bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50"
            >
              {saving ? 'Adding...' : 'Add Note'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function AddJobModal({
  onClose,
  onSave,
}: {
  onClose: () => void
  onSave: (payload: { serviceName: string; scheduledDate?: string; amount?: number; notes?: string }) => Promise<void>
}) {
  const [serviceName, setServiceName] = useState('')
  const [scheduledDate, setScheduledDate] = useState('')
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!serviceName.trim()) return
    setSaving(true)
    try {
      await onSave({
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
        className="bg-white rounded-none md:rounded-xl shadow-xl max-w-md w-full h-full md:h-auto md:max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 md:p-6 border-b border-gray-200 flex items-center justify-between gap-3 shrink-0">
          <h2 className="text-lg font-bold text-gray-900">Add Job</h2>
          <button type="button" onClick={onClose} className="md:hidden min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-600" aria-label="Close">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 md:p-6 space-y-4 flex-1 overflow-y-auto">
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
              {saving ? 'Adding...' : 'Add Job'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
