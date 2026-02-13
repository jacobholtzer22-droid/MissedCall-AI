'use client'

import { useEffect, useState } from 'react'
import { useUser } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'

interface Business {
  id: string
  name: string
  slug: string
  twilioPhoneNumber: string | null
  timezone: string
  businessHours: any
  servicesOffered: any
  aiGreeting: string | null
  aiInstructions: string | null
  aiContext: string | null
  subscriptionStatus: string
  createdAt: string
  updatedAt: string
  _count: {
    conversations: number
    appointments: number
    users: number
  }
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

  function startEdit(business: Business) {
    setSelectedBusiness(business)
    setEditMode(true)
    setEditData({
      name: business.name,
      twilioPhoneNumber: business.twilioPhoneNumber || '',
      timezone: business.timezone,
      aiGreeting: business.aiGreeting || '',
      aiInstructions: business.aiInstructions || '',
      aiContext: business.aiContext || '',
      subscriptionStatus: business.subscriptionStatus,
      servicesOffered: business.servicesOffered
        ? JSON.stringify(business.servicesOffered, null, 2)
        : '[]',
      businessHours: business.businessHours
        ? JSON.stringify(business.businessHours, null, 2)
        : '{}',
    })
    setMessage('')
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
          twilioPhoneNumber: editData.twilioPhoneNumber || null,
          timezone: editData.timezone,
          aiGreeting: editData.aiGreeting || null,
          aiInstructions: editData.aiInstructions || null,
          aiContext: editData.aiContext || null,
          subscriptionStatus: editData.subscriptionStatus,
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
        <div className="grid grid-cols-4 gap-4 mb-8">
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
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 text-sm">
                    <div>
                      <span className="text-gray-500">Twilio Number</span>
                      <p className={business.twilioPhoneNumber ? 'text-green-400' : 'text-red-400'}>
                        {business.twilioPhoneNumber || 'NOT ASSIGNED'}
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

                  {business.aiGreeting && (
                    <div className="mt-3 text-sm">
                      <span className="text-gray-500">AI Greeting: </span>
                      <span className="text-gray-400 italic">&quot;{business.aiGreeting}&quot;</span>
                    </div>
                  )}
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

              {/* Twilio Number */}
              <Field
                label="Twilio Phone Number"
                hint="Buy in Twilio console, paste here. Format: +1XXXXXXXXXX"
              >
                <input
                  type="text"
                  value={editData.twilioPhoneNumber}
                  onChange={e => setEditData({ ...editData, twilioPhoneNumber: e.target.value })}
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
