'use client'

// New client: put a client on the board who has no Stripe customer or signup
// yet (POST /api/admin/ops/engagements, the new-client body). Name, contact,
// email, phone, trade, location, services, upfront (and when it was paid),
// monthly, "also create the platform account", an optional Stripe customer
// id, notes. On success the board reloads and the client's panel opens.

import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { SERVICE_KEYS } from '@/lib/ops/types'
import { button, primaryButton, smallControl } from './opsUi'

const label = 'block text-xs font-medium text-gray-500 mb-1'

export function NewClientDialog({
  onCreate,
  onClose,
}: {
  /** Returns null on success, else the error to show. */
  onCreate: (body: Record<string, unknown>) => Promise<string | null>
  onClose: () => void
}) {
  const [f, setF] = useState({
    displayName: '',
    contactName: '',
    email: '',
    phone: '',
    trade: '',
    location: '',
    upfrontAmount: '',
    upfrontPaidAt: '',
    monthlyAmount: '',
    stripeCustomerId: '',
    notes: '',
  })
  const [services, setServices] = useState<string[]>(['website'])
  const [createBusiness, setCreateBusiness] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const first = useRef<HTMLInputElement>(null)

  useEffect(() => {
    first.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((p) => ({ ...p, [k]: e.target.value }))
  const text = (v: string) => v.trim() || undefined
  const num = (v: string) => (v.trim() ? Number(v.replace(/[$,\s]/g, '')) : undefined)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!f.displayName.trim()) return setError('The business name is required.')
    setBusy(true)
    setError(null)
    const body = Object.fromEntries(
      Object.entries({
        displayName: f.displayName.trim(),
        contactName: text(f.contactName),
        email: text(f.email),
        phone: text(f.phone),
        trade: text(f.trade),
        location: text(f.location),
        services,
        upfrontAmount: num(f.upfrontAmount),
        // 16:00 UTC is midday in Detroit, so the date never reads as the evening before.
        upfrontPaidAt: f.upfrontPaidAt ? `${f.upfrontPaidAt}T16:00:00.000Z` : undefined,
        monthlyAmount: num(f.monthlyAmount),
        stripeCustomerId: text(f.stripeCustomerId),
        createBusiness,
        notes: text(f.notes),
      }).filter(([, v]) => v !== undefined)
    )
    const err = await onCreate(body)
    setBusy(false)
    if (err) setError(err)
  }

  const field = (k: keyof typeof f, name: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block">
      <span className={label}>{name}</span>
      <input value={f[k]} onChange={set(k)} className={`${smallControl} min-h-[44px]`} {...props} />
    </label>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label="New client">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/60 cursor-default" onClick={onClose} />
      <form onSubmit={submit} className="relative w-full sm:max-w-xl max-h-full overflow-y-auto bg-gray-900 border border-gray-800 sm:rounded-lg">
        <div className="sticky top-0 bg-gray-900 flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-gray-100">New client</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex items-center justify-center w-11 h-11 rounded-lg text-gray-400 hover:text-gray-100 hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <label className="block">
            <span className={label}>Business name</span>
            <input ref={first} required value={f.displayName} onChange={set('displayName')} className={`${smallControl} min-h-[44px]`} placeholder="In and Out Property Care" />
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {field('contactName', 'Contact name')}
            {field('trade', 'Trade', { placeholder: 'Property care' })}
            {field('email', 'Email', { type: 'email' })}
            {field('phone', 'Phone', { type: 'tel' })}
            {field('location', 'Location', { placeholder: 'City, ST' })}
            {field('stripeCustomerId', 'Stripe customer (optional)', { placeholder: 'cus_…' })}
          </div>

          <fieldset>
            <legend className={label}>Services</legend>
            <div className="flex flex-wrap gap-2">
              {SERVICE_KEYS.map((s) => {
                const on = services.includes(s)
                return (
                  <label
                    key={s}
                    className={`inline-flex items-center gap-2 px-3 min-h-[44px] rounded-lg border text-sm cursor-pointer ${
                      on ? 'border-blue-500 bg-blue-500/10 text-blue-300' : 'border-gray-800 text-gray-400'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => setServices((p) => (on ? p.filter((x) => x !== s) : SERVICE_KEYS.filter((k) => k === s || p.includes(k))))}
                      className="h-4 w-4 accent-blue-500"
                    />
                    {s}
                  </label>
                )
              })}
            </div>
          </fieldset>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {field('upfrontAmount', 'Upfront ($)', { inputMode: 'decimal' })}
            {field('upfrontPaidAt', 'Upfront paid on', { type: 'date', className: `${smallControl} min-h-[44px] [color-scheme:dark]` })}
            {field('monthlyAmount', 'Monthly ($)', { inputMode: 'decimal' })}
          </div>

          <label className="flex items-start gap-3 min-h-[44px] cursor-pointer">
            <input type="checkbox" checked={createBusiness} onChange={(e) => setCreateBusiness(e.target.checked)} className="mt-1 h-4 w-4 accent-blue-500" />
            <span className="text-sm text-gray-200">
              Also create the platform account
              <span className="block text-xs text-gray-500">
                Needed for a website build, missed-call texting or an ads id. Missed-call texting stays off unless missedcall is ticked. The owner claims it by signing up with this email.
              </span>
            </span>
          </label>

          <label className="block">
            <span className={label}>Notes</span>
            <textarea value={f.notes} onChange={set('notes')} rows={3} className={`${smallControl} resize-y`} />
          </label>

          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        <div className="sticky bottom-0 bg-gray-900 flex justify-end gap-2 px-4 py-3 border-t border-gray-800">
          <button type="button" onClick={onClose} className={button}>
            Cancel
          </button>
          <button type="submit" disabled={busy} className={primaryButton}>
            {busy ? 'Creating…' : 'Create client'}
          </button>
        </div>
      </form>
    </div>
  )
}
