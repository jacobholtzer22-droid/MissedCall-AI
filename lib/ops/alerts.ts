// ===========================================
// OPS ALERTS - pure alert + health rules for one /admin/ops engagement
// ===========================================
// No DB access and no imports from app/. Input is an Engagement row, its
// Deliverables and its linked Business (or null); output is a list of alerts
// and a single health colour, in the same shape as lib/admin-health.ts.
// Not called by the sync; the /admin/ops UI (1C) reads it.

export type OpsHealth = 'green' | 'yellow' | 'red' | 'gray'

export type OpsAlertCode =
  | 'no_subscription'
  | 'past_due'
  | 'deliverable_blocked'
  | 'stripe_unlinked'
  | 'status_mismatch'
  | 'no_platform_account'
  | 'onboarding_stale'
  | 'follow_up_due'
  | 'no_owner_contact'

export interface OpsAlert {
  code: OpsAlertCode
  severity: 'red' | 'yellow'
  message: string
}

export const OPS_ALERT_THRESHOLDS = {
  /** onboarding_stale: paid_upfront / onboarding for longer than this many days */
  onboardingStaleDays: 14,
  /** no_subscription: yellow until this many days after upfrontPaidAt, red after. */
  noSubscriptionGraceDays: 30,
}

type DateLike = Date | string | null

/** The subset of an Engagement row the rules read. */
export interface EngagementAlertInput {
  stage: string
  services: unknown // JSON string[] on the row
  businessId: string | null
  stripeCustomerId: string | null
  stripeSubscriptionStatus: string | null
  upfrontPaidAt: DateLike
  nextFollowUpAt: DateLike
  createdAt: Date | string
}

/** The subset of a Deliverable row the rules read. */
export interface DeliverableAlertInput {
  type: string
  manualStatus: string | null
}

/** The subset of a Business row the rules read. */
export interface BusinessAlertInput {
  subscriptionStatus: string
  ownerEmail: string | null
  ownerPhone: string | null
  forwardingNumber: string | null
}

const DAY_MS = 24 * 60 * 60 * 1000

function time(d: DateLike): number | null {
  if (!d) return null
  const t = new Date(d).getTime()
  return Number.isFinite(t) ? t : null
}

export function computeEngagementAlerts(
  engagement: EngagementAlertInput,
  deliverables: DeliverableAlertInput[],
  business: BusinessAlertInput | null,
  now: Date
): { alerts: OpsAlert[]; health: OpsHealth } {
  const e = engagement
  // Ignored rows (test or junk) get no alerts at all; health is 'gray'.
  if (e.stage === 'ignored') return { alerts: [], health: 'gray' }

  const T = OPS_ALERT_THRESHOLDS
  const sub = e.stripeSubscriptionStatus
  const services = Array.isArray(e.services) ? e.services : []
  // one_time clients have no subscription by agreement.
  const oneTime = e.stage === 'one_time'
  const alerts: OpsAlert[] = []

  // no_subscription: yellow for the first month after the upfront payment
  // (the normal wait before the subscription starts), red after it.
  const paidAt = time(e.upfrontPaidAt)
  if (
    !oneTime &&
    paidAt !== null &&
    sub !== 'active' &&
    sub !== 'trialing' &&
    sub !== 'scheduled' && // a subscription is set up to start later
    e.stage !== 'churned' &&
    e.stage !== 'paused'
  ) {
    const days = Math.max(0, Math.floor((now.getTime() - paidAt) / DAY_MS))
    alerts.push({
      code: 'no_subscription',
      severity: days > T.noSubscriptionGraceDays ? 'red' : 'yellow',
      message: `Paid upfront ${days} day${days === 1 ? '' : 's'} ago, no subscription yet`,
    })
  }

  // past_due (red)
  if (sub === 'past_due' || sub === 'unpaid') {
    alerts.push({ code: 'past_due', severity: 'red', message: `Subscription ${sub.replace('_', ' ')}` })
  }

  // deliverable_blocked (red)
  const blocked = deliverables.filter((d) => d.manualStatus === 'blocked')
  if (blocked.length > 0) {
    alerts.push({
      code: 'deliverable_blocked',
      severity: 'red',
      message: `Blocked: ${blocked.map((d) => d.type).join(', ')}`,
    })
  }

  // stripe_unlinked (yellow)
  if (!e.stripeCustomerId && e.stage !== 'prospect') {
    alerts.push({ code: 'stripe_unlinked', severity: 'yellow', message: 'No Stripe customer linked' })
  }

  // status_mismatch (yellow): only the platform serving a client Stripe is not
  // billing. Business.subscriptionStatus defaults to trialing and nobody keeps
  // it current, so "platform trialing, Stripe active" is not a problem.
  if (business && business.subscriptionStatus === 'active' && (sub === null || sub === 'canceled' || sub === 'past_due' || sub === 'unpaid')) {
    alerts.push({
      code: 'status_mismatch',
      severity: 'yellow',
      message: `Platform says ${business.subscriptionStatus}, Stripe says ${sub ?? 'not synced'}`,
    })
  }

  // no_platform_account (yellow)
  if (services.includes('missedcall') && !e.businessId) {
    alerts.push({
      code: 'no_platform_account',
      severity: 'yellow',
      message: 'Bought MissedCall AI but no platform account is linked',
    })
  }

  // no_owner_contact (red when nobody is reachable, yellow when half is missing)
  if (business) {
    const noEmail = !business.ownerEmail
    const noPhone = !business.ownerPhone && !business.forwardingNumber
    if (noEmail && noPhone) {
      alerts.push({ code: 'no_owner_contact', severity: 'red', message: 'Leads would notify nobody' })
    } else if (noEmail || noPhone) {
      alerts.push({
        code: 'no_owner_contact',
        severity: 'yellow',
        message: noEmail ? 'No owner email for lead alerts' : 'No owner phone or forwarding number for lead alerts',
      })
    }
  }

  // onboarding_stale (yellow) — never for one_time
  const created = time(e.createdAt)
  if (!oneTime && (e.stage === 'paid_upfront' || e.stage === 'onboarding') && created !== null) {
    const days = Math.floor((now.getTime() - created) / DAY_MS)
    if (days > T.onboardingStaleDays) {
      alerts.push({ code: 'onboarding_stale', severity: 'yellow', message: `In ${e.stage.replace('_', ' ')} for ${days} days` })
    }
  }

  // follow_up_due (yellow)
  const followUp = time(e.nextFollowUpAt)
  if (followUp !== null && followUp <= now.getTime()) {
    alerts.push({ code: 'follow_up_due', severity: 'yellow', message: 'Follow-up due' })
  }

  return { alerts, health: computeOpsHealth(alerts, e.stage) }
}

export function computeOpsHealth(alerts: OpsAlert[], stage: string): OpsHealth {
  if (stage === 'churned' || stage === 'ignored') return 'gray'
  if (alerts.some((a) => a.severity === 'red')) return 'red'
  if (alerts.some((a) => a.severity === 'yellow')) return 'yellow'
  return 'green'
}
