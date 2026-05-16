export type BusinessFeatures = {
  hasSpamFilter: boolean
  hasIvrScreener: boolean
  hasAnyScreening: boolean
  hasMissedCallAi: boolean
  hasForwarding: boolean
  hasCalendar: boolean
  showScreeningCards: boolean
  showAiCards: boolean
  totalCallsMode: 'screened' | 'forwarded' | 'none'
}

type BusinessLike = {
  spamFilterEnabled?: boolean | null
  callScreenerEnabled?: boolean | null
  missedCallAiEnabled?: boolean | null
  forwardingNumber?: string | null
  calendarEnabled?: boolean | null
  googleCalendarConnected?: boolean | null
}

export function getBusinessFeatures(business: BusinessLike): BusinessFeatures {
  const hasSpamFilter = business.spamFilterEnabled === true
  const hasIvrScreener = business.callScreenerEnabled === true
  const hasAnyScreening = hasSpamFilter || hasIvrScreener
  const hasMissedCallAi = business.missedCallAiEnabled !== false
  const hasForwarding = Boolean(business.forwardingNumber)
  const hasCalendar =
    business.calendarEnabled === true && business.googleCalendarConnected === true

  const showScreeningCards = hasAnyScreening
  const showAiCards = hasMissedCallAi

  let totalCallsMode: 'screened' | 'forwarded' | 'none'
  if (hasAnyScreening) {
    totalCallsMode = 'screened'
  } else if (hasForwarding) {
    totalCallsMode = 'forwarded'
  } else {
    totalCallsMode = 'none'
  }

  return {
    hasSpamFilter,
    hasIvrScreener,
    hasAnyScreening,
    hasMissedCallAi,
    hasForwarding,
    hasCalendar,
    showScreeningCards,
    showAiCards,
    totalCallsMode,
  }
}
