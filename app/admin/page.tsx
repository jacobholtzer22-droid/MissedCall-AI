'use client'

import { useEffect, useState, useRef } from 'react'
import { useUser } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { CallScreenerCard } from './components/CallScreenerCard'
import { parseContactFile } from '@/lib/import-contacts'
import { DEFAULT_BUSINESS_HOURS } from '@/lib/business-hours'

interface Business {
  id: string
  name: string
  slug: string
  calendarEnabled?: boolean
  googleCalendarConnected?: boolean
  slotDurationMinutes?: number | null
  bufferMinutes?: number | null
  telnyxPhoneNumber: string | null
  forwardingNumber: string | null
  timezone: string
  businessHours: any
  servicesOffered: any
  aiGreeting: string | null
  aiInstructions: string | null
  aiContext: string | null
  adminNotes: string | null
  setupFee: number | null
  monthlyFee: number | null
  subscriptionStatus: string
  spamFilterEnabled: boolean
  missedCallAiEnabled: boolean
  callScreenerEnabled: boolean
  callScreenerMessage: string | null
  cooldownBypassNumbers?: string[] | null
  createdAt: string
  updatedAt: string
  _count: {
    conversations: number
    appointments: number
    users: number
    blockedCalls30d: number
  }
}

interface BlockedNumber {
  id: string
  businessId: string
  phoneNumber: string
  label: string | null
  createdAt: string
}

interface Contact {
  id: string
  businessId: string
  phoneNumber: string
  name: string | null
  createdAt: string
}

interface UsageData {
  sms: { thisWeek: number; allTime: number }
  missedCallSmsTriggered: number
  skips: { cooldown: number; existingContact: number; blocked: number; total: number }
  moneySaved: number
  cost: {
    smsThisWeek: number
    callThisWeek: number
    totalThisWeek: number
    smsAllTime: number
    callAllTime: number
    totalAllTime: number
  }
  skipLogs: { id: string; phoneNumber: string; reason: string; attemptedAt: string; lastMessageSent: string; messageType: string | null }[]
  recentMessages: { id: string; direction: string; content: string; createdAt: string; callerPhone: string; callerName: string | null; cost: number | null }[]
}

export default function AdminDashboard() {
  const { user, isLoaded } = useUser()
  const router = useRouter()
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [editData, setEditData] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [blockedNumbers, setBlockedNumbers] = useState<BlockedNumber[]>([])
  const [newBlockedPhone, setNewBlockedPhone] = useState('')
  const [newBlockedLabel, setNewBlockedLabel] = useState('')
  const [blockedNumbersLoading, setBlockedNumbersLoading] = useState(false)
  const [addingBlocked, setAddingBlocked] = useState(false)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [newContactPhone, setNewContactPhone] = useState('')
  const [newContactName, setNewContactName] = useState('')
  const [contactsLoading, setContactsLoading] = useState(false)
  const [addingContact, setAddingContact] = useState(false)
  const [expandedUsageId, setExpandedUsageId] = useState<string | null>(null)
  const [usageData, setUsageData] = useState<Record<string, UsageData | null>>({})
  const [usageLoading, setUsageLoading] = useState<Record<string, boolean>>({})
  const [refreshLoading, setRefreshLoading] = useState(false)
  const [refreshFeedback, setRefreshFeedback] = useState<string | null>(null)
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [importPreview, setImportPreview] = useState<{ total: number; newCount: number; duplicateCount: number; contacts: { phoneNumber: string; name: string | null }[] } | null>(null)
  const [importProgress, setImportProgress] = useState(0)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [contactsListExpanded, setContactsListExpanded] = useState(false)
  const [contactsSearchFilter, setContactsSearchFilter] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function refreshUsageData(businessId: string) {
    setRefreshLoading(true)
    setRefreshFeedback(null)
    try {
      const syncRes = await fetch('/api/admin/usage/sync?dateRange=last_90_days', {
        method: 'POST',
      })
      const syncData = await syncRes.json()
      if (!syncRes.ok) {
        setRefreshFeedback(`❌ Sync failed: ${syncData.error || 'Unknown error'}`)
        return
      }
      const res = await fetch(`/api/admin/businesses/${businessId}/usage`)
      if (res.ok) {
        const data = await res.json()
        setUsageData((prev) => ({ ...prev, [businessId]: data }))
        const m = syncData.mdrsProcessed ?? 0
        const c = syncData.cdrsProcessed ?? 0
        setRefreshFeedback(`✅ Synced ${m} SMS + ${c} call records from Telnyx`)
      }
    } catch (err) {
      setRefreshFeedback('❌ Failed to refresh usage')
      console.error(err)
    } finally {
      setRefreshLoading(false)
    }
  }

  async function toggleUsage(businessId: string) {
    if (expandedUsageId === businessId) {
      setExpandedUsageId(null)
      return
    }
    setExpandedUsageId(businessId)
    if (!usageData[businessId] && !usageLoading[businessId]) {
      setUsageLoading((prev) => ({ ...prev, [businessId]: true }))
      try {
        const res = await fetch(`/api/admin/businesses/${businessId}/usage`)
        if (res.ok) {
          const data = await res.json()
          setUsageData((prev) => ({ ...prev, [businessId]: data }))
        }
      } catch (err) {
        console.error('Failed to fetch usage:', err)
      } finally {
        setUsageLoading((prev) => ({ ...prev, [businessId]: false }))
      }
    }
  }

  useEffect(() => {
    if (isLoaded) {
      fetchBusinesses()
    }
  }, [isLoaded])

  async function fetchBusinesses() {
    try {
      const res = await fetch('/api/admin/businesses')
      if (res.status === 403) {
        router.push('/dashboard')
        return
      }
      const data = await res.json()
      setBusinesses(data.businesses || [])
    } catch (err) {
      console.error('Failed to fetch businesses:', err)
    } finally {
      setLoading(false)
    }
  }

  async function fetchBlockedNumbers(businessId: string) {
    setBlockedNumbersLoading(true)
    try {
      const res = await fetch(`/api/admin/businesses/${businessId}/blocked-numbers`)
      if (res.ok) {
        const data = await res.json()
        setBlockedNumbers(data.blockedNumbers || [])
      }
    } catch (err) {
      console.error('Failed to fetch blocked numbers:', err)
    } finally {
      setBlockedNumbersLoading(false)
    }
  }

  async function fetchContacts(businessId: string) {
    setContactsLoading(true)
    try {
      const res = await fetch(`/api/admin/businesses/${businessId}/contacts`)
      if (res.ok) {
        const data = await res.json()
        setContacts(data.contacts || [])
      }
    } catch (err) {
      console.error('Failed to fetch contacts:', err)
    } finally {
      setContactsLoading(false)
    }
  }

  function startEdit(business: Business) {
    setSelectedBusiness(business)
    setEditMode(true)
    setEditData({
      name: business.name,
      calendarEnabled: business.calendarEnabled ?? false,
      slotDurationMinutes: business.slotDurationMinutes ?? 30,
      bufferMinutes: business.bufferMinutes ?? 0,
      telnyxPhoneNumber: business.telnyxPhoneNumber || '',
      forwardingNumber: business.forwardingNumber || '',
      timezone: business.timezone,
      adminNotes: business.adminNotes || '',
      setupFee: business.setupFee ?? '',
      monthlyFee: business.monthlyFee ?? '',
      aiGreeting: business.aiGreeting || '',
      aiInstructions: business.aiInstructions || '',
      aiContext: business.aiContext || '',
      subscriptionStatus: business.subscriptionStatus,
      spamFilterEnabled: business.spamFilterEnabled,
      missedCallAiEnabled: business.missedCallAiEnabled,
      servicesOffered: business.servicesOffered
        ? JSON.stringify(business.servicesOffered, null, 2)
        : '[]',
      businessHours: business.businessHours
        ? JSON.stringify(business.businessHours, null, 2)
        : '{}',
      cooldownBypassNumbers: Array.isArray(business.cooldownBypassNumbers)
        ? (business.cooldownBypassNumbers as string[]).join(', ')
        : '',
    })
    setMessage('')
    setNewBlockedPhone('')
    setNewBlockedLabel('')
    setNewContactPhone('')
    setNewContactName('')
    setContactsListExpanded(false)
    setContactsSearchFilter('')
    fetchBlockedNumbers(business.id)
    fetchContacts(business.id)
  }

  async function addBlockedNumber() {
    if (!selectedBusiness || !newBlockedPhone.trim()) return
    setAddingBlocked(true)
    try {
      const res = await fetch(`/api/admin/businesses/${selectedBusiness.id}/blocked-numbers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: newBlockedPhone.trim(),
          label: newBlockedLabel.trim() || null,
        }),
      })
      if (res.ok) {
        setNewBlockedPhone('')
        setNewBlockedLabel('')
        fetchBlockedNumbers(selectedBusiness.id)
      } else {
        const err = await res.json()
        setMessage(`❌ Blocked number: ${err.error || 'Failed to add'}`)
      }
    } catch (err) {
      setMessage('❌ Failed to add blocked number')
    } finally {
      setAddingBlocked(false)
    }
  }

  async function removeBlockedNumber(blockedId: string) {
    if (!selectedBusiness) return
    try {
      const res = await fetch(
        `/api/admin/businesses/${selectedBusiness.id}/blocked-numbers?id=${encodeURIComponent(blockedId)}`,
        { method: 'DELETE' }
      )
      if (res.ok) fetchBlockedNumbers(selectedBusiness.id)
    } catch (err) {
      console.error('Failed to remove blocked number:', err)
    }
  }

  async function addContact() {
    if (!selectedBusiness || !newContactPhone.trim()) return
    setAddingContact(true)
    try {
      const res = await fetch(`/api/admin/businesses/${selectedBusiness.id}/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: newContactPhone.trim(),
          name: newContactName.trim() || null,
        }),
      })
      if (res.ok) {
        setNewContactPhone('')
        setNewContactName('')
        fetchContacts(selectedBusiness.id)
      } else {
        const err = await res.json()
        setMessage(`❌ Contact: ${err.error || 'Failed to add'}`)
      }
    } catch (err) {
      setMessage('❌ Failed to add contact')
    } finally {
      setAddingContact(false)
    }
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !selectedBusiness) return
    const ext = (file.name.split('.').pop() ?? '').toLowerCase()
    if (!['csv', 'xlsx', 'xls'].includes(ext)) {
      setMessage('❌ Please select a .csv, .xlsx, or .xls file')
      return
    }
    if (file.size > 50 * 1024 * 1024) {
      setMessage('❌ File must be under 50MB')
      return
    }
    setImportError(null)
    setImportPreview(null)
    setImportModalOpen(true)
    try {
      const { contacts: parsed } = await parseContactFile(file)
      const existingPhones = new Set(contacts.map((c) => c.phoneNumber))
      const newContacts = parsed.filter((p) => !existingPhones.has(p.phoneNumber))
      const duplicateCount = parsed.length - newContacts.length
      setImportPreview({
        total: parsed.length,
        newCount: newContacts.length,
        duplicateCount,
        contacts: newContacts,
      })
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Failed to parse file')
    }
    e.target.value = ''
  }

  async function handleImportConfirm() {
    if (!selectedBusiness || !importPreview || importPreview.newCount === 0) {
      setImportModalOpen(false)
      setImportPreview(null)
      return
    }
    setImporting(true)
    setImportProgress(0)
    setImportError(null)
    const BATCH_SIZE = 100
    const batches: { phoneNumber: string; name: string | null }[][] = []
    for (let i = 0; i < importPreview.contacts.length; i += BATCH_SIZE) {
      batches.push(importPreview.contacts.slice(i, i + BATCH_SIZE))
    }
    let done = 0
    try {
      for (const batch of batches) {
        const res = await fetch(`/api/admin/businesses/${selectedBusiness.id}/contacts/bulk`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contacts: batch }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || 'Import failed')
        }
        done += 1
        setImportProgress(Math.round((done / batches.length) * 100))
      }
      setMessage(`✅ Imported ${importPreview.newCount} contacts`)
      fetchContacts(selectedBusiness.id)
      setImportModalOpen(false)
      setImportPreview(null)
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImporting(false)
      setImportProgress(0)
    }
  }

  function closeImportModal() {
    if (!importing) {
      setImportModalOpen(false)
      setImportPreview(null)
      setImportError(null)
    }
  }

  async function removeContact(contact: Contact) {
    if (!selectedBusiness) return
    const c = contact as unknown as Record<string, unknown>
    const id = (c.id ?? c._id) as string | undefined
    const phone = (c.phoneNumber ?? c.phone ?? c.phone_number) as string | undefined
    const hasId = typeof id === 'string' && id.trim().length > 0
    const hasPhone = typeof phone === 'string' && phone.trim().length > 0
    if (!hasId && !hasPhone) {
      setMessage('❌ Contact has no id or phone number')
      return
    }
    setContacts(prev => prev.filter(c => {
      const rec = c as unknown as Record<string, unknown>
      const cId = rec.id ?? rec._id
      const cPhone = rec.phoneNumber ?? rec.phone
      return (id == null || cId !== id) && (phone == null || cPhone !== phone)
    }))
    try {
      const res = await fetch(
        `/api/admin/businesses/${selectedBusiness.id}/contacts`,
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: hasId ? id!.trim() : undefined,
            phoneNumber: hasPhone ? phone!.trim() : undefined,
          }),
        }
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMessage(`❌ Failed to remove: ${data.error || 'Unknown error'}`)
        fetchContacts(selectedBusiness.id)
      }
    } catch (err) {
      setMessage('❌ Failed to remove contact')
      fetchContacts(selectedBusiness.id)
    }
  }

  async function saveChanges() {
    if (!selectedBusiness) return
    setSaving(true)
    setMessage('')

    try {
      let servicesOffered, businessHours
      try {
        servicesOffered = JSON.parse(editData.servicesOffered)
      } catch {
        setMessage('❌ Services Offered is not valid JSON')
        setSaving(false)
        return
      }
      try {
        const raw = (editData.businessHours ?? '').trim()
        businessHours = raw ? JSON.parse(raw) : DEFAULT_BUSINESS_HOURS
      } catch {
        setMessage('❌ Business Hours is not valid JSON')
        setSaving(false)
        return
      }

      const res = await fetch(`/api/admin/businesses/${selectedBusiness.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editData.name,
          telnyxPhoneNumber: editData.telnyxPhoneNumber || null,
          forwardingNumber: editData.forwardingNumber || null,
          timezone: editData.timezone,
          adminNotes: editData.adminNotes || null,
          setupFee: editData.setupFee !== '' && editData.setupFee != null ? parseFloat(String(editData.setupFee)) : null,
          monthlyFee: editData.monthlyFee !== '' && editData.monthlyFee != null ? parseFloat(String(editData.monthlyFee)) : null,
          aiGreeting: editData.aiGreeting || null,
          aiInstructions: editData.aiInstructions || null,
          aiContext: editData.aiContext || null,
          subscriptionStatus: editData.subscriptionStatus,
          calendarEnabled: editData.calendarEnabled,
          spamFilterEnabled: editData.spamFilterEnabled,
          missedCallAiEnabled: editData.missedCallAiEnabled,
          slotDurationMinutes: editData.calendarEnabled ? (editData.slotDurationMinutes ?? 30) : undefined,
          bufferMinutes: editData.calendarEnabled ? (editData.bufferMinutes ?? 0) : undefined,
          servicesOffered,
          businessHours,
          cooldownBypassNumbers: editData.cooldownBypassNumbers ?? '',
        }),
      })

      if (res.ok) {
        setMessage('✅ Saved successfully!')
        setEditMode(false)
        fetchBusinesses()
      } else {
        const err = await res.json()
        setMessage(`❌ Error: ${err.error || 'Failed to save'}`)
      }
    } catch (err) {
      setMessage('❌ Network error')
    } finally {
      setSaving(false)
    }
  }

  if (!isLoaded || loading) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <p className="text-gray-400">Loading admin dashboard...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-900/50 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Admin Dashboard</h1>
            <p className="text-sm text-gray-400 mt-1">
              Manage all clients · {businesses.length} business{businesses.length !== 1 ? 'es' : ''}
            </p>
          </div>
          <a
            href="/dashboard"
            className="text-sm text-gray-400 hover:text-white transition"
          >
            ← Back to Dashboard
          </a>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
          <StatCard label="Total Clients" value={businesses.length} />
          <StatCard
            label="Active"
            value={businesses.filter(b => b.subscriptionStatus === 'active').length}
            color="green"
          />
          <StatCard
            label="Trialing"
            value={businesses.filter(b => b.subscriptionStatus === 'trialing').length}
            color="yellow"
          />
          <StatCard
            label="Total Conversations"
            value={businesses.reduce((sum, b) => sum + b._count.conversations, 0)}
            color="blue"
          />
          <StatCard
            label="Spam Blocked"
            value={0}
            color="red"
          />
        </div>

        {/* Business List */}
        <div className="space-y-6">
          {businesses.map(business => (
            <div
              key={business.id}
              className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden"
            >
              {/* Business Info & Status */}
              <div className="p-6">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
                  <div className="flex-1 space-y-4">
                    {/* Header: Name + Status badges */}
                    <div>
                      <h2 className="text-xl font-semibold text-white mb-2">{business.name}</h2>
                      <div className="flex flex-wrap gap-2 items-center">
                        <StatusBadge status={business.subscriptionStatus} />
                        <StatusPill
                          active={!!business.calendarEnabled}
                          label="Online Booking"
                        />
                        <StatusPill
                          active={!!business.googleCalendarConnected}
                          label="Calendar"
                        />
                        {business.spamFilterEnabled && (
                          <span className="text-xs px-2.5 py-1 rounded-full border bg-green-500/10 text-green-400 border-green-500/20">
                            Spam Filter
                          </span>
                        )}
                        {business._count.blockedCalls30d > 0 && (
                          <span className="text-xs px-2.5 py-1 rounded-full border bg-red-500/10 text-red-400 border-red-500/20">
                            {business._count.blockedCalls30d} blocked (30d)
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Key business details */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-gray-500 text-xs uppercase tracking-wide">Phone</p>
                        <p className={business.telnyxPhoneNumber ? 'text-green-400 font-mono' : 'text-red-400'}>
                          {business.telnyxPhoneNumber || 'Not assigned'}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-xs uppercase tracking-wide">Forwarding</p>
                        <p className="text-gray-300">{business.forwardingNumber || '—'}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-xs uppercase tracking-wide">Timezone</p>
                        <p className="text-gray-300">{business.timezone.split('/').pop()?.replace('_', ' ') ?? business.timezone}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-xs uppercase tracking-wide">Activity</p>
                        <p className="text-gray-300">{business._count.conversations} convos · {business._count.appointments} appts</p>
                      </div>
                    </div>

                    {/* Fees (compact) */}
                    {(business.setupFee != null || business.monthlyFee != null) && (
                      <div className="flex gap-4 text-sm text-gray-400">
                        {business.setupFee != null && <span>Setup: ${business.setupFee}</span>}
                        {business.monthlyFee != null && <span>Monthly: ${business.monthlyFee}/mo</span>}
                      </div>
                    )}

                    {business.adminNotes && (
                      <p className="text-sm text-gray-500 italic">{business.adminNotes}</p>
                    )}

                    {/* Call Screener */}
                    <div className="pt-2">
                      <CallScreenerCard
                        businessId={business.id}
                        businessName={business.name}
                        callScreenerEnabled={business.callScreenerEnabled}
                        callScreenerMessage={business.callScreenerMessage}
                        onToggle={async (id, enabled) => {
                          await fetch(`/api/admin/businesses/${id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ callScreenerEnabled: enabled }),
                          })
                          fetchBusinesses()
                        }}
                        onUpdateMessage={async (id, message) => {
                          await fetch(`/api/admin/businesses/${id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ callScreenerMessage: message }),
                          })
                          fetchBusinesses()
                        }}
                      />
                    </div>

                    {/* Usage & Cost - clean summary card */}
                    {expandedUsageId === business.id && (
                      <div className="mt-4 pt-4 border-t border-gray-800">
                        {usageLoading[business.id] ? (
                          <p className="text-gray-500 text-sm">Loading usage...</p>
                        ) : usageData[business.id] ? (
                          <UsagePanel
                            data={usageData[business.id]!}
                            onRefresh={() => refreshUsageData(business.id)}
                            refreshLoading={refreshLoading}
                            refreshFeedback={refreshFeedback}
                          />
                        ) : null}
                      </div>
                    )}
                  </div>

                  {/* Action buttons - grouped */}
                  <div className="flex flex-col sm:flex-row lg:flex-col gap-2 shrink-0">
                    <div className="flex flex-wrap gap-2">
                      <a
                        href={`/api/admin/view-as?businessId=${business.id}`}
                        className="px-4 py-2 bg-amber-600 hover:bg-amber-700 rounded-lg text-sm font-medium transition"
                      >
                        View as Client
                      </a>
                      <button
                        onClick={() => startEdit(business)}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition"
                      >
                        Edit
                      </button>
                      <a
                        href={`/admin/${business.id}/conversations`}
                        className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium transition"
                      >
                        View Conversations
                      </a>
                    </div>
                    {business.calendarEnabled && (
                      <a
                        href={`/api/auth/google?businessId=${business.id}`}
                        className="px-4 py-2 text-sm font-medium rounded-lg border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 transition"
                      >
                        {business.googleCalendarConnected ? 'Reconnect Calendar' : 'Connect Calendar'}
                      </a>
                    )}
                    <button
                      onClick={() => toggleUsage(business.id)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                        expandedUsageId === business.id
                          ? 'bg-green-600 hover:bg-green-700'
                          : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
                      }`}
                    >
                      {expandedUsageId === business.id ? 'Hide Usage' : 'Usage & Cost'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {businesses.length === 0 && (
            <div className="text-center py-16 text-gray-500">
              <p className="text-xl">No clients yet</p>
              <p className="mt-2">When clients sign up, they will appear here.</p>
            </div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {editMode && selectedBusiness && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">Edit: {selectedBusiness.name}</h2>
              <button
                onClick={() => { setEditMode(false); setMessage('') }}
                className="text-gray-400 hover:text-white text-2xl"
              >
                ×
              </button>
            </div>

            <div className="space-y-5">
              {/* Business Name */}
              <Field label="Business Name">
                <input
                  type="text"
                  value={editData.name}
                  onChange={e => setEditData({ ...editData, name: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white"
                />
              </Field>

              {/* Telnyx Number */}
              <Field
                label="Telnyx Phone Number"
                hint="Buy in Telnyx portal, paste here. Format: +1XXXXXXXXXX"
              >
                <input
                  type="text"
                  value={editData.telnyxPhoneNumber}
                  onChange={e => setEditData({ ...editData, telnyxPhoneNumber: e.target.value })}
                  placeholder="+18335551234"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-600"
                />
              </Field>

              {/* Forwarding Number */}
              <Field
                label="Forwarding Number"
                hint="Owner's real phone number — the AI rings this first before taking over. Format: +1XXXXXXXXXX"
              >
                <input
                  type="text"
                  value={editData.forwardingNumber}
                  onChange={e => setEditData({ ...editData, forwardingNumber: e.target.value })}
                  placeholder="+13095551234"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-600"
                />
              </Field>

              {/* Timezone */}
              <Field label="Timezone">
                <select
                  value={editData.timezone}
                  onChange={e => setEditData({ ...editData, timezone: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white"
                >
                  <option value="America/New_York">Eastern</option>
                  <option value="America/Chicago">Central</option>
                  <option value="America/Denver">Mountain</option>
                  <option value="America/Los_Angeles">Pacific</option>
                  <option value="America/Anchorage">Alaska</option>
                  <option value="Pacific/Honolulu">Hawaii</option>
                </select>
              </Field>

              {/* Subscription Status */}
              <Field label="Subscription Status">
                <select
                  value={editData.subscriptionStatus}
                  onChange={e => setEditData({ ...editData, subscriptionStatus: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white"
                >
                  <option value="trialing">Trialing</option>
                  <option value="active">Active</option>
                  <option value="past_due">Past Due</option>
                  <option value="canceled">Canceled</option>
                </select>
              </Field>

              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={editData.calendarEnabled} onChange={e => setEditData({...editData, calendarEnabled: e.target.checked})} className="w-5 h-5 rounded" />
                <span className="text-sm text-gray-300">Enable Online Booking (Google Calendar + /book page + SMS booking flow)</span>
              </label>

              {editData.calendarEnabled && (
                <>
                  <Field
                    label="Default Appointment Length"
                    hint="How long each booked appointment will be on the calendar"
                  >
                    <select
                      value={editData.slotDurationMinutes ?? 30}
                      onChange={e => setEditData({ ...editData, slotDurationMinutes: parseInt(e.target.value, 10) })}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white"
                    >
                      <option value={15}>15 min</option>
                      <option value={30}>30 min</option>
                      <option value={45}>45 min</option>
                      <option value={60}>60 min</option>
                      <option value={90}>90 min</option>
                      <option value={120}>120 min</option>
                    </select>
                  </Field>
                  <Field
                    label="Buffer Between Appointments"
                    hint="Minimum break between back-to-back appointments"
                  >
                    <select
                      value={editData.bufferMinutes ?? 0}
                      onChange={e => setEditData({ ...editData, bufferMinutes: parseInt(e.target.value, 10) })}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white"
                    >
                      <option value={0}>No buffer</option>
                      <option value={15}>15 min</option>
                      <option value={30}>30 min</option>
                      <option value={45}>45 min</option>
                      <option value={60}>60 min</option>
                    </select>
                  </Field>
                </>
              )}

              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={editData.spamFilterEnabled} onChange={e => setEditData({...editData, spamFilterEnabled: e.target.checked})} className="w-5 h-5 rounded" />
                <span className="text-sm text-gray-300">Enable Spam Filtering (Premium Feature)</span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={editData.missedCallAiEnabled} onChange={e => setEditData({...editData, missedCallAiEnabled: e.target.checked})} className="w-5 h-5 rounded" />
                <span className="text-sm text-gray-300">Enable MissedCall AI (SMS after missed call)</span>
              </label>

              {/* Cooldown Bypass Numbers (admin only) */}
              <Field
                label="Numbers that skip cooldown (for testing)"
                hint="These numbers will always receive missed call SMS regardless of cooldown. Use for testing."
              >
                <input
                  type="text"
                  value={editData.cooldownBypassNumbers ?? ''}
                  onChange={e => setEditData({ ...editData, cooldownBypassNumbers: e.target.value })}
                  placeholder="+15551234567, +15559876543"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-600"
                />
              </Field>

              {/* Blocked numbers */}
              <Field
                label="Blocked numbers"
                hint="These callers will not receive MissedCall AI SMS. Use E.164 format (e.g. +15551234567)."
              >
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <input
                      type="text"
                      value={newBlockedPhone}
                      onChange={e => setNewBlockedPhone(e.target.value)}
                      placeholder="+15551234567"
                      className="flex-1 min-w-[140px] bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-600 text-sm"
                    />
                    <input
                      type="text"
                      value={newBlockedLabel}
                      onChange={e => setNewBlockedLabel(e.target.value)}
                      placeholder="Label (e.g. Mom)"
                      className="w-32 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-600 text-sm"
                    />
                    <button
                      type="button"
                      onClick={addBlockedNumber}
                      disabled={addingBlocked || !newBlockedPhone.trim()}
                      className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition"
                    >
                      {addingBlocked ? 'Adding...' : 'Add'}
                    </button>
                  </div>
                  {blockedNumbersLoading ? (
                    <p className="text-sm text-gray-500">Loading blocked numbers...</p>
                  ) : blockedNumbers.length === 0 ? (
                    <p className="text-sm text-gray-500">No blocked numbers.</p>
                  ) : (
                    <ul className="divide-y divide-gray-800 rounded-lg border border-gray-800 overflow-hidden">
                      {blockedNumbers.map(bn => (
                        <li key={bn.id} className="flex items-center justify-between gap-2 bg-gray-800/50 px-3 py-2 text-sm">
                          <span className="text-gray-300">
                            {bn.phoneNumber}
                            {bn.label ? <span className="text-gray-500 ml-2">({bn.label})</span> : null}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeBlockedNumber(bn.id)}
                            className="text-red-400 hover:text-red-300 text-xs font-medium"
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </Field>

              {/* Existing contacts (address book) - skip automated SMS to these */}
              <Field
                label="Existing contacts (address book)"
                hint="Callers in this list will NOT receive MissedCall AI SMS. Add people the client already knows. Any format: +1 (555) 123-4567, 555-123-4567, etc."
              >
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2 items-center">
                    <input
                      type="text"
                      value={newContactPhone}
                      onChange={e => setNewContactPhone(e.target.value)}
                      placeholder="+1 (555) 123-4567"
                      className="flex-1 min-w-[140px] bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-600 text-sm"
                    />
                    <input
                      type="text"
                      value={newContactName}
                      onChange={e => setNewContactName(e.target.value)}
                      placeholder="Name (optional)"
                      className="w-32 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-600 text-sm"
                    />
                    <button
                      type="button"
                      onClick={addContact}
                      disabled={addingContact || !newContactPhone.trim()}
                      className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition"
                    >
                      {addingContact ? 'Adding...' : 'Add contact'}
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      className="hidden"
                      onChange={handleImportFile}
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={contactsLoading}
                      className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 rounded-lg text-sm font-medium transition"
                    >
                      Import Contacts
                    </button>
                  </div>
                  {contactsLoading ? (
                    <p className="text-sm text-gray-500">Loading contacts...</p>
                  ) : contacts.length === 0 ? (
                    <p className="text-sm text-gray-500">No contacts. Add people the client already knows to skip automated texts.</p>
                  ) : (
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={() => setContactsListExpanded(prev => !prev)}
                        className="flex items-center justify-between w-full px-4 py-2.5 bg-gray-800/50 hover:bg-gray-800 border border-gray-700 rounded-lg text-left text-sm transition"
                      >
                        <span className="text-gray-300">
                          {contacts.length} contact{contacts.length !== 1 ? 's' : ''} in address book
                        </span>
                        <span className="text-gray-500 text-xs">
                          {contactsListExpanded ? '▼ Collapse' : '▶ Expand'}
                        </span>
                      </button>
                      {contactsListExpanded && (
                        <div className="rounded-lg border border-gray-800 overflow-hidden bg-gray-900/50">
                          <div className="p-2 border-b border-gray-800">
                            <input
                              type="text"
                              value={contactsSearchFilter}
                              onChange={e => setContactsSearchFilter(e.target.value)}
                              placeholder="Search by phone or name..."
                              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-600 text-sm"
                            />
                          </div>
                          <ul className="divide-y divide-gray-800 max-h-64 overflow-y-auto">
                            {(() => {
                              const q = contactsSearchFilter.trim().toLowerCase()
                              const filtered = !q ? contacts : contacts.filter(
                                c =>
                                  c.phoneNumber.toLowerCase().includes(q) ||
                                  (c.name?.toLowerCase().includes(q) ?? false)
                              )
                              if (filtered.length === 0) {
                                return (
                                  <li className="px-4 py-3 text-sm text-gray-500 text-center">
                                    {q ? 'No matches' : 'No contacts'}
                                  </li>
                                )
                              }
                              return filtered.map(c => (
                                <li key={c.id} className="flex items-center justify-between gap-2 bg-gray-800/30 px-3 py-2 text-sm hover:bg-gray-800/50">
                                  <span className="text-gray-300 truncate">
                                    {c.phoneNumber}
                                    {c.name ? <span className="text-gray-500 ml-2">({c.name})</span> : null}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => removeContact(c)}
                                    className="flex-shrink-0 text-red-400 hover:text-red-300 text-xs font-medium"
                                  >
                                    Remove
                                  </button>
                                </li>
                              ))
                            })()}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </Field>

              {/* Setup Fee */}
              <Field label="Setup Fee">
                <input
                  type="number"
                  value={editData.setupFee}
                  onChange={e => setEditData({ ...editData, setupFee: e.target.value })}
                  placeholder="$500"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-600"
                />
              </Field>

              {/* Monthly Fee */}
              <Field label="Monthly Fee">
                <input
                  type="number"
                  value={editData.monthlyFee}
                  onChange={e => setEditData({ ...editData, monthlyFee: e.target.value })}
                  placeholder="$299"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-600"
                />
              </Field>

              {/* Admin Notes */}
              <Field
                label="Admin Notes"
                hint="Private notes about this client"
              >
                <textarea
                  value={editData.adminNotes}
                  onChange={e => setEditData({ ...editData, adminNotes: e.target.value })}
                  rows={3}
                  placeholder="Private notes about this client..."
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-600"
                />
              </Field>

              {/* AI Greeting */}
              <Field
                label="AI Greeting"
                hint="The first text the AI sends after a missed call"
              >
                <textarea
                  value={editData.aiGreeting}
                  onChange={e => setEditData({ ...editData, aiGreeting: e.target.value })}
                  rows={2}
                  placeholder="Hey! Sorry we missed your call. This is the assistant for [Business]. How can I help?"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-600"
                />
              </Field>

              {/* AI Instructions */}
              <Field
                label="AI Instructions"
                hint="Rules and personality for the AI (e.g. Be friendly, always mention we come to the customer)"
              >
                <textarea
                  value={editData.aiInstructions}
                  onChange={e => setEditData({ ...editData, aiInstructions: e.target.value })}
                  rows={4}
                  placeholder="Be friendly and professional. Always try to book an appointment..."
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-600"
                />
              </Field>

              {/* AI Context */}
              <Field
                label="AI Context"
                hint="Business info the AI should know (services, pricing, policies, hours)"
              >
                <textarea
                  value={editData.aiContext}
                  onChange={e => setEditData({ ...editData, aiContext: e.target.value })}
                  rows={6}
                  placeholder="We are a mobile auto detailing business in Bloomington, IL. We use Griot's products..."
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-600"
                />
              </Field>

              {/* Services Offered */}
              <Field
                label="Services Offered (JSON)"
                hint='Example: ["Basic Interior - $150", "Full Detail - $350"]'
              >
                <textarea
                  value={editData.servicesOffered}
                  onChange={e => setEditData({ ...editData, servicesOffered: e.target.value })}
                  rows={4}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white font-mono text-sm"
                />
              </Field>

              {/* Business Hours */}
              <Field
                label="Business Hours (JSON)"
                hint='Example: {"monday": {"open": "09:00", "close": "17:00"}, ...} Mon-Fri 9-5, Sat-Sun closed if null/empty'
              >
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <textarea
                      value={editData.businessHours}
                      onChange={e => setEditData({ ...editData, businessHours: e.target.value })}
                      rows={4}
                      className="flex-1 w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white font-mono text-sm"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setEditData({
                          ...editData,
                          businessHours: JSON.stringify(DEFAULT_BUSINESS_HOURS, null, 2),
                        })
                      }
                      className="self-start px-4 py-2 bg-amber-600 hover:bg-amber-700 rounded-lg text-sm font-medium shrink-0"
                    >
                      Set Default Hours
                    </button>
                  </div>
                  <p className="text-xs text-gray-500">Default: Mon–Fri 9am–5pm, Sat–Sun closed</p>
                </div>
              </Field>
            </div>

            {message && (
              <div className="mt-4 text-sm font-medium">{message}</div>
            )}

            <div className="flex gap-3 mt-6 pt-4 border-t border-gray-800">
              <button
                onClick={saveChanges}
                disabled={saving}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 rounded-lg py-3 font-medium transition"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                onClick={() => { setEditMode(false); setMessage('') }}
                className="px-6 bg-gray-800 hover:bg-gray-700 rounded-lg py-3 font-medium transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Contacts Modal */}
      {importModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold mb-4">Import Contacts</h2>
            {importError && (
              <p className="text-red-400 text-sm mb-4">{importError}</p>
            )}
            {!importPreview ? (
              <p className="text-gray-400">Parsing file...</p>
            ) : (
              <>
                <p className="text-gray-300 mb-4">
                  Found {importPreview.total} phone numbers.{' '}
                  <span className="text-green-400">{importPreview.newCount} are new</span>,{' '}
                  <span className="text-amber-400">{importPreview.duplicateCount} are duplicates</span> that will be skipped.
                </p>
                {importing && (
                  <div className="mb-4">
                    <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-600 transition-all duration-300"
                        style={{ width: `${importProgress}%` }}
                      />
                    </div>
                    <p className="text-sm text-gray-500 mt-1">{importProgress}% complete</p>
                  </div>
                )}
              </>
            )}
            <div className="flex gap-3 mt-6">
              {importPreview && importPreview.newCount > 0 && !importing && (
                <button
                  onClick={handleImportConfirm}
                  className="flex-1 bg-amber-600 hover:bg-amber-700 rounded-lg py-3 font-medium transition"
                >
                  Import {importPreview.newCount} Contacts
                </button>
              )}
              <button
                onClick={closeImportModal}
                disabled={importing}
                className="px-6 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded-lg py-3 font-medium transition"
              >
                {importPreview && importPreview.newCount === 0 && !importError ? 'Close' : importing ? 'Importing...' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function UsagePanel({
  data,
  onRefresh,
  refreshLoading,
  refreshFeedback,
}: {
  data: UsageData
  onRefresh: () => void
  refreshLoading: boolean
  refreshFeedback?: string | null
}) {
  const [showDetails, setShowDetails] = useState(false)
  const formatPhone = (p: string) => {
    const d = p.replace(/\D/g, '')
    if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
    if (d.length === 11 && d[0] === '1') return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`
    return p
  }
  const skipReasonLabel: Record<string, string> = {
    cooldown: 'Cooldown',
    existing_contact: 'Existing contact',
    blocked: 'Blocked list',
  }
  return (
    <div className="bg-gray-800/30 rounded-xl border border-gray-700 p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-semibold text-gray-200">Usage & Cost</h3>
        <div className="flex items-center gap-2">
          {refreshFeedback && <span className="text-xs text-gray-400">{refreshFeedback}</span>}
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshLoading}
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 rounded-lg text-sm font-medium transition"
          >
            {refreshLoading ? 'Syncing…' : 'Refresh'}
          </button>
        </div>
      </div>
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-gray-900/50 rounded-lg p-3">
          <p className="text-xs text-gray-500">SMS (this week)</p>
          <p className="text-lg font-bold text-white">{data.sms.thisWeek}</p>
        </div>
        <div className="bg-gray-900/50 rounded-lg p-3">
          <p className="text-xs text-gray-500">Cost (this week)</p>
          <p className="text-lg font-bold text-white">${data.cost.totalThisWeek.toFixed(2)}</p>
        </div>
        <div className="bg-gray-900/50 rounded-lg p-3">
          <p className="text-xs text-gray-500">Cost (all time)</p>
          <p className="text-lg font-bold text-gray-300">${data.cost.totalAllTime.toFixed(2)}</p>
        </div>
        <div className="bg-gray-900/50 rounded-lg p-3">
          <p className="text-xs text-gray-500">Saved</p>
          <p className="text-lg font-bold text-green-400">${data.moneySaved.toFixed(2)}</p>
        </div>
      </div>
      <p className="text-xs text-gray-500">
        {data.sms.allTime} total SMS · {data.missedCallSmsTriggered} missed-call triggered · 
        Skipped: {data.skips.cooldown} cooldown, {data.skips.existingContact} contact, {data.skips.blocked} blocked
      </p>
      {showDetails && (
        <>
          <div className="border-t border-gray-700 pt-3 space-y-3">
            <h4 className="text-sm font-medium text-gray-400">Skip Logs</h4>
            <div className="bg-gray-900/50 rounded-lg border border-gray-800 overflow-hidden max-h-36 overflow-y-auto">
              {data.skipLogs.length === 0 ? (
                <p className="p-3 text-gray-500 text-sm">No skips</p>
              ) : (
                <table className="w-full text-xs">
                  <thead className="bg-gray-900 sticky top-0">
                    <tr>
                      <th className="text-left px-2 py-1.5 text-gray-500">Time</th>
                      <th className="text-left px-2 py-1.5 text-gray-500">Phone</th>
                      <th className="text-left px-2 py-1.5 text-gray-500">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.skipLogs.slice(0, 15).map((log) => (
                      <tr key={log.id} className="border-t border-gray-800/50">
                        <td className="px-2 py-1.5 text-gray-400 whitespace-nowrap">{new Date(log.attemptedAt).toLocaleString()}</td>
                        <td className="px-2 py-1.5 text-gray-400">{formatPhone(log.phoneNumber)}</td>
                        <td className="px-2 py-1.5">{skipReasonLabel[log.reason] ?? log.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <h4 className="text-sm font-medium text-gray-400">Recent Messages</h4>
            <div className="bg-gray-900/50 rounded-lg border border-gray-800 overflow-hidden max-h-36 overflow-y-auto">
              {data.recentMessages.length === 0 ? (
                <p className="p-3 text-gray-500 text-sm">No messages</p>
              ) : (
                <table className="w-full text-xs">
                  <thead className="bg-gray-900 sticky top-0">
                    <tr>
                      <th className="text-left px-2 py-1.5 text-gray-500">Time</th>
                      <th className="text-left px-2 py-1.5 text-gray-500">From</th>
                      <th className="text-left px-2 py-1.5 text-gray-500">Content</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentMessages.slice(0, 10).map((m) => (
                      <tr key={m.id} className="border-t border-gray-800/50">
                        <td className="px-2 py-1.5 text-gray-400 whitespace-nowrap">{new Date(m.createdAt).toLocaleString()}</td>
                        <td className="px-2 py-1.5 text-gray-400">{formatPhone(m.callerPhone)}</td>
                        <td className="px-2 py-1.5 text-gray-500 max-w-[200px] truncate">{m.content}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
      <button
        type="button"
        onClick={() => setShowDetails(!showDetails)}
        className="text-xs text-gray-500 hover:text-gray-400"
      >
        {showDetails ? 'Hide details' : 'Show details'}
      </button>
    </div>
  )
}

function StatCard({ label, value, color = 'gray' }: { label: string; value: number; color?: string }) {
  const colors: Record<string, string> = {
    gray: 'text-white',
    green: 'text-green-400',
    yellow: 'text-yellow-400',
    blue: 'text-blue-400',
    red: 'text-red-400',
  }
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${colors[color]}`}>{value}</p>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: 'bg-green-500/10 text-green-400 border-green-500/20',
    trialing: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    past_due: 'bg-red-500/10 text-red-400 border-red-500/20',
    canceled: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
  }
  return (
    <span className={`text-xs px-2.5 py-1 rounded-full border ${styles[status] || styles.canceled}`}>
      {status}
    </span>
  )
}

function StatusPill({ active, label }: { active: boolean; label: string }) {
  return (
    <span className={`text-xs px-2.5 py-1 rounded-full border ${
      active ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-gray-500/10 text-gray-500 border-gray-500/20'
    }`}>
      {label}: {active ? 'On' : 'Off'}
    </span>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-1.5">{label}</label>
      {hint && <p className="text-xs text-gray-500 mb-1.5">{hint}</p>}
      {children}
    </div>
  )
}
