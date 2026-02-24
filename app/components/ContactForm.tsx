'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Send } from 'lucide-react'

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

    if (!name.trim()) {
      setError('Please enter your name.')
      return
    }

    if (!consentChecked) {
      setError('Please check the consent box to continue.')
      return
    }

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
      <div className="bg-gray-900/80 backdrop-blur-sm border border-white/10 rounded-2xl p-10 text-center">
        <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <Send className="h-8 w-8 text-green-400" />
        </div>
        <h3 className="text-2xl font-bold mb-2">Message Sent!</h3>
        <p className="text-gray-400">Thanks for reaching out. We&apos;ll get back to you shortly.</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="bg-gray-900/80 backdrop-blur-sm border border-white/10 rounded-2xl p-8 md:p-10">
      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <div>
          <label htmlFor="contact-name" className="block text-sm font-medium text-gray-300 mb-2">
            Name <span className="text-red-400">*</span>
          </label>
          <input
            id="contact-name"
            type="text"
            name="name"
            required
            placeholder="Your name"
            className="w-full px-4 py-3 bg-gray-800 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
          />
        </div>
        <div>
          <label htmlFor="contact-phone" className="block text-sm font-medium text-gray-300 mb-2">
            Phone Number <span className="text-gray-500 text-xs">(optional)</span>
          </label>
          <input
            id="contact-phone"
            type="tel"
            name="phone"
            placeholder="(555) 123-4567"
            className="w-full px-4 py-3 bg-gray-800 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
          />
        </div>
      </div>

      <div className="mb-6">
        <label htmlFor="contact-message" className="block text-sm font-medium text-gray-300 mb-2">
          Message / Inquiry
        </label>
        <textarea
          id="contact-message"
          name="message"
          rows={4}
          placeholder="How can we help you?"
          className="w-full px-4 py-3 bg-gray-800 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition resize-none"
        />
      </div>

      <div className="mb-4">
        <label className="flex items-start gap-3 cursor-pointer group">
          <input
            type="checkbox"
            checked={consentChecked}
            onChange={(e) => setConsentChecked(e.target.checked)}
            className="mt-1 h-5 w-5 rounded border-white/20 bg-gray-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer shrink-0"
          />
          <span className="text-sm text-gray-400 leading-relaxed">
            By checking this box and providing your phone number, you consent to receive SMS messages from Align and Acquire. Message frequency may vary. Standard message and data rates may apply. Reply STOP to opt out. Reply HELP for help. Consent is not a condition of purchase.
          </span>
        </label>
      </div>

      <div className="mb-6 flex items-center gap-4 text-sm">
        <Link href="/privacy" className="text-blue-400 hover:text-blue-300 underline underline-offset-2 transition">
          Privacy Policy
        </Link>
        <Link href="/terms" className="text-blue-400 hover:text-blue-300 underline underline-offset-2 transition">
          Terms &amp; Conditions
        </Link>
      </div>

      {error && (
        <p className="text-red-400 text-sm mb-4">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-4 rounded-lg text-lg font-semibold hover:from-blue-500 hover:to-purple-500 transition-all flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Send className="mr-2 h-5 w-5" />
        {loading ? 'Sending...' : 'Send Message'}
      </button>
    </form>
  )
}
