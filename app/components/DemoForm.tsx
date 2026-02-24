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
      smsConsent,
    }

    try {
      await fetch('/api/book-demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      router.push('/demo-requested')
    } catch (error) {
      console.error('Error:', error)
      router.push('/demo-requested')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-gray-900/80 backdrop-blur-sm border border-white/10 rounded-2xl p-8">
      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Your Name</label>
          <input type="text" name="name" required placeholder="John Smith" className="w-full px-4 py-3 bg-gray-800 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Business Name</label>
          <input type="text" name="business" required placeholder="Smith Dental" className="w-full px-4 py-3 bg-gray-800 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Email</label>
          <input type="email" name="email" required placeholder="john@smithdental.com" className="w-full px-4 py-3 bg-gray-800 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Phone Number <span className="text-gray-500 text-xs">(optional)</span></label>
          <input type="tel" name="phone" placeholder="(555) 123-4567" className="w-full px-4 py-3 bg-gray-800 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-300 mb-2">Business Type</label>
        <select name="businessType" required className="w-full px-4 py-3 bg-gray-800 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Select your industry...</option>
          <option value="dental">Dental Office</option>
          <option value="salon">Hair Salon / Barbershop</option>
          <option value="medical">Medical Practice</option>
          <option value="hvac">HVAC</option>
          <option value="plumbing">Plumbing</option>
          <option value="auto">Auto Repair</option>
          <option value="legal">Law Firm</option>
          <option value="spa">Spa / Wellness</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div className="mb-4">
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

      <button type="submit" disabled={loading} className="w-full bg-white text-gray-900 py-4 rounded-lg text-lg font-semibold hover:bg-gray-200 transition flex items-center justify-center disabled:bg-gray-500 disabled:text-gray-900">
        <Mail className="mr-2 h-5 w-5" /> 
        {loading ? 'Sending...' : 'Request Demo'}
      </button>
      <p className="text-center text-sm text-blue-100/90 mt-4">We'll email you to schedule a Zoom call within 24 hours</p>
    </form>
  )
}