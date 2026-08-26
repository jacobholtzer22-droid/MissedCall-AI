'use client'

import { useEffect, useRef, useState } from 'react'
import { X, ArrowLeft, Loader2 } from 'lucide-react'
import { validateUsMobile } from '@/lib/phone-utils'
import { TRADES, NOT_AN_OWNER, formatPhoneInput } from './constants'

export type GateResult = { leadId: string; name: string; phone: string; trade: string; qualified: boolean }

type Props = {
  open: boolean
  watchedSeconds: number
  attribution: Record<string, string>
  onClose: () => void
  onComplete: (result: GateResult) => void
}

const cardBg = 'rgba(242,240,235,0.03)'
const border = 'rgba(110,118,129,0.35)'

export default function GateModal({ open, watchedSeconds, attribution, onClose, onComplete }: Props) {
  const [screen, setScreen] = useState<1 | 2>(1)
  const [trade, setTrade] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [honeypot, setHoneypot] = useState('')
  const [phoneError, setPhoneError] = useState('')
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Reset to a clean first screen whenever it reopens.
  useEffect(() => {
    if (open) {
      setScreen(1)
      setFormError('')
      setPhoneError('')
    }
  }, [open])

  // Lock background scroll while the sheet is up.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  useEffect(() => {
    if (open && screen === 2) {
      // Focus the first field so the keyboard opens on the right input.
      const t = setTimeout(() => nameRef.current?.focus(), 120)
      return () => clearTimeout(t)
    }
  }, [open, screen])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  function chooseTrade(value: string) {
    setTrade(value)
    setScreen(2) // advances immediately, no Next button
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    if (!name.trim()) {
      setFormError('Please enter your first name.')
      return
    }
    const check = validateUsMobile(phone)
    if (!check.ok) {
      setPhoneError(check.reason)
      return
    }
    setPhoneError('')
    setSubmitting(true)
    try {
      const res = await fetch('/api/demo-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          phone: check.e164,
          trade,
          qualified: trade !== NOT_AN_OWNER,
          watchedSeconds,
          landingPath: typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/book',
          attribution,
          website: honeypot,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        // Inline error, retry allowed. Never trap them.
        setFormError(data?.error || 'Could not save that. Try again.')
        setSubmitting(false)
        return
      }
      onComplete({
        leadId: data?.leadId ?? '',
        name: name.trim(),
        phone: check.e164,
        trade,
        qualified: trade !== NOT_AN_OWNER,
      })
    } catch {
      setFormError('Network hiccup. Try again.')
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.72)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Unlock the demo video"
    >
      <div
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg border-2 max-h-[88dvh] overflow-y-auto motion-safe:animate-[aaFade_220ms_ease-out]"
        style={{ background: '#16181C', borderColor: border }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b-2" style={{ borderColor: border }}>
          {screen === 2 ? (
            <button
              type="button"
              onClick={() => setScreen(1)}
              className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] min-h-[44px]"
              style={{ color: '#6E7681' }}
            >
              <ArrowLeft size={14} strokeWidth={2.5} />
              Back
            </button>
          ) : (
            <span className="font-mono text-[11px] uppercase tracking-[0.2em]" style={{ color: '#6E7681' }}>
              Step {screen} of 2
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid place-items-center min-h-[44px] min-w-[44px]"
            style={{ color: '#6E7681' }}
          >
            <X size={20} strokeWidth={2.5} />
          </button>
        </div>

        {screen === 1 && (
          <div className="p-5 sm:p-7">
            <h2 className="text-[clamp(1.5rem,5vw,2rem)] font-black uppercase leading-[0.95] tracking-tight mb-5" style={{ color: '#F2F0EB' }}>
              Do you own a service business?
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {TRADES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => chooseTrade(t)}
                  className="w-full border-2 px-4 py-3.5 text-left text-[15px] font-semibold min-h-[52px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                  style={{
                    borderColor: t === NOT_AN_OWNER ? 'rgba(110,118,129,0.3)' : border,
                    color: t === NOT_AN_OWNER ? '#6E7681' : '#F2F0EB',
                    background: 'transparent',
                    // @ts-expect-error CSS custom property for focus ring colour
                    '--tw-ring-color': '#EE6B1A',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#EE6B1A'
                    e.currentTarget.style.background = 'rgba(238,107,26,0.08)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = t === NOT_AN_OWNER ? 'rgba(110,118,129,0.3)' : border
                    e.currentTarget.style.background = 'transparent'
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}

        {screen === 2 && (
          <form className="p-5 sm:p-7" onSubmit={submit}>
            <h2 className="text-[clamp(1.5rem,5vw,2rem)] font-black uppercase leading-[0.95] tracking-tight mb-2" style={{ color: '#F2F0EB' }}>
              Where should I send it?
            </h2>
            <p className="text-[14px] mb-6" style={{ color: 'rgba(242,240,235,0.6)' }}>
              Two fields and the video plays.
            </p>

            {/* Honeypot. Hidden from humans and from screen readers. */}
            <div aria-hidden="true" className="absolute w-px h-px overflow-hidden -left-[9999px]">
              <label htmlFor="gate-website">Website</label>
              <input
                id="gate-website" name="website" type="text" tabIndex={-1} autoComplete="off"
                value={honeypot} onChange={(e) => setHoneypot(e.target.value)}
              />
            </div>

            <label htmlFor="gate-name" className="block font-mono text-[11px] font-bold uppercase tracking-[0.2em] mb-2" style={{ color: '#6E7681' }}>
              First name
            </label>
            <input
              id="gate-name" ref={nameRef} type="text" name="firstName" autoComplete="given-name"
              value={name} onChange={(e) => { setName(e.target.value); setFormError('') }}
              placeholder="Your first name"
              className="w-full px-4 py-3.5 border-2 text-[16px] font-medium outline-none bg-transparent mb-5 focus:border-[#EE6B1A]"
              style={{ borderColor: border, color: '#F2F0EB' }}
            />

            <label htmlFor="gate-phone" className="block font-mono text-[11px] font-bold uppercase tracking-[0.2em] mb-2" style={{ color: '#6E7681' }}>
              Cell number
            </label>
            <input
              id="gate-phone" type="tel" name="phone" inputMode="tel" autoComplete="tel"
              value={phone}
              onChange={(e) => { setPhone(formatPhoneInput(e.target.value)); setPhoneError('') }}
              onBlur={(e) => {
                if (!e.currentTarget.value.trim()) return
                const c = validateUsMobile(e.currentTarget.value)
                setPhoneError(c.ok ? '' : c.reason)
              }}
              placeholder="(555) 123-4567"
              aria-invalid={phoneError ? true : undefined}
              aria-describedby={phoneError ? 'gate-phone-error' : undefined}
              className="w-full px-4 py-3.5 border-2 text-[16px] font-medium outline-none bg-transparent focus:border-[#EE6B1A]"
              style={{ borderColor: phoneError ? '#EE6B1A' : border, color: '#F2F0EB' }}
            />
            {phoneError && (
              <p id="gate-phone-error" className="mt-2 text-[12px] font-semibold" style={{ color: '#EE6B1A' }}>
                {phoneError}
              </p>
            )}

            {formError && <p className="mt-4 text-[13px] font-semibold" style={{ color: '#EE6B1A' }}>{formError}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="aa-btn mt-6 w-full py-4 text-[16px] font-bold uppercase tracking-wide flex items-center justify-center gap-2 disabled:opacity-50 min-h-[52px]"
              style={{ background: '#EE6B1A', color: '#16181C' }}
            >
              {submitting ? (<><Loader2 size={18} className="motion-safe:animate-spin" /> One sec</>) : 'Watch the video'}
            </button>
            <p className="mt-3 text-[11px] leading-relaxed" style={{ color: '#6E7681' }}>
              I text you the demo details. Reply STOP any time.
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
