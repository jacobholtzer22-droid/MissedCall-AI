// ===========================================
// ADMIN HEALTH - pure alert + health rules for the /admin business list
// ===========================================
// No DB access and no imports from app/. Input is a Business row plus the
// stats object produced by lib/admin-stats.ts; output is a list of alerts and
// a single health colour. Thresholds live in HEALTH_THRESHOLDS.

export type AdminHealth = 'green' | 'yellow' | 'red' | 'gray'

export type AdminAlertCode =
  | 'sms_failing'
  | 'past_due'
  | 'calendar_disconnected'
  | 'no_owner_contact'
  | 'inactive'
  | 'human_needed'
  | 'usage_stale'

export interface AdminAlert {
  code: AdminAlertCode
  severity: 'red' | 'yellow'
  message: string
}

export const HEALTH_THRESHOLDS = {
  /** sms_failing needs at least this many failed texts in 7d ... */
  smsFailMin: 2,
  /** ... AND failed >= this fraction of finalized texts in 7d */
  smsFailRate: 0.5,
  /** inactive: phone clients with no call/text/screen in this many days */
  inactivePhoneDays: 14,
  /** inactive: web-only clients with no website lead in this many days */
  inactiveWebDays: 30,
  /** usage_stale: no Telnyx usage record newer than this many days */
  usageStaleDays: 3,
}

/** The subset of AdminStats the rules read. AdminStats satisfies it structurally. */
export interface HealthStatsInput {
  failedSms7d: number
  finalizedSms7d: number
  lastActivityAt: string | null
  lastWebLeadAt: string | null
  humanNeeded: number
  telnyxLastRecordAt: string | null
}

/** The subset of a Business row the rules read. */
export interface BusinessRowWithStats {
  subscriptionStatus: string
  telnyxPhoneNumber: string | null
  missedCallAiEnabled: boolean
  callScreenerEnabled: boolean
  spamFilterEnabled: boolean
  calendarEnabled: boolean
  googleCalendarConnected: boolean
  ownerPhone: string | null
  forwardingNumber: string | null
  ownerEmail: string | null
  stats: HealthStatsInput
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Whole days between `iso` and `now`; null when `iso` is null/unparseable. */
function daysSince(iso: string | null, now: Date): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return null
  return Math.floor((now.getTime() - t) / DAY_MS)
}

export function computeAlerts(b: BusinessRowWithStats, now: Date): AdminAlert[] {
  // Canceled clients get no alerts at all; computeHealth returns 'gray' for them.
  if (b.subscriptionStatus === 'canceled') return []

  const s = b.stats
  const T = HEALTH_THRESHOLDS

  // Derived flags. Never gate on missedCallAiEnabled alone: its default is true,
  // so every web-only row has it on.
  const hasPhone = Boolean(b.telnyxPhoneNumber)
  const isPhoneClient =
    hasPhone && (b.missedCallAiEnabled !== false || b.callScreenerEnabled || b.spamFilterEnabled)
  const isWebOnly = !hasPhone

  const alerts: AdminAlert[] = []

  // sms_failing (red)
  if (hasPhone && s.failedSms7d >= T.smsFailMin && s.failedSms7d >= T.smsFailRate * s.finalizedSms7d) {
    alerts.push({
      code: 'sms_failing',
      severity: 'red',
      message: `${s.failedSms7d} of ${s.finalizedSms7d} texts failed in 7d`,
    })
  }

  // past_due (red)
  if (b.subscriptionStatus === 'past_due') {
    alerts.push({ code: 'past_due', severity: 'red', message: 'Subscription past due' })
  }

  // calendar_disconnected (yellow)
  if (b.calendarEnabled && !b.googleCalendarConnected) {
    alerts.push({
      code: 'calendar_disconnected',
      severity: 'yellow',
      message: 'Calendar enabled but not connected',
    })
  }

  // no_owner_contact (yellow)
  if (
    isPhoneClient &&
    b.missedCallAiEnabled !== false &&
    !b.ownerPhone &&
    !b.forwardingNumber &&
    !b.ownerEmail
  ) {
    alerts.push({
      code: 'no_owner_contact',
      severity: 'yellow',
      message: 'AI on but no owner phone, forwarding number, or email for alerts',
    })
  }

  // inactive (yellow) — active subscriptions only
  if (b.subscriptionStatus === 'active') {
    if (isPhoneClient) {
      const days = daysSince(s.lastActivityAt, now)
      if (days === null) {
        alerts.push({ code: 'inactive', severity: 'yellow', message: 'No calls or texts ever recorded' })
      } else if (days > T.inactivePhoneDays) {
        alerts.push({ code: 'inactive', severity: 'yellow', message: `No calls or texts in ${days} days` })
      }
    } else if (isWebOnly) {
      const days = daysSince(s.lastWebLeadAt, now)
      if (days === null) {
        alerts.push({ code: 'inactive', severity: 'yellow', message: 'No website leads ever recorded' })
      } else if (days > T.inactiveWebDays) {
        alerts.push({ code: 'inactive', severity: 'yellow', message: `No website leads in ${days} days` })
      }
    }
  }

  // human_needed (yellow)
  if (s.humanNeeded > 0) {
    alerts.push({
      code: 'human_needed',
      severity: 'yellow',
      message: `${s.humanNeeded} conversation${s.humanNeeded === 1 ? '' : 's'} flagged for a human`,
    })
  }

  // usage_stale (yellow)
  if (hasPhone) {
    const days = daysSince(s.telnyxLastRecordAt, now)
    if (days === null) {
      alerts.push({ code: 'usage_stale', severity: 'yellow', message: 'Telnyx usage never synced' })
    } else if (days > T.usageStaleDays) {
      alerts.push({ code: 'usage_stale', severity: 'yellow', message: `Telnyx usage not synced in ${days} days` })
    }
  }

  return alerts
}

export function computeHealth(alerts: AdminAlert[], subscriptionStatus: string): AdminHealth {
  if (subscriptionStatus === 'canceled') return 'gray'
  if (alerts.some(a => a.severity === 'red')) return 'red'
  if (alerts.some(a => a.severity === 'yellow')) return 'yellow'
  return 'green'
}
