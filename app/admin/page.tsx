'use client'

import { useEffect, useState, useRef } from 'react'
import { useUser } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { CallScreenerCard } from './components/CallScreenerCard'
import { parseContactFile } from '@/lib/import-contacts'

interface Business {
  id: string
  name: string
  slug: string
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
  const [refreshDebugLog, setRefreshDebugLog] = useState<string[]>([])
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
    setRefreshDebugLog([])
    try {
      const syncRes = await fetch('/api/admin/usage/sync?dateRange=last_90_days', {
        method: 'POST',
      })
      const syncData = await syncRes.json()
      if (!syncRes.ok) {
        setRefreshFeedback(`❌ Sync failed: ${syncData.error || 'Unknown error'}`)
        return
      }
      setRefreshDebugLog(syncData.debugLog ?? [])
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
        businessHours = JSON.parse(editData.businessHours)
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
          spamFilterEnabled: editData.spamFilterEnabled,
          missedCallAiEnabled: editData.missedCallAiEnabled,
          servicesOffered,
          businessHours,
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
        <div className="space-y-4">
          {businesses.map(business => (
            <div
              key={business.id}
              className="bg-gray-900 border border-gray-800 rounded-xl p-6"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h2 className="text-xl font-semibold">{business.name}</h2>
                    <StatusBadge status={business.subscriptionStatus} />
                    {business.spamFilterEnabled ? (
                      <span className="text-xs px-2.5 py-1 rounded-full border bg-green-500/10 text-green-400 border-green-500/20">
                        Spam Filter ON
                      </span>
                    ) : (
                      <span className="text-xs px-2.5 py-1 rounded-full border bg-gray-500/10 text-gray-400 border-gray-500/20">
                        Spam Filter OFF
                      </span>
                    )}
                    {business._count.blockedCalls30d > 0 && (
                      <span className="text-xs text-red-400">
                        🛡️ {business._count.blockedCalls30d} spam blocked (30d)
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 text-sm">
                    <div>
                      <span className="text-gray-500">Telnyx Number (telnyxPhoneNumber)</span>
                      <p className={business.telnyxPhoneNumber ? 'text-green-400 font-mono text-xs' : 'text-red-400'}>
                        {business.telnyxPhoneNumber ? `"${business.telnyxPhoneNumber}"` : 'NOT ASSIGNED'}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-500">Forwarding Number</span>
                      <p className={business.forwardingNumber ? 'text-gray-300' : 'text-gray-500'}>
                        {business.forwardingNumber || 'Not set'}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-500">Timezone</span>
                      <p className="text-gray-300">{business.timezone}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Conversations</span>
                      <p className="text-gray-300">{business._count.conversations}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Appointments</span>
                      <p className="text-gray-300">{business._count.appointments}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-3 text-sm">
                    <div>
                      <span className="text-gray-500">Setup Fee</span>
                      <p className={business.setupFee != null ? 'text-gray-300' : 'text-gray-500'}>
                        {business.setupFee != null ? `$${business.setupFee}` : 'Not set'}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-500">Monthly Fee</span>
                      <p className={business.monthlyFee != null ? 'text-gray-300' : 'text-gray-500'}>
                        {business.monthlyFee != null ? `$${business.monthlyFee}/mo` : 'Not set'}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-500">This Week</span>
                      <p className="text-gray-300">{business._count.conversations}</p>
                    </div>
                  </div>

                  {business.aiGreeting && (
                    <div className="mt-3 text-sm">
                      <span className="text-gray-500">AI Greeting: </span>
                      <span className="text-gray-400 italic">&quot;{business.aiGreeting}&quot;</span>
                    </div>
                  )}
                  {business.adminNotes && (
                    <div className="mt-3 text-sm">
                      <span className="text-gray-500">Notes: </span>
                      <span className="text-gray-400">{business.adminNotes}</span>
                    </div>
                  )}

                  <div className="mt-4">
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

                  {/* Usage & Cost section */}
                  {expandedUsageId === business.id && (
                    <div className="mt-6 pt-6 border-t border-gray-800">
                      {usageLoading[business.id] ? (
                        <p className="text-gray-500 text-sm">Loading usage...</p>
                      ) : usageData[business.id] ? (
                        <UsagePanel
                          data={usageData[business.id]!}
                          onRefresh={() => refreshUsageData(business.id)}
                          refreshLoading={refreshLoading}
                          refreshFeedback={refreshFeedback}
                          refreshDebugLog={refreshDebugLog}
                        />
                      ) : null}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 ml-4">
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
                    className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm font-medium transition"
                  >
                    View Conversations
                  </a>
                  <button
                    onClick={() => toggleUsage(business.id)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                      expandedUsageId === business.id
                        ? 'bg-green-600 hover:bg-green-700'
                        : 'bg-gray-800 hover:bg-gray-700'
                    }`}
                  >
                    {expandedUsageId === business.id ? 'Hide Usage' : 'Usage & Cost'}
                  </button>
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
                <input type="checkbox" checked={editData.spamFilterEnabled} onChange={e => setEditData({...editData, spamFilterEnabled: e.target.checked})} className="w-5 h-5 rounded" />
                <span className="text-sm text-gray-300">Enable Spam Filtering (Premium Feature)</span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={editData.missedCallAiEnabled} onChange={e => setEditData({...editData, missedCallAiEnabled: e.target.checked})} className="w-5 h-5 rounded" />
                <span className="text-sm text-gray-300">Enable MissedCall AI (SMS after missed call)</span>
              </label>

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
                hint='Example: {"monday": {"open": "09:00", "close": "17:00"}, ...}'
              >
                <textarea
                  value={editData.businessHours}
                  onChange={e => setEditData({ ...editData, businessHours: e.target.value })}
                  rows={4}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white font-mono text-sm"
                />
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
  refreshDebugLog = [],
}: {
  data: UsageData
  onRefresh: () => void
  refreshLoading: boolean
  refreshFeedback?: string | null
  refreshDebugLog?: string[]
}) {
  const [testTelnyxLoading, setTestTelnyxLoading] = useState(false)
  const [testTelnyxResult, setTestTelnyxResult] = useState<{
    totalCount: number
    records: { from: string; to: string; direction: string; cost: string; created_at: string }[]
    raw?: Record<string, unknown>
    error?: string
  } | null>(null)

  async function handleTestTelnyx() {
    setTestTelnyxLoading(true)
    setTestTelnyxResult(null)
    try {
      const res = await fetch('/api/admin/telnyx-test')
      const json = await res.json()
      if (!res.ok) {
        setTestTelnyxResult({ totalCount: 0, records: [], error: json.error ?? 'Request failed', raw: json })
        return
      }
      setTestTelnyxResult({
        totalCount: json.totalCount ?? 0,
        records: json.records ?? [],
        raw: json.raw,
      })
    } catch (err) {
      setTestTelnyxResult({ totalCount: 0, records: [], error: String(err) })
    } finally {
      setTestTelnyxLoading(false)
    }
  }

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
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-lg font-semibold text-gray-200">Usage & Cost</h3>
        <div className="flex items-center gap-2">
          {refreshFeedback && (
            <span className="text-sm text-gray-400">{refreshFeedback}</span>
          )}
          <button
          type="button"
          onClick={onRefresh}
          disabled={refreshLoading}
          className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 rounded-lg text-sm font-medium transition"
        >
          {refreshLoading ? 'Syncing…' : 'Refresh Usage'}
        </button>
          <button
            type="button"
            onClick={handleTestTelnyx}
            disabled={testTelnyxLoading}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-500 disabled:opacity-50 rounded-lg text-sm font-medium transition"
          >
            {testTelnyxLoading ? 'Testing…' : 'Test Telnyx API'}
          </button>
        </div>
      </div>
      {/* Sync debug log */}
      {refreshDebugLog.length > 0 && (
        <div className="bg-gray-900/80 rounded-xl p-4 border border-gray-700 overflow-hidden">
          <h4 className="text-sm font-medium text-gray-300 mb-2">Sync Debug Log</h4>
          <div className="font-mono text-xs text-gray-400 max-h-64 overflow-y-auto space-y-0.5">
            {refreshDebugLog.map((line, i) => (
              <div key={i} className="whitespace-pre-wrap break-all">
                {line.includes('✓ MATCHED') ? (
                  <span className="text-green-400">{line}</span>
                ) : line.includes('✗ NO MATCH') ? (
                  <span className="text-amber-400">{line}</span>
                ) : line.includes('SYNC ERROR') ? (
                  <span className="text-red-400">{line}</span>
                ) : (
                  line
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-4">
        <div className="bg-gray-800/50 rounded-lg p-3">
          <p className="text-xs text-gray-500">SMS sent (week)</p>
          <p className="text-xl font-bold text-white">{data.sms.thisWeek}</p>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-3">
          <p className="text-xs text-gray-500">SMS sent (all time)</p>
          <p className="text-xl font-bold text-white">{data.sms.allTime}</p>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-3">
          <p className="text-xs text-gray-500">Missed-call SMS</p>
          <p className="text-xl font-bold text-white">{data.missedCallSmsTriggered}</p>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-3">
          <p className="text-xs text-gray-500">Skipped (cooldown)</p>
          <p className="text-xl font-bold text-amber-400">{data.skips.cooldown}</p>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-3">
          <p className="text-xs text-gray-500">Skipped (contact)</p>
          <p className="text-xl font-bold text-blue-400">{data.skips.existingContact}</p>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-3">
          <p className="text-xs text-gray-500">Skipped (blocked)</p>
          <p className="text-xl font-bold text-red-400">{data.skips.blocked}</p>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-3">
          <p className="text-xs text-gray-500">Money saved</p>
          <p className="text-xl font-bold text-green-400">${data.moneySaved.toFixed(2)}</p>
        </div>
      </div>
      {/* Cost panel - real Telnyx MDR/CDR data */}
      <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
        <h4 className="text-sm font-medium text-gray-300 mb-3">Cost Overview (from Telnyx MDR/CDR)</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-gray-500">This week</p>
            <p className="font-bold text-white">${data.cost.totalThisWeek.toFixed(2)}</p>
            <p className="text-xs text-gray-400">SMS: ${data.cost.smsThisWeek.toFixed(2)} · Calls: ${data.cost.callThisWeek.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">All time</p>
            <p className="font-bold text-white">${data.cost.totalAllTime.toFixed(2)}</p>
            <p className="text-xs text-gray-400">SMS: ${data.cost.smsAllTime.toFixed(2)} · Calls: ${data.cost.callAllTime.toFixed(2)}</p>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-2">Synced from Telnyx. Click Refresh Usage to fetch latest.</p>
      </div>
      {/* Skip logs */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-gray-300">Skip Logs — every skipped message with reason</h4>
        <div className="bg-gray-800/30 rounded-lg border border-gray-800 overflow-hidden max-h-48 overflow-y-auto">
          {data.skipLogs.length === 0 ? (
            <p className="p-4 text-gray-500 text-sm">No skips recorded yet</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-900/50 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 text-gray-400">Time</th>
                  <th className="text-left px-3 py-2 text-gray-400">Phone</th>
                  <th className="text-left px-3 py-2 text-gray-400">Reason</th>
                  <th className="text-left px-3 py-2 text-gray-400">Type</th>
                </tr>
              </thead>
              <tbody>
                {data.skipLogs.map((log) => (
                  <tr key={log.id} className="border-t border-gray-800/50">
                    <td className="px-3 py-2 text-gray-300 whitespace-nowrap">
                      {new Date(log.attemptedAt).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-gray-300">{formatPhone(log.phoneNumber)}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        log.reason === 'cooldown' ? 'bg-amber-500/20 text-amber-400' :
                        log.reason === 'existing_contact' ? 'bg-blue-500/20 text-blue-400' :
                        log.reason === 'blocked' ? 'bg-red-500/20 text-red-400' :
                        'bg-gray-500/20 text-gray-400'
                      }`}>
                        {skipReasonLabel[log.reason] ?? log.reason}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-500">{log.messageType ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      {/* Recent message activity */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-gray-300">Recent Message Activity</h4>
        <div className="bg-gray-800/30 rounded-lg border border-gray-800 overflow-hidden max-h-48 overflow-y-auto">
          {data.recentMessages.length === 0 ? (
            <p className="p-4 text-gray-500 text-sm">No messages yet</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-900/50 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 text-gray-400">Time</th>
                  <th className="text-left px-3 py-2 text-gray-400">From</th>
                  <th className="text-left px-3 py-2 text-gray-400">Dir</th>
                  <th className="text-left px-3 py-2 text-gray-400">Content</th>
                  <th className="text-right px-3 py-2 text-gray-400">Cost</th>
                </tr>
              </thead>
              <tbody>
                {data.recentMessages.map((m) => (
                  <tr key={m.id} className="border-t border-gray-800/50">
                    <td className="px-3 py-2 text-gray-300 whitespace-nowrap">
                      {new Date(m.createdAt).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-gray-300">{formatPhone(m.callerPhone)}</td>
                    <td className="px-3 py-2">
                      <span className={m.direction === 'outbound' ? 'text-blue-400' : 'text-gray-400'}>
                        {m.direction === 'outbound' ? 'Out' : 'In'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-400 max-w-xs truncate">{m.content}</td>
                    <td className="px-3 py-2 text-right text-gray-400">
                      {m.cost != null ? `$${m.cost.toFixed(4)}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      {/* Telnyx API Test Modal */}
      {testTelnyxResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setTestTelnyxResult(null)}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-700 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Telnyx API Debug — Messaging Records (last 7 days)</h3>
              <button onClick={() => setTestTelnyxResult(null)} className="text-gray-400 hover:text-white">✕</button>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              {testTelnyxResult.error ? (
                <p className="text-red-400 mb-4">Error: {testTelnyxResult.error}</p>
              ) : (
                <p className="text-gray-300 mb-4">
                  <strong>Total records returned:</strong> {testTelnyxResult.totalCount}
                </p>
              )}
              {testTelnyxResult.records && testTelnyxResult.records.length > 0 && (
                <div className="mb-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-400 border-b border-gray-700">
                        <th className="py-2 pr-4">From</th>
                        <th className="py-2 pr-4">To</th>
                        <th className="py-2 pr-4">Direction</th>
                        <th className="py-2 pr-4">Cost</th>
                        <th className="py-2">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {testTelnyxResult.records.map((r, i) => (
                        <tr key={i} className="border-b border-gray-800/50">
                          <td className="py-2 pr-4 text-gray-200 font-mono text-xs">{r.from}</td>
                          <td className="py-2 pr-4 text-gray-200 font-mono text-xs">{r.to}</td>
                          <td className="py-2 pr-4 text-gray-300">{r.direction}</td>
                          <td className="py-2 pr-4 text-amber-400">{r.cost}</td>
                          <td className="py-2 text-gray-400 text-xs">{r.created_at}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {testTelnyxResult.records?.length === 0 && !testTelnyxResult.error && (
                <p className="text-gray-500 italic">No records returned from Telnyx.</p>
              )}
              {testTelnyxResult.raw && (
                <details className="mt-4">
                  <summary className="text-sm text-gray-400 cursor-pointer hover:text-gray-300">Raw API response</summary>
                  <pre className="mt-2 p-3 bg-gray-950 rounded text-xs text-gray-400 overflow-x-auto max-h-64 overflow-y-auto">
                    {JSON.stringify(testTelnyxResult.raw as Record<string, unknown>, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          </div>
        </div>
      )}
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

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-1.5">{label}</label>
      {hint && <p className="text-xs text-gray-500 mb-1.5">{hint}</p>}
      {children}
    </div>
  )
}
