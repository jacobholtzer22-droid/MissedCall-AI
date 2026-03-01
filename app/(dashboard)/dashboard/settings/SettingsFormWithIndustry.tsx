'use client'

import { useCallback } from 'react'
import { getIndustryDefaults, BUSINESS_TYPE_OPTIONS } from '@/lib/industry-defaults'

export function applyIndustryDefaultsToForm(
  form: HTMLFormElement,
  businessType: string
) {
  const defaults = getIndustryDefaults(businessType)
  const set = (name: string, value: string | boolean) => {
    const el = form.querySelector(`[name="${name}"]`) as
      | HTMLInputElement
      | HTMLTextAreaElement
      | null
    if (el) {
      if (el.type === 'checkbox') {
        ;(el as HTMLInputElement).checked = Boolean(value)
      } else {
        el.value = String(value)
      }
    }
  }
  set('aiGreeting', defaults.aiGreeting)
  set('servicesOffered', defaults.services.join(', '))
  set('bookingPageTitle', defaults.bookingPageTitle)
  set('bookingPageServiceLabel', defaults.bookingPageServiceLabel)
  set('bookingRequiresAddress', defaults.bookingRequiresAddress)
}

export function BusinessTypeSelector({
  defaultValue,
  formId,
}: {
  defaultValue: string
  formId: string
}) {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const val = e.target.value
      if (val) {
        const form = document.getElementById(formId) as HTMLFormElement | null
        if (form) {
          applyIndustryDefaultsToForm(form, val)
        }
      }
    },
    [formId]
  )

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Business Type / Industry
      </label>
      <select
        name="businessType"
        defaultValue={defaultValue}
        onChange={handleChange}
        className="w-full px-3 py-2 bg-white text-gray-900 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">Select your industry...</option>
        {BUSINESS_TYPE_OPTIONS.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
      <p className="text-xs text-gray-500 mt-1">
        Select to auto-fill greeting, services, and booking labels (you can edit
        after)
      </p>
    </div>
  )
}
