'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Mail } from 'lucide-react'

export default function DemoForm() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [smsConsent, setSmsConsent] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    if (!smsConsent) { setError('Please check the consent box to continue.'); return }
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const data = {
      name: formData.get('name'),
      business: formData.get('business'),
      email: formData.get('email'),
      phone: (formData.get('phone') as string)?.trim() || undefined,
      businessType: formData.get('businessType'),
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

  const inputCls = 'w-full px-4 py-3 border-2 text-[14px] font-medium outline-none transition-colors min-h-[44px]'
  const inputStyle = { background: 'rgba(242,240,235,0.07)', borderColor: 'rgba(110,118,129,0.4)', color: '#F2F0EB' }
  const focusOn = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => (e.currentTarget.style.borderColor = '#EE6B1A')
  const focusOff = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => (e.currentTarget.style.borderColor = 'rgba(110,118,129,0.4)')

  return (
    <form
      onSubmit={handleSubmit}
      className="border-2 p-7 sm:p-9"
      style={{ background: 'rgba(22,24,28,0.7)', borderColor: 'rgba(255,255,255,0.12)', color: '#F2F0EB' }}
    >
      <div className="grid sm:grid-cols-2 gap-5 mb-5">
        <div>
          <label className="block font-mono text-[11px] font-bold uppercase tracking-[0.2em] mb-2" style={{ color: 'rgba(242,240,235,0.6)' }}>
            Your Name
          </label>
          <input type="text" name="name" required placeholder="John Smith" className={inputCls} style={inputStyle} onFocus={focusOn} onBlur={focusOff} />
        </div>
        <div>
          <label className="block font-mono text-[11px] font-bold uppercase tracking-[0.2em] mb-2" style={{ color: 'rgba(242,240,235,0.6)' }}>
            Business Name
          </label>
          <input type="text" name="business" required placeholder="Smith HVAC" className={inputCls} style={inputStyle} onFocus={focusOn} onBlur={focusOff} />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-5 mb-5">
        <div>
          <label className="block font-mono text-[11px] font-bold uppercase tracking-[0.2em] mb-2" style={{ color: 'rgba(242,240,235,0.6)' }}>
            Email
          </label>
          <input type="email" name="email" required placeholder="john@smithhvac.com" className={inputCls} style={inputStyle} onFocus={focusOn} onBlur={focusOff} />
        </div>
        <div>
          <label className="block font-mono text-[11px] font-bold uppercase tracking-[0.2em] mb-2" style={{ color: 'rgba(242,240,235,0.6)' }}>
            Phone <span className="normal-case tracking-normal text-[10px]">(optional)</span>
          </label>
          <input type="tel" name="phone" placeholder="(555) 123-4567" className={inputCls} style={inputStyle} onFocus={focusOn} onBlur={focusOff} />
        </div>
      </div>

      <div className="mb-5">
        <label className="block font-mono text-[11px] font-bold uppercase tracking-[0.2em] mb-2" style={{ color: 'rgba(242,240,235,0.6)' }}>
          Business Type
        </label>
        <select
          name="businessType"
          required
          className={inputCls}
          style={{ ...inputStyle, cursor: 'pointer' }}
          onFocus={focusOn}
          onBlur={focusOff}
        >
          <option value="" style={{ background: '#16181C' }}>Select your industry...</option>
          <option value="Landscaping / Lawn Care" style={{ background: '#16181C' }}>Landscaping / Lawn Care</option>
          <option value="Car Detailing / Auto Detailing" style={{ background: '#16181C' }}>Car Detailing / Auto Detailing</option>
          <option value="HVAC (Heating, Ventilation & Air Conditioning)" style={{ background: '#16181C' }}>HVAC</option>
          <option value="Plumbing" style={{ background: '#16181C' }}>Plumbing</option>
          <option value="Other" style={{ background: '#16181C' }}>Other</option>
        </select>
      </div>

      <div className="mb-4">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={smsConsent}
            onChange={e => setSmsConsent(e.target.checked)}
            className="mt-1 h-5 w-5 shrink-0 cursor-pointer"
            style={{ accentColor: '#EE6B1A' }}
          />
          <span className="text-[12px] leading-relaxed" style={{ color: 'rgba(242,240,235,0.5)' }}>
            By checking this box and providing your phone number, you consent to receive SMS messages from Align and Acquire. Reply STOP to opt out. Reply HELP for help. Consent is not a condition of purchase.
          </span>
        </label>
      </div>

      <div className="mb-5 flex items-center gap-4 text-[12px]">
        <Link href="/privacy" className="underline underline-offset-2" style={{ color: 'rgba(242,240,235,0.5)' }}>Privacy Policy</Link>
        <Link href="/terms" className="underline underline-offset-2" style={{ color: 'rgba(242,240,235,0.5)' }}>Terms &amp; Conditions</Link>
      </div>

      {error && <p className="text-[13px] mb-4 font-semibold" style={{ color: '#EE6B1A' }}>{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="aa-btn w-full py-4 text-[14px] font-bold uppercase tracking-wide flex items-center justify-center gap-2 disabled:opacity-50"
        style={{ background: '#EE6B1A', color: '#16181C' }}
      >
        <Mail size={16} strokeWidth={2.5} />
        {loading ? 'Sending...' : 'Request demo'}
      </button>
      <p className="text-center text-[12px] mt-4" style={{ color: 'rgba(242,240,235,0.45)' }}>
        We&apos;ll email you to schedule within 24 hours
      </p>
    </form>
  )
}
