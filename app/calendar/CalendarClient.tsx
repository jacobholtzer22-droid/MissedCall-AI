'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Check, Loader2 } from 'lucide-react'
import { Logo } from '@/app/components/Logo'
import BookingSection from '@/app/book/BookingSection'
import type { ChosenSlot } from '@/app/book/BookingWizard'
import { validateUsMobile } from '@/lib/phone-utils'
import { formatPhoneInput } from '@/app/book/constants'
import { trackStandardWithId } from '@/app/book/pixel'

export type CalendarPrefill = {
  mode: 'direct' | 'prefilled'
  leadToken?: string
  firstName: string
  businessName: string
  phone: string
  email: string
}

const BORDER = 'rgba(110,118,129,0.35)'
const CARD = 'rgba(242,240,235,0.03)'
const inputCls =
  'w-full px-4 py-3.5 border-2 text-[16px] font-medium outline-none bg-transparent focus:border-[#EE6B1A]'
const inputStyle = { borderColor: BORDER, color: '#F2F0EB' }

type Field = 'firstName' | 'businessName' | 'phone' | 'email'
const LABELS: Record<Field, string> = {
  firstName: 'First name',
  businessName: 'Business name',
  phone: 'Cell number',
  email: 'Email',
}
const PLACEHOLDERS: Record<Field, string> = {
  firstName: 'First name',
  businessName: 'Your business',
  phone: '(555) 123-4567',
  email: 'you@company.com',
}

function validate(field: Field, v: string): string {
  const t = v.trim()
  switch (field) {
    case 'firstName':
      return t.length >= 2 ? '' : 'Please enter your first name.'
    case 'businessName':
      return t.length >= 2 ? '' : 'Please enter your business name.'
    case 'phone': {
      const check = validateUsMobile(t)
      return check.ok ? '' : check.reason
    }
    case 'email':
      return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(t) ? '' : 'That does not look like an email address.'
  }
}

export default function CalendarClient({
  prefill,
  preselectIso,
}: {
  prefill: CalendarPrefill
  /** From ?slot= on a deep link the AI texted. Confirmed against live slots. */
  preselectIso?: string | null
}) {
  const [slot, setSlot] = useState<ChosenSlot | null>(null)
  const [form, setForm] = useState({
    firstName: prefill.firstName,
    businessName: prefill.businessName,
    phone: prefill.phone,
    email: prefill.email,
  })
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const [booked, setBooked] = useState<{ dateLabel: string; timeLabel: string; meetLink: string | null } | null>(null)

  // In prefilled mode we only ask for what the lead row is missing.
  const asked: Field[] =
    prefill.mode === 'prefilled'
      ? (['firstName', 'businessName', 'phone', 'email'] as Field[]).filter((f) => !prefill[f]?.trim())
      : (['firstName', 'businessName', 'phone', 'email'] as Field[])

  async function submit() {
    if (!slot) return
    const next: Partial<Record<Field, string>> = {}
    // Validate everything we will SEND, not just what we asked, so a bad value
    // carried in from the lead row cannot slip through.
    ;(['firstName', 'businessName', 'phone', 'email'] as Field[]).forEach((f) => {
      const problem = validate(f, form[f])
      if (problem) next[f] = problem
    })
    setErrors(next)
    if (Object.keys(next).length) {
      setFormError('Check the highlighted fields.')
      return
    }

    setBusy(true)
    setFormError('')
    try {
      // Minted per booking. Only sent in prefilled mode — direct traffic is
      // cold and must not be counted as an ad conversion.
      const eventId =
        prefill.mode === 'prefilled'
          ? typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `sched-${Date.now()}`
          : undefined

      const res = await fetch('/api/demo-book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slotStart: slot.iso,
          name: form.firstName.trim(),
          companyName: form.businessName.trim(),
          phone: form.phone,
          email: form.email.trim(),
          bookingSource: prefill.mode === 'prefilled' ? 'sms_link' : 'direct',
          ...(prefill.leadToken ? { leadToken: prefill.leadToken } : {}),
          ...(eventId ? { eventId } : {}),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 409) {
        setFormError('That time was just taken. Pick another.')
        setSlot(null)
        return
      }
      if (!res.ok) {
        setFormError(data?.error || 'Could not book that. Try again.')
        return
      }
      if (eventId) trackStandardWithId('Schedule', eventId, { content_name: 'calendar_sms_link' })
      setBooked({
        dateLabel: data?.appointment?.dateLabel ?? slot.dateLabel,
        timeLabel: data?.appointment?.timeLabel ?? slot.display,
        meetLink: data?.appointment?.meetLink ?? null,
      })
    } catch {
      setFormError('Network hiccup. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-dvh aa-grid-bg" style={{ background: '#16181C', color: '#F2F0EB' }}>
      <header className="border-b-2" style={{ borderColor: 'rgba(110,118,129,0.28)', background: 'rgba(22,24,28,0.95)' }}>
        <div className="mx-auto max-w-2xl px-5 sm:px-8 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <Logo size="sm" />
            <span className="hidden sm:block text-[14px] font-extrabold tracking-tight">Align and Acquire</span>
          </Link>
          <Link href="/" className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em]" style={{ color: '#6E7681' }}>
            <ArrowLeft size={13} strokeWidth={2.5} />
            Back to site
          </Link>
        </div>
      </header>
      <div className="aa-hazard" />

      <main className="mx-auto max-w-2xl px-5 sm:px-8 py-6 md:py-10">
        {booked ? (
          <div className="border-2 p-6 sm:p-8 text-center" style={{ borderColor: 'rgba(238,107,26,0.45)', background: 'rgba(238,107,26,0.07)' }}>
            <div className="inline-flex items-center justify-center h-16 w-16 border-2 mb-6 mx-auto" style={{ borderColor: '#EE6B1A' }}>
              <Check size={32} strokeWidth={2.5} style={{ color: '#EE6B1A' }} />
            </div>
            <h1 className="text-[clamp(1.8rem,5vw,2.6rem)] font-black uppercase leading-[1.1] tracking-tight mb-4">Locked in.</h1>
            <p className="text-[16px] font-bold leading-[1.5] mb-3">
              {booked.dateLabel} at {booked.timeLabel}
            </p>
            {booked.meetLink && (
              <p className="text-[14px] leading-[1.6] mb-4">
                <a href={booked.meetLink} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4" style={{ color: '#EE6B1A' }}>
                  Join on Google Meet
                </a>
              </p>
            )}
            <p className="text-[14px] leading-[1.65]" style={{ color: 'rgba(242,240,235,0.6)' }}>
              You&apos;ll get a text confirming, and a calendar invite by email. Talk soon.
            </p>
          </div>
        ) : (
          <>
            <h1 className="text-[clamp(1.6rem,5vw,2.5rem)] font-black uppercase leading-[1.08] tracking-tight mb-2">
              Pick your time.
            </h1>
            <p className="text-[15px] leading-[1.6] mb-6" style={{ color: 'rgba(242,240,235,0.72)' }}>
              15 minutes, me personally, nobody else.
              {prefill.mode === 'prefilled' && prefill.firstName ? ` Good to see you again, ${prefill.firstName}.` : ''}
            </p>

            {/* Slots first, always. Asking for details before showing whether a
                time even works is how booking pages lose people. */}
            <div className="mb-6">
              <BookingSection
                bare
                preselectIso={preselectIso ?? undefined}
                heading={slot ? 'Change time' : 'Pick a time'}
                prefill={{}}
                attribution={{}}
                onSlotChosen={(s) => {
                  setSlot(s)
                  setFormError('')
                }}
              />
            </div>

            {slot && (
              <section className="border-2 p-4 sm:p-5" style={{ borderColor: BORDER, background: CARD }}>
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] mb-1" style={{ color: '#6E7681' }}>
                  Holding
                </p>
                <p className="text-[16px] font-bold mb-4">
                  {slot.dateLabel} at {slot.display}
                </p>

                {asked.length === 0 ? (
                  <p className="text-[14px] leading-[1.6] mb-4" style={{ color: 'rgba(242,240,235,0.7)' }}>
                    I have everything I need — just confirm and it&apos;s yours.
                  </p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {asked.map((field) => (
                      <div key={field} className={field === 'email' && asked.length % 2 === 1 ? 'sm:col-span-2' : ''}>
                        <label htmlFor={`cal-${field}`} className="block font-mono text-[10px] font-bold uppercase tracking-[0.18em] mb-1.5" style={{ color: '#6E7681' }}>
                          {LABELS[field]}
                        </label>
                        <input
                          id={`cal-${field}`}
                          value={form[field]}
                          onChange={(e) => {
                            const raw = e.target.value
                            setForm((f) => ({ ...f, [field]: field === 'phone' ? formatPhoneInput(raw) : raw }))
                            setErrors((x) => ({ ...x, [field]: '' }))
                            setFormError('')
                          }}
                          type={field === 'phone' ? 'tel' : field === 'email' ? 'email' : 'text'}
                          inputMode={field === 'phone' ? 'tel' : field === 'email' ? 'email' : 'text'}
                          autoComplete={
                            field === 'phone' ? 'tel'
                            : field === 'email' ? 'email'
                            : field === 'businessName' ? 'organization'
                            : 'given-name'
                          }
                          placeholder={PLACEHOLDERS[field]}
                          aria-invalid={errors[field] ? true : undefined}
                          className={inputCls}
                          style={errors[field] ? { ...inputStyle, borderColor: '#EE6B1A' } : inputStyle}
                        />
                        {errors[field] && (
                          <p className="mt-1.5 text-[12.5px] font-semibold leading-[1.45]" style={{ color: '#EE6B1A' }}>
                            {errors[field]}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {formError && (
                  <p className="mt-3 text-[13px] font-semibold leading-[1.5]" style={{ color: '#EE6B1A' }}>{formError}</p>
                )}

                <button
                  type="button"
                  onClick={() => void submit()}
                  disabled={busy}
                  className="aa-btn mt-4 w-full py-4 text-[16px] font-bold uppercase tracking-wide flex items-center justify-center gap-2 disabled:opacity-50 min-h-[56px]"
                  style={{ background: '#EE6B1A', color: '#16181C' }}
                >
                  {busy ? (<><Loader2 size={18} className="motion-safe:animate-spin" /> Booking</>) : 'Book it'}
                </button>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  )
}
