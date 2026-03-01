'use client'

import { useState } from 'react'
import { Building, ArrowRight } from 'lucide-react'
import { getIndustryDefaults, BUSINESS_TYPE_OPTIONS } from '@/lib/industry-defaults'

const DEFAULT_PLACEHOLDERS = {
  services: 'List your main services separated by commas...',
  businessHours: 'Mon-Fri 9am-5pm, Sat 10am-2pm',
  specialInfo: 'Anything customers should know before they call...',
  cannotHelp: 'Topics the AI should not try to help with...',
}

type CreateBusinessAction = (formData: FormData) => Promise<void>

export function OnboardingForm({ createBusiness }: { createBusiness: CreateBusinessAction }) {
  const [businessType, setBusinessType] = useState('')

  const industry = businessType ? getIndustryDefaults(businessType) : null
  const placeholders = {
    services: industry?.services?.length
      ? industry.services.join(', ')
      : DEFAULT_PLACEHOLDERS.services,
    businessHours: DEFAULT_PLACEHOLDERS.businessHours,
    specialInfo: industry?.specialInstructions ?? DEFAULT_PLACEHOLDERS.specialInfo,
    cannotHelp: industry?.cannotHelpPlaceholder ?? DEFAULT_PLACEHOLDERS.cannotHelp,
  }
  const servicesValue = industry?.services?.length ? industry.services.join(', ') : ''

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-lg w-full">
        <div className="text-center mb-8">
          <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <Building className="h-8 w-8 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Welcome to MissedCall AI</h1>
          <p className="text-gray-500 mt-2">Tell us about your business so the AI can help your customers</p>
        </div>

        <form action={createBusiness} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          {/* Business Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Business Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="businessName"
              required
              placeholder="Smith Family Dental"
              className="w-full px-3 py-2 bg-white text-gray-900 border border-gray-200 rounded-lg placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Business Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              What type of business? <span className="text-red-500">*</span>
            </label>
            <select
              name="businessType"
              required
              value={businessType}
              onChange={(e) => setBusinessType(e.target.value)}
              className="w-full px-3 py-2 bg-white text-gray-900 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select your industry...</option>
              {BUSINESS_TYPE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          {/* Services */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              What services do you offer? <span className="text-red-500">*</span>
            </label>
            <textarea
              key={businessType || 'empty'}
              name="services"
              required
              rows={2}
              defaultValue={servicesValue}
              placeholder={placeholders.services}
              className="w-full px-3 py-2 bg-white text-gray-900 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-400"
            />
            <p className="text-xs text-gray-500 mt-1">Separate with commas. The AI will use this to help customers.</p>
          </div>

          {/* Business Hours */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              What are your business hours? <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="businessHours"
              required
              placeholder={placeholders.businessHours}
              className="w-full px-3 py-2 bg-white text-gray-900 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-400"
            />
          </div>

          {/* Special Info */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Anything special customers should know? <span className="text-red-500">*</span>
            </label>
            <p className="text-xs text-gray-500 mb-2">Here you can put some common questions your customers may ask.</p>
            <textarea
              name="specialInfo"
              required
              rows={2}
              placeholder={placeholders.specialInfo}
              className="w-full px-3 py-2 bg-white text-gray-900 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-400"
            />
          </div>

          {/* Cannot Help With */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              What should the AI NOT try to help with?
            </label>
            <textarea
              name="cannotHelp"
              rows={2}
              placeholder={placeholders.cannotHelp}
              className="w-full px-3 py-2 bg-white text-gray-900 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-400"
            />
            <p className="text-xs text-gray-500 mt-1">For these topics, AI will offer to have someone call them back.</p>
          </div>

          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition font-medium flex items-center justify-center"
          >
            Create My Business
            <ArrowRight className="ml-2 h-5 w-5" />
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-4">
          You can always update these settings later.
        </p>
      </div>
    </div>
  )
}
