'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

// ─────────────────────────────────────────────────────────
// Restyled to match the Industrial Dispatch theme.
// This form is embedded on the /websites page inside a
// light (#F2F0EB / #FFFFFF) section, so labels and inputs
// must use dark text and a white/light background.
// ─────────────────────────────────────────────────────────

export default function WebsiteQuoteForm() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [smsConsent, setSmsConsent] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')

    if (!smsConsent) {
      setError('Please check the consent box to continue.')
      return
    }

    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const data = {
      name: formData.get('name'),
      business: formData.get('business'),
      email: formData.get('email'),
      phone: (formData.get('phone') as string)?.trim() || undefined,
      businessType: formData.get('businessType'),
      message: formData.get('message'),
      smsConsent,
    }

    try {
      await fetch('/api/book-demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      router.push('/demo-requested')
    } catch (err) {
      console.error('Error:', err)
      router.push('/demo-requested')
    }
  }

  const labelCls = 'block font-mono text-[11px] font-bold uppercase tracking-[0.2em] mb-2'
  const labelStyle = { color: '#6E7681' }

  const inputCls = 'w-full px-4 py-3 border-2 text-[14px] font-medium outline-none transition-colors min-h-[44px]'
  const inputStyle = { borderColor: 'rgba(110,118,129,0.35)', background: '#FFFFFF', color: '#16181C' }

  const onFocus = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    e.currentTarget.style.borderColor = '#EE6B1A'
  }
  const onBlur = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    e.currentTarget.style.borderColor = 'rgba(110,118,129,0.35)'
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid md:grid-cols-2 gap-5">
        <div>
          <label className={labelCls} style={labelStyle}>Your Name</label>
          <input type="text" name="name" required placeholder="John Smith"
            className={inputCls} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
        </div>
        <div>
          <label className={labelCls} style={labelStyle}>Business Name</label>
          <input type="text" name="business" required placeholder="Smith's Auto Shop"
            className={inputCls} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        <div>
          <label className={labelCls} style={labelStyle}>Email</label>
          <input type="email" name="email" required placeholder="john@email.com"
            className={inputCls} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
        </div>
        <div>
          <label className={labelCls} style={labelStyle}>Phone</label>
          <input type="tel" name="phone" required placeholder="(555) 123-4567"
            className={inputCls} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
        </div>
      </div>

      <div>
        <label className={labelCls} style={labelStyle}>What do you need?</label>
        <select name="businessType" required className={inputCls} style={{ ...inputStyle, cursor: 'pointer' }}
          onFocus={onFocus} onBlur={onBlur}>
          <option value="">Select...</option>
          <option value="new-website">New Website</option>
          <option value="redesign">Website Redesign</option>
          <option value="ecommerce">E-Commerce Store</option>
          <option value="booking">Booking System</option>
          <option value="web-app">Web Application</option>
          <option value="other">Something Else</option>
        </select>
      </div>

      <div>
        <label className={labelCls} style={labelStyle}>
          Tell us more <span className="normal-case tracking-normal text-[10px]">(optional)</span>
        </label>
        <textarea name="message" rows={3} placeholder="Describe your project..."
          className={`${inputCls} resize-none`} style={inputStyle}
          onFocus={onFocus as any} onBlur={onBlur as any} />
      </div>

      <div>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={smsConsent}
            onChange={(e) => setSmsConsent(e.target.checked)}
            className="mt-1 h-5 w-5 shrink-0 cursor-pointer"
            style={{ accentColor: '#EE6B1A' }}
          />
          <span className="text-[12px] leading-relaxed" style={{ color: '#6E7681' }}>
            By checking this box and providing your phone number, you consent to receive SMS messages from Align and Acquire. Message frequency may vary. Standard message and data rates may apply. Reply STOP to opt out. Reply HELP for help. Consent is not a condition of purchase.
          </span>
        </label>
      </div>

      <div className="flex items-center gap-4 text-[12px]">
        <Link href="/privacy" className="underline underline-offset-2 transition-colors" style={{ color: '#6E7681' }}>
          Privacy Policy
        </Link>
        <Link href="/terms" className="underline underline-offset-2 transition-colors" style={{ color: '#6E7681' }}>
          Terms &amp; Conditions
        </Link>
      </div>

      {error && (
        <p className="text-[13px] font-semibold" style={{ color: '#EE6B1A' }}>{error}</p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="aa-btn w-full py-4 text-[15px] font-bold uppercase tracking-wide disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ background: '#16181C', color: '#F2F0EB' }}
      >
        {loading ? 'Sending...' : 'Get a free quote'}
      </button>
    </form>
  )
}
