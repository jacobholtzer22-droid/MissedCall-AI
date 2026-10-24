// ===========================================
// /admin/ops — vocabularies
// ===========================================
// The allowed values for every String column on the Ops tables (Engagement,
// Deliverable, OpsCheck, OpsActivity, AgentRun). The schema stores them as
// plain strings with the values in a comment, like the rest of the repo; these
// arrays are the single typed copy. Pure and client-safe: no runtime logic.

export const ENGAGEMENT_STAGES = [
  'prospect',
  'paid_upfront',
  'onboarding',
  'active',
  'one_time', // paid upfront, no subscription by agreement
  'paused',
  'churned',
  'ignored', // test or junk row, hidden from default views
] as const
export type EngagementStage = (typeof ENGAGEMENT_STAGES)[number]

/** Funnel order, earliest first. Same members as ENGAGEMENT_STAGES. */
export const STAGE_ORDER: readonly EngagementStage[] = [
  'prospect',
  'paid_upfront',
  'onboarding',
  'active',
  'one_time',
  'paused',
  'churned',
  'ignored',
]

export const ENGAGEMENT_SOURCES = ['pipeline_won', 'business_row', 'stripe', 'manual'] as const
export type EngagementSource = (typeof ENGAGEMENT_SOURCES)[number]

/** What a client bought. Stored as a JSON string[] on Engagement.services. */
export const SERVICE_KEYS = ['website', 'ads', 'missedcall', 'gbp'] as const
export type ServiceKey = (typeof SERVICE_KEYS)[number]

export const DELIVERABLE_TYPES = ['website', 'domain', 'email', 'missedcall', 'ads', 'gbp'] as const
export type DeliverableType = (typeof DELIVERABLE_TYPES)[number]

/**
 * Deliverable.computedStatus, and the values allowed in manualStatus.
 * 'blocked' and 'paused' are manual only: the sync never derives them. 'paused'
 * (client asked to hold, e.g. ads paused) raises no alert.
 */
export const DELIVERABLE_STATUSES = ['not_started', 'in_progress', 'blocked', 'paused', 'live', 'unknown'] as const
export type DeliverableStatus = (typeof DELIVERABLE_STATUSES)[number]

/** The deliverables each purchased service creates. */
export const DELIVERABLE_TYPES_FOR_SERVICE: Record<ServiceKey, readonly DeliverableType[]> = {
  website: ['website', 'domain', 'email'],
  ads: ['ads'],
  missedcall: ['missedcall'],
  gbp: ['gbp'],
}

export const OPS_CHECK_KEYS = [
  'stripe.upfront_paid',
  'stripe.subscription_active',
  'business.owner_contact_set',
  'business.number_assigned',
  'vercel.prod_ready',
  'dns.a_record',
  'dns.txt_spf',
  'http.indexable',
  'slug.matches_db',
  'lead.test_row',
  'ads.campaign_enabled',
  'ads.geo_presence_only',
  'ads.spend_7d',
  'missedcall.activity_30d',
  'website.business_row',
  'website.real_lead_30d',
  'ads.customer_linked',
  'ads.snapshot_7d',
] as const
export type OpsCheckKey = (typeof OPS_CHECK_KEYS)[number]

export const OPS_ACTIVITY_KINDS = [
  'note',
  'call',
  'voicemail',
  'text',
  'email',
  'meeting',
  'status_change',
  'system',
] as const
export type OpsActivityKind = (typeof OPS_ACTIVITY_KINDS)[number]

export const AGENT_RUN_KINDS = ['site_build', 'site_update', 'seo_pass', 'ads_setup', 'ads_audit', 'other'] as const
export type AgentRunKind = (typeof AGENT_RUN_KINDS)[number]

export const AGENT_RUN_STATUSES = ['queued', 'dispatched', 'running', 'succeeded', 'failed', 'cancelled'] as const
export type AgentRunStatus = (typeof AGENT_RUN_STATUSES)[number]
