export interface AdminBusiness {
  id: string
  name: string
  slug: string
  businessType: string | null
  telnyxPhoneNumber: string | null
  forwardingNumber: string | null
  timezone: string
  subscriptionStatus: string
  monthlyFee: number | null
  setupFee: number | null

  // Feature flags
  missedCallAiEnabled: boolean
  callScreenerEnabled: boolean
  callScreenerMessage: string | null
  spamFilterEnabled: boolean
  calendarEnabled: boolean
  googleCalendarConnected: boolean
  googleAdsEnabled: boolean
  bookingRequiresAddress: boolean
  notifyBySms: boolean
  notifyByEmail: boolean

  // AI settings
  aiGreeting: string | null
  aiInstructions: string | null
  aiContext: string | null

  // Notifications
  ownerEmail: string | null
  ownerPhone: string | null
  missedCallVoiceMessage: string | null

  // Booking
  slotDurationMinutes: number
  bufferMinutes: number
  bookingPageTitle: string | null
  bookingPageServiceLabel: string | null
  bookingPageConfirmation: string | null
  maxMessagesPerConversation: number

  // Google Ads
  googleAdsCustomerId: string | null
  googleAdsTabLabel: string | null

  // Admin only
  adminNotes: string | null
  smsCooldownDays: number | null
  cooldownBypassNumbers: unknown

  // Complex JSON fields
  businessHours: unknown
  servicesOffered: unknown

  createdAt: string
  updatedAt: string

  _count: {
    conversations: number
    appointments: number
    users: number
    screenedCalls: number
    blockedCalls30d: number
  }

  // Monthly + all-time stats (computed server-side)
  conversationsThisMonth: number
  conversationsLastMonth: number
  leadsThisMonth: number
  conversationsAllTime: number
  leadsAllTime: number
}
