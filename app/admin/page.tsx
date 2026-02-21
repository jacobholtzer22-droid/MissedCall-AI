'use client'

import { useEffect, useState } from 'react'
import { useUser } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { CallScreenerCard } from './components/CallScreenerCard'

interface Business {
  id: string
  name: string
  slug: string
  telnyxPhoneNumber: string | null
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

  function startEdit(business: Business) {
    setSelectedBusiness(business)
    setEditMode(true)
    setEditData({
      name: business.name,
      telnyxPhoneNumber: business.telnyxPhoneNumber || '',
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
    fetchBlockedNumbers(business.id)
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
                      <span className="text-gray-500">Telnyx Number</span>
                      <p className={business.telnyxPhoneNumber ? 'text-green-400' : 'text-red-400'}>
                        {business.telnyxPhoneNumber || 'NOT ASSIGNED'}
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
                </div>

                <div className="flex gap-2 ml-4">
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
