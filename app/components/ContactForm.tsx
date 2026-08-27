'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Send, CircleCheckBig } from 'lucide-react'
import { HONEYPOT_FIELD } from '@/lib/spam-constants'

export default function ContactForm() {
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [consentChecked, setConsentChecked] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    const formData = new FormData(e.currentTarget)
    const name = formData.get('name') as string
    const phone = formData.get('phone') as string
    const message = formData.get('message') as string
    const honeypot = (formData.get(HONEYPOT_FIELD) as string) ?? ''

    if (!name.trim()) { setError('Please enter your name.'); return }
    if (!consentChecked) { setError('Please check the consent box to continue.'); return }

    setLoading(true)
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim() || undefined,
          message: message.trim(),
          smsConsent: consentChecked,
          [HONEYPOT_FIELD]: honeypot,
        }),
      })
      if (!res.ok) throw new Error('Failed to submit')
      setSubmitted(true)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <div
        className="border-2 p-10 text-center"
        style={{ background: '#16181C', borderColor: 'rgba(110,118,129,0.35)', color: '#F2F0EB' }}
      >
        <div className="flex justify-center mb-4">
          <CircleCheckBig size={48} strokeWidth={2} style={{ color: '#EE6B1A' }} />
        </div>
        <h3 className="text-[22px] font-extrabold uppercase tracking-tight mb-2">Message sent.</h3>
        <p className="text-[14px]" style={{ color: '#6E7681' }}>We&apos;ll get back to you shortly.</p>
      </div>
    )
  }

  const inputCls = 'w-full px-4 py-3 border-2 text-[14px] font-medium outline-none transition-colors min-h-[44px]'
  const inputStyle = {
    background: 'rgba(242,240,235,0.05)',
    borderColor: 'rgba(110,118,129,0.4)',
    color: '#F2F0EB',
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border-2 p-7 sm:p-9"
      style={{ background: '#16181C', borderColor: 'rgba(110,118,129,0.35)', color: '#F2F0EB' }}
    >
      {/*
        Honeypot. The field name is a nonsense token on purpose: a plausible name
        like "company" gets populated by Chrome autofill, which silently killed
        real leads before. Hidden from sighted users, taken out of the tab order,
        and hidden from screen readers so nobody can fill it by accident.

        Low value by design — the bots hitting these forms replay the real payload
        and will learn to send this field too. The scoring in lib/spam-score.ts
        does not lean on it.
      */}
      <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, overflow: 'hidden' }}>
        <label htmlFor="contact-hp">Do not fill this in</label>
        <input id="contact-hp" type="text" name={HONEYPOT_FIELD} tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>

      <div className="grid sm:grid-cols-2 gap-5 mb-5">
        <div>
          <label htmlFor="contact-name" className="block font-mono text-[11px] font-bold uppercase tracking-[0.2em] mb-2" style={{ color: '#6E7681' }}>
            Name <span style={{ color: '#EE6B1A' }}>*</span>
          </label>
          <input
            id="contact-name"
            type="text"
            name="name"
            required
            placeholder="Your name"
            className={inputCls}
            style={inputStyle}
            onFocus={e => (e.currentTarget.style.borderColor = '#EE6B1A')}
            onBlur={e => (e.currentTarget.style.borderColor = 'rgba(110,118,129,0.4)')}
          />
        </div>
        <div>
          <label htmlFor="contact-phone" className="block font-mono text-[11px] font-bold uppercase tracking-[0.2em] mb-2" style={{ color: '#6E7681' }}>
            Phone <span className="normal-case tracking-normal text-[10px]">(optional)</span>
          </label>
          <input
            id="contact-phone"
            type="tel"
            name="phone"
            placeholder="(555) 123-4567"
            className={inputCls}
            style={inputStyle}
            onFocus={e => (e.currentTarget.style.borderColor = '#EE6B1A')}
            onBlur={e => (e.currentTarget.style.borderColor = 'rgba(110,118,129,0.4)')}
          />
        </div>
      </div>

      <div className="mb-5">
        <label htmlFor="contact-message" className="block font-mono text-[11px] font-bold uppercase tracking-[0.2em] mb-2" style={{ color: '#6E7681' }}>
          Message
        </label>
        <textarea
          id="contact-message"
          name="message"
          rows={4}
          placeholder="How can we help you?"
          className={`${inputCls} resize-none`}
          style={inputStyle}
          onFocus={e => (e.currentTarget.style.borderColor = '#EE6B1A')}
          onBlur={e => (e.currentTarget.style.borderColor = 'rgba(110,118,129,0.4)')}
        />
      </div>

      <div className="mb-4">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={consentChecked}
            onChange={e => setConsentChecked(e.target.checked)}
            className="mt-1 h-5 w-5 shrink-0 cursor-pointer"
            style={{ accentColor: '#EE6B1A' }}
          />
          <span className="text-[12px] leading-relaxed" style={{ color: '#6E7681' }}>
            By checking this box and providing your phone number, you consent to receive SMS messages from Align and Acquire. Reply STOP to opt out. Reply HELP for help. Consent is not a condition of purchase.
          </span>
        </label>
      </div>

      <div className="mb-5 flex items-center gap-4 text-[12px]">
        <Link href="/privacy" className="underline underline-offset-2 transition-colors" style={{ color: '#6E7681' }}>
          Privacy Policy
        </Link>
        <Link href="/terms" className="underline underline-offset-2 transition-colors" style={{ color: '#6E7681' }}>
          Terms &amp; Conditions
        </Link>
      </div>

      {error && (
        <p className="text-[13px] mb-4 font-semibold" style={{ color: '#EE6B1A' }}>{error}</p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="aa-btn w-full py-4 text-[14px] font-bold uppercase tracking-wide flex items-center justify-center gap-2 disabled:opacity-50"
        style={{ background: '#EE6B1A', color: '#16181C' }}
      >
        <Send size={16} strokeWidth={2.5} />
        {loading ? 'Sending...' : 'Send message'}
      </button>
    </form>
  )
}
