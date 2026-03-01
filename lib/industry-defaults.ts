export type IndustryConfig = {
  name: string
  services: string[]
  /** AI first message sent after missed call */
  aiGreeting: string
  /** Booking page main heading */
  bookingPageTitle: string
  /** Label for the service/quote type field */
  bookingPageServiceLabel: string
  /** Require property address when booking */
  bookingRequiresAddress: boolean
  /** @deprecated Use aiGreeting */
  sampleGreeting?: string
  questions?: string[]
  commonCustomerQuestions?: string[]
  specialInstructions?: string
  urgencyKeywords?: string[]
  cannotHelpPlaceholder?: string
}

/** Primary industry options for new businesses */
export const BUSINESS_TYPE_OPTIONS = [
  'Landscaping / Lawn Care',
  'Car Detailing / Auto Detailing',
  'HVAC (Heating, Ventilation & Air Conditioning)',
  'Other',
] as const

export type BusinessType = (typeof BUSINESS_TYPE_OPTIONS)[number]

export const industryDefaults: Record<string, IndustryConfig> = {
  'Landscaping / Lawn Care': {
    name: 'Landscaping / Lawn Care',
    services: [
      'Hardscaping',
      'Lawn Care',
      'Landscape Design & Installation',
      'Tree Service',
      'Snow Removal',
    ],
    aiGreeting:
      "Hi there! Sorry we missed your call. I'm an automated assistant — are you looking for a landscaping quote or have a question about our services?",
    bookingPageTitle: 'Schedule a Free In-Person Quote',
    bookingPageServiceLabel: 'What do you need a quote for?',
    bookingRequiresAddress: true,
    specialInstructions:
      'Always get the property address for quote visits. Note any special requests or property details.',
    cannotHelpPlaceholder: 'Exact pricing, work not performed by us...',
  },

  'Car Detailing / Auto Detailing': {
    name: 'Car Detailing / Auto Detailing',
    services: [
      'Basic Interior Detail',
      'Full Interior Detail',
      'Exterior Wash & Wax',
      'Full Detail Package',
      'Ceramic Coating',
      'Paint Correction',
    ],
    aiGreeting:
      "Hi there! Sorry we missed your call. I'm an automated assistant — are you looking to schedule a detail or have a question about our services?",
    bookingPageTitle: 'Schedule Your Detail',
    bookingPageServiceLabel: 'What service are you interested in?',
    bookingRequiresAddress: true,
    specialInstructions:
      'Mobile detailing comes to the customer — always get the service address.',
    cannotHelpPlaceholder: 'Exact pricing, work on vehicles we did not service...',
  },

  'HVAC (Heating, Ventilation & Air Conditioning)': {
    name: 'HVAC (Heating, Ventilation & Air Conditioning)',
    services: [
      'AC Repair',
      'Heating Repair',
      'AC Installation',
      'Furnace Installation',
      'Maintenance / Tune-Up',
      'Duct Cleaning',
    ],
    aiGreeting:
      "Hi there! Sorry we missed your call. I'm an automated assistant — do you need to schedule a service call or have a question about our HVAC services?",
    bookingPageTitle: 'Schedule a Service Call',
    bookingPageServiceLabel: 'What do you need help with?',
    bookingRequiresAddress: true,
    specialInstructions:
      'Emergencies (no heat when below 40°F, no AC when above 90°F) should be flagged for immediate callback. Always get the service address.',
    urgencyKeywords: [
      'no heat',
      'no AC',
      'no air',
      'not working',
      'emergency',
      'broken',
      'water leak',
      'smell gas',
    ],
    cannotHelpPlaceholder:
      'Exact repair quotes, warranty claims, equipment not installed by us...',
  },

  Other: {
    name: 'Other',
    services: [],
    aiGreeting:
      "Hi there! Sorry we missed your call. I'm an automated assistant — how can I help you today?",
    bookingPageTitle: 'Schedule an Appointment',
    bookingPageServiceLabel: 'What do you need help with?',
    bookingRequiresAddress: true,
    specialInstructions:
      'Gather their contact info and reason for calling. Offer to have someone call them back.',
    cannotHelpPlaceholder:
      'Pricing questions, technical support, matters requiring a specialist...',
  },
}

export function getIndustryDefaults(businessType: string): IndustryConfig {
  return industryDefaults[businessType] ?? industryDefaults['Other']
}

export function getAllIndustries(): string[] {
  return [...BUSINESS_TYPE_OPTIONS]
}
