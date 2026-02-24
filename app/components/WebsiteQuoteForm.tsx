'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

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

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Your Name</label>
          <input
            type="text"
            name="name"
            required
            placeholder="John Smith"
            className="w-full px-4 py-3 bg-gray-800 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Business Name</label>
          <input
            type="text"
            name="business"
            required
            placeholder="Smith's Auto Shop"
            className="w-full px-4 py-3 bg-gray-800 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Email</label>
          <input
            type="email"
            name="email"
            required
            placeholder="john@email.com"
            className="w-full px-4 py-3 bg-gray-800 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Phone</label>
          <input
            type="tel"
            name="phone"
            required
            placeholder="(555) 123-4567"
            className="w-full px-4 py-3 bg-gray-800 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">What do you need?</label>
        <select
          name="businessType"
          required
          className="w-full px-4 py-3 bg-gray-800 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
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
        <label className="block text-sm font-medium text-gray-300 mb-1">Tell us more (optional)</label>
        <textarea
          name="message"
          rows={3}
          placeholder="Describe your project..."
          className="w-full px-4 py-3 bg-gray-800 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="flex items-start gap-3 cursor-pointer group">
          <input
            type="checkbox"
            checked={smsConsent}
            onChange={(e) => setSmsConsent(e.target.checked)}
            className="mt-1 h-5 w-5 rounded border-white/20 bg-gray-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer shrink-0"
          />
          <span className="text-sm text-gray-400 leading-relaxed">
            By checking this box and providing your phone number, you consent to receive SMS messages from Align and Acquire. Message frequency may vary. Standard message and data rates may apply. Reply STOP to opt out. Reply HELP for help. Consent is not a condition of purchase.
          </span>
        </label>
      </div>

      <div className="flex items-center gap-4 text-sm">
        <Link href="/privacy" className="text-blue-400 hover:text-blue-300 underline underline-offset-2 transition">
          Privacy Policy
        </Link>
        <Link href="/terms" className="text-blue-400 hover:text-blue-300 underline underline-offset-2 transition">
          Terms &amp; Conditions
        </Link>
      </div>

      {error && (
        <p className="text-red-400 text-sm">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-white text-gray-900 py-4 rounded-lg text-lg font-semibold hover:bg-gray-200 transition disabled:bg-gray-500 disabled:text-gray-900"
      >
        {loading ? 'Sending...' : 'Get a Free Quote'}
      </button>
    </form>
  )
}
