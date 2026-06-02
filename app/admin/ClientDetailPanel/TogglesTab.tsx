'use client'

import { useState } from 'react'
import { MessageCircle, Shield, ShieldCheck, Phone, Calendar, Megaphone, Globe, Mail, MessageSquare, CheckCircle, XCircle, Mailbox, Voicemail } from 'lucide-react'
import type { AdminBusiness } from '../types'

interface Props {
  business: AdminBusiness
  onUpdateBusiness: (updated: AdminBusiness) => void
  onToast: (message: string, type: 'success' | 'error') => void
}

interface ToggleRowProps {
  icon: React.ComponentType<{ className?: string }>
  label: string
  description: string
  checked: boolean
  onToggle: () => void
  disabled?: boolean
  children?: React.ReactNode
}

function Toggle({ checked, onToggle, disabled }: { checked: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={onToggle}
      disabled={disabled}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-40 ${
        checked ? 'bg-blue-500' : 'bg-gray-700'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-[18px]' : 'translate-x-[3px]'
        }`}
      />
    </button>
  )
}

function ToggleRow({ icon: Icon, label, description, checked, onToggle, disabled, children }: ToggleRowProps) {
  return (
    <div className="py-4 border-b border-gray-800/50 last:border-0">
      <div className="flex items-center gap-3">
        <div className={`p-1.5 rounded-lg shrink-0 ${checked ? 'bg-blue-500/10' : 'bg-gray-800'}`}>
          <Icon className={`h-4 w-4 ${checked ? 'text-blue-400' : 'text-gray-500'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-200">{label}</p>
          <p className="text-xs text-gray-500 mt-0.5">{description}</p>
        </div>
        <Toggle checked={checked} onToggle={onToggle} disabled={disabled} />
      </div>
      {children && checked && (
        <div className="mt-3 ml-9">{children}</div>
      )}
    </div>
  )
}

export function TogglesTab({ business, onUpdateBusiness, onToast }: Props) {
  const [saving, setSaving] = useState<string | null>(null)
  const [screenerMsg, setScreenerMsg] = useState(business.callScreenerMessage ?? '')
  const [editingMsg, setEditingMsg] = useState(false)
  const [forwardingNum, setForwardingNum] = useState(business.forwardingNumber ?? '')
  const [editingFwd, setEditingFwd] = useState(false)

  async function patch(field: string, value: unknown, label: string) {
    const original = { ...business }
    // Optimistic update
    onUpdateBusiness({ ...business, [field]: value } as AdminBusiness)
    setSaving(field)
    try {
      const res = await fetch(`/api/admin/businesses/${business.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      const data = await res.json()
      if (!res.ok) {
        onUpdateBusiness(original)
        onToast(data.error || `Failed to update ${label}`, 'error')
      } else {
        const merged: AdminBusiness = {
          ...original,
          ...data.business,
          _count: original._count,
          conversationsThisMonth: original.conversationsThisMonth,
          conversationsLastMonth: original.conversationsLastMonth,
          leadsThisMonth: original.leadsThisMonth,
        }
        onUpdateBusiness(merged)
      }
    } catch {
      onUpdateBusiness(original)
      onToast(`Failed to update ${label}`, 'error')
    } finally {
      setSaving(null)
    }
  }

  async function saveScreenerMessage() {
    await patch('callScreenerMessage', screenerMsg || null, 'screener message')
    setEditingMsg(false)
  }

  async function saveForwarding() {
    await patch('forwardingNumber', forwardingNum.trim() || null, 'forwarding number')
    setEditingFwd(false)
  }

  const isForwardingOn = Boolean(business.forwardingNumber)

  return (
    <div className="px-4 sm:px-6 py-4">
      {/* Forwarding (string field, toggle-like) */}
      <div className="py-4 border-b border-gray-800/50">
        <div className="flex items-center gap-3">
          <div className={`p-1.5 rounded-lg shrink-0 ${isForwardingOn ? 'bg-blue-500/10' : 'bg-gray-800'}`}>
            <Phone className={`h-4 w-4 ${isForwardingOn ? 'text-blue-400' : 'text-gray-500'}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-200">Call Forwarding</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {isForwardingOn
                ? `Ringing ${business.forwardingNumber} before AI takes over`
                : 'No forwarding — AI answers immediately'}
            </p>
          </div>
          <Toggle
            checked={isForwardingOn}
            onToggle={() => {
              if (isForwardingOn) {
                patch('forwardingNumber', null, 'forwarding')
                setForwardingNum('')
                setEditingFwd(false)
              } else {
                setEditingFwd(true)
              }
            }}
            disabled={saving === 'forwardingNumber'}
          />
        </div>
        {(isForwardingOn || editingFwd) && (
          <div className="mt-3 ml-9 flex items-center gap-2">
            <input
              type="tel"
              value={forwardingNum}
              onChange={e => setForwardingNum(e.target.value)}
              placeholder="+13095551234"
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-gray-500"
            />
            {editingFwd || forwardingNum !== (business.forwardingNumber ?? '') ? (
              <>
                <button
                  onClick={saveForwarding}
                  disabled={!forwardingNum.trim() && editingFwd}
                  className="text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg"
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setForwardingNum(business.forwardingNumber ?? '')
                    setEditingFwd(false)
                  }}
                  className="text-xs text-gray-500 hover:text-gray-300"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                onClick={() => setEditingFwd(true)}
                className="text-xs text-gray-500 hover:text-gray-300"
              >
                Edit
              </button>
            )}
          </div>
        )}
      </div>

      <ToggleRow
        icon={MessageCircle}
        label="MissedCall AI"
        description="Send AI SMS after every missed call"
        checked={business.missedCallAiEnabled}
        onToggle={() => patch('missedCallAiEnabled', !business.missedCallAiEnabled, 'MissedCall AI')}
        disabled={saving === 'missedCallAiEnabled'}
      />

      <ToggleRow
        icon={Voicemail}
        label="Send known contacts to voicemail"
        description="On a missed call, route the client's own saved contacts to voicemail instead of the AI SMS. Forwarding still rings the owner first."
        checked={business.knownContactVoicemailEnabled}
        onToggle={() => patch('knownContactVoicemailEnabled', !business.knownContactVoicemailEnabled, 'known-contact voicemail')}
        disabled={saving === 'knownContactVoicemailEnabled'}
      />

      <ToggleRow
        icon={Shield}
        label="Call Screener (IVR)"
        description="Caller must press 1 before connecting — blocks robocalls"
        checked={business.callScreenerEnabled}
        onToggle={() => patch('callScreenerEnabled', !business.callScreenerEnabled, 'call screener')}
        disabled={saving === 'callScreenerEnabled'}
      >
        <div className="space-y-2">
          <p className="text-xs text-gray-500 font-medium">IVR Message</p>
          {editingMsg ? (
            <div className="space-y-2">
              <textarea
                value={screenerMsg}
                onChange={e => setScreenerMsg(e.target.value)}
                rows={2}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gray-500"
              />
              <div className="flex gap-2">
                <button
                  onClick={saveScreenerMessage}
                  className="text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-lg"
                >
                  Save
                </button>
                <button
                  onClick={() => { setScreenerMsg(business.callScreenerMessage ?? ''); setEditingMsg(false) }}
                  className="text-xs text-gray-500 hover:text-gray-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm text-gray-400 italic flex-1">
                &ldquo;{screenerMsg || `Thank you for calling ${business.name}. To be connected, please press 1.`}&rdquo;
              </p>
              <button onClick={() => setEditingMsg(true)} className="text-xs text-blue-400 hover:text-blue-300 shrink-0">
                Edit
              </button>
            </div>
          )}
        </div>
      </ToggleRow>

      <ToggleRow
        icon={ShieldCheck}
        label="Spam Filter"
        description="Auto-reject toll-free and invalid area code callers"
        checked={business.spamFilterEnabled}
        onToggle={() => patch('spamFilterEnabled', !business.spamFilterEnabled, 'spam filter')}
        disabled={saving === 'spamFilterEnabled'}
      />

      <ToggleRow
        icon={Globe}
        label="Online Booking"
        description="Enable /book page, SMS booking flow, and calendar slot selection"
        checked={business.calendarEnabled}
        onToggle={() => patch('calendarEnabled', !business.calendarEnabled, 'online booking')}
        disabled={saving === 'calendarEnabled'}
      />

      <ToggleRow
        icon={MessageSquare}
        label="SMS Auto-Booking"
        description="When off, the SMS AI will capture leads instead of trying to book appointments, even if calendar is connected. Use this when the client wants website-only booking."
        checked={business.smsBookingEnabled}
        onToggle={() => patch('smsBookingEnabled', !business.smsBookingEnabled, 'SMS auto-booking')}
        disabled={saving === 'smsBookingEnabled'}
      />

      {/* Google Calendar — read-only status badge */}
      <div className="py-4 border-b border-gray-800/50">
        <div className="flex items-center gap-3">
          <div className={`p-1.5 rounded-lg shrink-0 ${business.googleCalendarConnected ? 'bg-green-500/10' : 'bg-gray-800'}`}>
            <Calendar className={`h-4 w-4 ${business.googleCalendarConnected ? 'text-green-400' : 'text-gray-500'}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-200">Google Calendar</p>
            <p className="text-xs text-gray-500 mt-0.5">OAuth connection status</p>
          </div>
          <div className="flex items-center gap-2">
            {business.googleCalendarConnected ? (
              <span className="flex items-center gap-1 text-xs text-green-400 bg-green-500/10 px-2 py-1 rounded-full">
                <CheckCircle className="h-3 w-3" />
                Connected
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-gray-400 bg-gray-500/10 px-2 py-1 rounded-full">
                <XCircle className="h-3 w-3" />
                Not Connected
              </span>
            )}
          </div>
        </div>
        <div className="mt-2 ml-9">
          <a
            href={`/api/auth/google?businessId=${business.id}`}
            className="text-xs text-blue-400 hover:text-blue-300 transition"
          >
            {business.googleCalendarConnected ? 'Reconnect Google Calendar →' : 'Connect Google Calendar →'}
          </a>
        </div>
      </div>

      <ToggleRow
        icon={Megaphone}
        label="Google Ads Dashboard"
        description="Show Google Ads performance tab in client dashboard"
        checked={business.googleAdsEnabled}
        onToggle={() => patch('googleAdsEnabled', !business.googleAdsEnabled, 'Google Ads')}
        disabled={saving === 'googleAdsEnabled'}
      />

      <ToggleRow
        icon={MessageSquare}
        label="Notify by SMS"
        description="Send owner SMS on bookings, leads, and human-needed alerts"
        checked={business.notifyBySms}
        onToggle={() => patch('notifyBySms', !business.notifyBySms, 'SMS notifications')}
        disabled={saving === 'notifyBySms'}
      />

      <ToggleRow
        icon={Mail}
        label="Notify by Email"
        description="Send owner email on bookings, leads, and human-needed alerts"
        checked={business.notifyByEmail}
        onToggle={() => patch('notifyByEmail', !business.notifyByEmail, 'email notifications')}
        disabled={saving === 'notifyByEmail'}
      />

      <ToggleRow
        icon={Mailbox}
        label="Mass Outreach"
        description="Email + SMS campaigns to contact list"
        checked={business.massMessagingEnabled}
        onToggle={() => patch('massMessagingEnabled', !business.massMessagingEnabled, 'mass outreach')}
        disabled={saving === 'massMessagingEnabled'}
      />
    </div>
  )
}
