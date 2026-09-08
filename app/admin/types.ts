// Per-business stats computed in lib/admin-stats.ts. Windows are UTC:
// "Month" = current calendar month, "7d"/"30d" = trailing days. Dates are ISO
// strings or null; counts are never undefined.
export interface AdminStats {
  missedCallsMonth: number; textbacksMonth: number; repliedMonth: number; capturedMonth: number
  bookedMonth: { website: number; sms: number }
  webLeadsMonth: number; lastWebLeadAt: string | null
  lastCallAt: string | null; lastScreenedAt: string | null; lastConversationAt: string | null
  lastActivityAt: string | null; lastActivityKind: 'call' | 'screened' | 'message' | 'web_lead' | null
  failedSms7d: number; finalizedSms7d: number
  humanNeeded: number; stalled: number
  spamBlockedMonth: number; spamPassedMonth: number
  skipsMonth: { cooldown: number; existing_contact: number; blocked: number }
  telnyxCostMonth: number; telnyxLastRecordAt: string | null
  ads30d: { spend: number; clicks: number; conversions: number; lastSyncAt: string | null } | null
}

export interface AdminBusiness {
  id: string
  name: string
  slug: string
  businessType: string | null
  telnyxPhoneNumber: string | null
  notificationSenderNumber: string | null
  forwardingNumber: string | null
  timezone: string
  subscriptionStatus: string
  monthlyFee: number | null
  setupFee: number | null

  // Feature flags
  missedCallAiEnabled: boolean
  knownContactVoicemailEnabled: boolean
  noReplyAlertEnabled: boolean
  noReplyAlertMinutes: number
  callScreenerEnabled: boolean
  callScreenerMessage: string | null
  spamFilterEnabled: boolean
  calendarEnabled: boolean
  smsBookingEnabled: boolean
  googleCalendarConnected: boolean
  googleAdsEnabled: boolean
  bookingRequiresAddress: boolean
  notifyBySms: boolean
  notifyByEmail: boolean
  massMessagingEnabled: boolean

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
  bookingPageHeaderTagline: string | null
  bookingPageSubtitle: string | null
  bookingPageDateLabel: string | null
  bookingPageNotesLabel: string | null
  bookingPageNotesPlaceholder: string | null
  bookingHideAddress: boolean
  bookingConfirmationSmsText: string | null
  maxMessagesPerConversation: number

  // Google Ads
  googleAdsCustomerId: string | null
  googleAdsTabLabel: string | null

  // Admin only
  adminNotes: string | null
  smsCooldownDays: number | null
  cooldownBypassNumbers: unknown
  ownerGroupId: string | null

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

  // Stats layer (lib/admin-stats.ts)
  stats: AdminStats
}
