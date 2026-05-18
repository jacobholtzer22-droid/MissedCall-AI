'use client'

import { useState, useEffect, useRef } from 'react'
import { DEFAULT_BUSINESS_HOURS } from '@/lib/business-hours'
import { BUSINESS_TYPE_OPTIONS } from '@/lib/industry-defaults'
import type { AdminBusiness } from '../types'

interface Props {
  business: AdminBusiness
  onUpdateBusiness: (updated: AdminBusiness) => void
  onToast: (message: string, type: 'success' | 'error') => void
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</label>
      {hint && <p className="text-xs text-gray-600">{hint}</p>}
      {children}
    </div>
  )
}

function SectionHeader({ title }: { title: string }) {
  return (
    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider pt-2 pb-1 border-b border-gray-800 mb-4">
      {title}
    </h3>
  )
}

const INPUT = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-gray-500'
const TEXTAREA = `${INPUT} resize-none`
const SELECT = `${INPUT} cursor-pointer`

function initForm(b: AdminBusiness) {
  return {
    name: b.name,
    telnyxPhoneNumber: b.telnyxPhoneNumber ?? '',
    forwardingNumber: b.forwardingNumber ?? '',
    timezone: b.timezone,
    businessType: b.businessType ?? '',
    // Billing
    subscriptionStatus: b.subscriptionStatus,
    setupFee: b.setupFee != null ? String(b.setupFee) : '',
    monthlyFee: b.monthlyFee != null ? String(b.monthlyFee) : '',
    // Notifications
    ownerEmail: b.ownerEmail ?? '',
    ownerPhone: b.ownerPhone ?? '',
    // AI
    aiGreeting: b.aiGreeting ?? '',
    aiInstructions: b.aiInstructions ?? '',
    aiContext: b.aiContext ?? '',
    missedCallVoiceMessage: b.missedCallVoiceMessage ?? '',
    // Booking
    slotDurationMinutes: String(b.slotDurationMinutes ?? 30),
    bufferMinutes: String(b.bufferMinutes ?? 0),
    bookingPageTitle: b.bookingPageTitle ?? '',
    bookingPageServiceLabel: b.bookingPageServiceLabel ?? '',
    bookingPageConfirmation: b.bookingPageConfirmation ?? '',
    maxMessagesPerConversation: String(b.maxMessagesPerConversation ?? 23),
    // Google Ads
    googleAdsCustomerId: b.googleAdsCustomerId ?? '',
    googleAdsTabLabel: b.googleAdsTabLabel ?? '',
    // Admin
    adminNotes: b.adminNotes ?? '',
    smsCooldownDays: b.smsCooldownDays != null ? String(b.smsCooldownDays) : '',
    cooldownBypassNumbers: Array.isArray(b.cooldownBypassNumbers)
      ? (b.cooldownBypassNumbers as string[]).join(', ')
      : '',
    servicesOffered: b.servicesOffered ? JSON.stringify(b.servicesOffered, null, 2) : '[]',
    businessHours: b.businessHours ? JSON.stringify(b.businessHours, null, 2) : '',
  }
}

export function SettingsTab({ business, onUpdateBusiness, onToast }: Props) {
  const [form, setForm] = useState(() => initForm(business))
  const [saving, setSaving] = useState(false)
  const prevIdRef = useRef(business.id)

  // Reset form when switching to a different business
  useEffect(() => {
    if (prevIdRef.current !== business.id) {
      prevIdRef.current = business.id
      setForm(initForm(business))
    }
  }, [business])

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function save() {
    // Validate JSON fields
    let servicesOffered: unknown
    let businessHours: unknown
    try {
      servicesOffered = JSON.parse(form.servicesOffered || '[]')
    } catch {
      onToast('Services Offered is not valid JSON', 'error')
      return
    }
    try {
      const raw = form.businessHours.trim()
      businessHours = raw ? JSON.parse(raw) : DEFAULT_BUSINESS_HOURS
    } catch {
      onToast('Business Hours is not valid JSON', 'error')
      return
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/admin/businesses/${business.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          telnyxPhoneNumber: form.telnyxPhoneNumber || null,
          forwardingNumber: form.forwardingNumber || null,
          timezone: form.timezone,
          businessType: form.businessType || null,
          subscriptionStatus: form.subscriptionStatus,
          setupFee: form.setupFee !== '' ? parseFloat(form.setupFee) : null,
          monthlyFee: form.monthlyFee !== '' ? parseFloat(form.monthlyFee) : null,
          ownerEmail: form.ownerEmail.trim() || null,
          ownerPhone: form.ownerPhone.trim() || null,
          aiGreeting: form.aiGreeting || null,
          aiInstructions: form.aiInstructions || null,
          aiContext: form.aiContext || null,
          missedCallVoiceMessage: form.missedCallVoiceMessage || null,
          slotDurationMinutes: parseInt(form.slotDurationMinutes, 10),
          bufferMinutes: parseInt(form.bufferMinutes, 10),
          bookingPageTitle: form.bookingPageTitle || null,
          bookingPageServiceLabel: form.bookingPageServiceLabel || null,
          bookingPageConfirmation: form.bookingPageConfirmation || null,
          maxMessagesPerConversation: form.maxMessagesPerConversation !== ''
            ? parseInt(form.maxMessagesPerConversation, 10)
            : undefined,
          googleAdsCustomerId: form.googleAdsCustomerId.trim() || null,
          googleAdsTabLabel: form.googleAdsTabLabel.trim() || null,
          adminNotes: form.adminNotes || null,
          smsCooldownDays: form.smsCooldownDays !== '' ? parseInt(form.smsCooldownDays, 10) : null,
          cooldownBypassNumbers: form.cooldownBypassNumbers || '',
          servicesOffered,
          businessHours,
        }),
      })

      const data = await res.json()
      if (res.ok) {
        const merged: AdminBusiness = {
          ...business,
          ...data.business,
          _count: business._count,
          conversationsThisMonth: business.conversationsThisMonth,
          conversationsLastMonth: business.conversationsLastMonth,
          leadsThisMonth: business.leadsThisMonth,
        }
        onUpdateBusiness(merged)
        setForm(initForm(merged))
        onToast('Saved successfully', 'success')
      } else {
        onToast(data.error || 'Failed to save', 'error')
      }
    } catch {
      onToast('Network error', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="px-4 sm:px-6 py-4 space-y-5">
      {/* Business Info */}
      <div>
        <SectionHeader title="Business Info" />
        <div className="space-y-3">
          <Field label="Name">
            <input className={INPUT} value={form.name} onChange={e => set('name', e.target.value)} />
          </Field>
          <Field label="Telnyx Phone" hint="Format: +1XXXXXXXXXX">
            <input className={INPUT} value={form.telnyxPhoneNumber} onChange={e => set('telnyxPhoneNumber', e.target.value)} placeholder="+18335551234" />
          </Field>
          <Field label="Forwarding Number" hint="Owner's real phone — rings before AI">
            <input className={INPUT} value={form.forwardingNumber} onChange={e => set('forwardingNumber', e.target.value)} placeholder="+13095551234" />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Timezone">
              <select className={SELECT} value={form.timezone} onChange={e => set('timezone', e.target.value)}>
                <option value="America/New_York">Eastern</option>
                <option value="America/Chicago">Central</option>
                <option value="America/Denver">Mountain</option>
                <option value="America/Los_Angeles">Pacific</option>
                <option value="America/Anchorage">Alaska</option>
                <option value="Pacific/Honolulu">Hawaii</option>
              </select>
            </Field>
            <Field label="Industry">
              <select className={SELECT} value={form.businessType} onChange={e => set('businessType', e.target.value)}>
                <option value="">Select...</option>
                {BUSINESS_TYPE_OPTIONS.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </Field>
          </div>
        </div>
      </div>

      {/* Billing */}
      <div>
        <SectionHeader title="Billing" />
        <div className="space-y-3">
          <Field label="Subscription Status">
            <select className={SELECT} value={form.subscriptionStatus} onChange={e => set('subscriptionStatus', e.target.value)}>
              <option value="trialing">Trialing</option>
              <option value="active">Active</option>
              <option value="past_due">Past Due</option>
              <option value="canceled">Canceled</option>
            </select>
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Setup Fee ($)">
              <input type="number" className={INPUT} value={form.setupFee} onChange={e => set('setupFee', e.target.value)} placeholder="400" />
            </Field>
            <Field label="Monthly Fee ($)">
              <input type="number" className={INPUT} value={form.monthlyFee} onChange={e => set('monthlyFee', e.target.value)} placeholder="290" />
            </Field>
          </div>
        </div>
      </div>

      {/* Notifications */}
      <div>
        <SectionHeader title="Notifications" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Owner Email">
            <input type="email" className={INPUT} value={form.ownerEmail} onChange={e => set('ownerEmail', e.target.value)} placeholder="owner@business.com" />
          </Field>
          <Field label="Owner Phone">
            <input type="tel" className={INPUT} value={form.ownerPhone} onChange={e => set('ownerPhone', e.target.value)} placeholder="+13095551234" />
          </Field>
        </div>
      </div>

      {/* AI Config */}
      <div>
        <SectionHeader title="AI Configuration" />
        <div className="space-y-3">
          <Field label="AI Greeting" hint="First SMS sent after missed call">
            <textarea className={TEXTAREA} rows={2} value={form.aiGreeting} onChange={e => set('aiGreeting', e.target.value)} placeholder="Hey! Sorry we missed your call..." />
          </Field>
          <Field label="AI Instructions" hint="Personality and rules for the AI">
            <textarea className={TEXTAREA} rows={3} value={form.aiInstructions} onChange={e => set('aiInstructions', e.target.value)} placeholder="Be friendly and professional..." />
          </Field>
          <Field label="AI Context" hint="Business info, pricing, policies">
            <textarea className={TEXTAREA} rows={4} value={form.aiContext} onChange={e => set('aiContext', e.target.value)} placeholder="We are a mobile auto detailing business..." />
          </Field>
          <Field label="Voicemail Voice Message" hint="TTS message played when call isn't answered">
            <textarea className={TEXTAREA} rows={2} value={form.missedCallVoiceMessage} onChange={e => set('missedCallVoiceMessage', e.target.value)} />
          </Field>
        </div>
      </div>

      {/* Booking */}
      <div>
        <SectionHeader title="Booking" />
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Slot Duration (min)">
              <select className={SELECT} value={form.slotDurationMinutes} onChange={e => set('slotDurationMinutes', e.target.value)}>
                {[15, 30, 45, 60, 90, 120].map(v => <option key={v} value={v}>{v} min</option>)}
              </select>
            </Field>
            <Field label="Buffer (min)">
              <select className={SELECT} value={form.bufferMinutes} onChange={e => set('bufferMinutes', e.target.value)}>
                {[0, 15, 30, 45, 60].map(v => <option key={v} value={v}>{v === 0 ? 'None' : `${v} min`}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Booking Page Title">
            <input className={INPUT} value={form.bookingPageTitle} onChange={e => set('bookingPageTitle', e.target.value)} placeholder="Schedule a Free In-Person Quote" />
          </Field>
          <Field label="Service Label">
            <input className={INPUT} value={form.bookingPageServiceLabel} onChange={e => set('bookingPageServiceLabel', e.target.value)} placeholder="What do you need a quote for?" />
          </Field>
          <Field label="Confirmation Message">
            <textarea className={TEXTAREA} rows={2} value={form.bookingPageConfirmation} onChange={e => set('bookingPageConfirmation', e.target.value)} placeholder="You're all set! ..." />
          </Field>
          <Field label="Max Messages Per Conversation">
            <input type="number" min={5} max={50} className={`${INPUT} w-24`} value={form.maxMessagesPerConversation} onChange={e => set('maxMessagesPerConversation', e.target.value)} />
          </Field>
        </div>
      </div>

      {/* Services & Hours */}
      <div>
        <SectionHeader title="Services & Hours" />
        <div className="space-y-3">
          <Field label='Services Offered (JSON)' hint='["Lawn mowing", "Hedge trimming"]'>
            <textarea className={`${TEXTAREA} font-mono text-xs`} rows={4} value={form.servicesOffered} onChange={e => set('servicesOffered', e.target.value)} />
          </Field>
          <Field label="Business Hours (JSON)" hint='{"monday":{"open":"09:00","close":"17:00","closed":false},...}'>
            <div className="flex gap-2">
              <textarea className={`${TEXTAREA} font-mono text-xs flex-1`} rows={4} value={form.businessHours} onChange={e => set('businessHours', e.target.value)} />
              <button
                type="button"
                onClick={() => set('businessHours', JSON.stringify(DEFAULT_BUSINESS_HOURS, null, 2))}
                className="self-start px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-xs shrink-0"
              >
                Default
              </button>
            </div>
          </Field>
        </div>
      </div>

      {/* Google Ads */}
      <div>
        <SectionHeader title="Google Ads" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Customer ID" hint="No dashes">
            <input className={INPUT} value={form.googleAdsCustomerId} onChange={e => set('googleAdsCustomerId', e.target.value)} placeholder="1234567890" />
          </Field>
          <Field label="Tab Label">
            <input className={INPUT} value={form.googleAdsTabLabel} onChange={e => set('googleAdsTabLabel', e.target.value)} placeholder="Google Ads" />
          </Field>
        </div>
      </div>

      {/* Admin */}
      <div>
        <SectionHeader title="Admin Only" />
        <div className="space-y-3">
          <Field label="Admin Notes" hint="Private, not visible to client">
            <textarea className={TEXTAREA} rows={3} value={form.adminNotes} onChange={e => set('adminNotes', e.target.value)} placeholder="Private notes..." />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="SMS Cooldown (days)" hint="Blank = use env default">
              <input type="number" className={INPUT} value={form.smsCooldownDays} onChange={e => set('smsCooldownDays', e.target.value)} placeholder="7" />
            </Field>
            <Field label="Bypass Numbers" hint="Skip cooldown for testing">
              <input className={INPUT} value={form.cooldownBypassNumbers} onChange={e => set('cooldownBypassNumbers', e.target.value)} placeholder="+15551234567" />
            </Field>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2 pb-4 border-t border-gray-800 sticky bottom-0 bg-gray-900">
        <button
          onClick={save}
          disabled={saving}
          className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 rounded-lg py-2.5 text-sm font-medium transition"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
        <button
          onClick={() => setForm(initForm(business))}
          disabled={saving}
          className="px-5 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded-lg py-2.5 text-sm font-medium transition"
        >
          Reset
        </button>
      </div>
    </div>
  )
}
