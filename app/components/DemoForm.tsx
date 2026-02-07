'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Mail } from 'lucide-react'

export default function DemoForm() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const data = {
      name: formData.get('name'),
      business: formData.get('business'),
      email: formData.get('email'),
      phone: formData.get('phone'),
      businessType: formData.get('businessType'),
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
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-8 shadow-xl">
      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Your Name</label>
          <input type="text" name="name" required placeholder="John Smith" className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Business Name</label>
          <input type="text" name="business" required placeholder="Smith Dental" className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
          <input type="email" name="email" required placeholder="john@smithdental.com" className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Phone Number</label>
          <input type="tel" name="phone" required placeholder="(555) 123-4567" className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">Business Type</label>
        <select name="businessType" required className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
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
      <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white py-4 rounded-lg text-lg font-semibold hover:bg-blue-700 transition flex items-center justify-center disabled:bg-blue-400">
        <Mail className="mr-2 h-5 w-5" /> 
        {loading ? 'Sending...' : 'Request Demo'}
      </button>
      <p className="text-center text-sm text-gray-500 mt-4">Well email you to schedule a Zoom call within 24 hours</p>
    </form>
  )
}