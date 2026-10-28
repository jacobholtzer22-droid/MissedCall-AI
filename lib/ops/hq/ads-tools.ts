// ===========================================
// Ops HQ — Google Ads tools for the ads specialist
// ===========================================
// Client tools over the platform's own Google Ads API credentials (the
// google-ads-api client in lib/google-ads.ts). Every call takes customerId,
// must match the run's account, and logs in through GOOGLE_ADS_MCC_ID.
//
//   reads         both modes
//   work writes   the playbook's AUTO list (negatives, pause, goal exclusion,
//                 lowering an ad group bid, Presence, a PAUSED new campaign)
//   apply writes  apply mode only, and only the tool the approved proposal
//                 names (ctx.allow), called with exactly the approved args
//                 (ctx.approved): budget, enable, end date, any bid change,
//                 bidding strategy, location option, removing a criterion
//
// Every write goes through mutate(): validate_only when asked (always in a dry
// run), and the exact operations plus Google's response land in the feed as an
// AgentEvent. Env, read by name only: GOOGLE_ADS_DEVELOPER_TOKEN,
// GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_REFRESH_TOKEN,
// GOOGLE_ADS_MCC_ID.

import type { Prisma } from '@prisma/client'
import { enums, type MutateOperation } from 'google-ads-api'
import { db } from '@/lib/db'
import { getGoogleAdsClient } from '@/lib/google-ads'
import { STEP_CATALOG, defaultWaitingOn, stepFor } from '@/lib/ops/steps'
import { emit, noEmDash, oneLine } from './events'
import { validate, type ClientTool } from './loop'

const ENV = ['GOOGLE_ADS_DEVELOPER_TOKEN', 'GOOGLE_ADS_CLIENT_ID', 'GOOGLE_ADS_CLIENT_SECRET', 'GOOGLE_ADS_REFRESH_TOKEN', 'GOOGLE_ADS_MCC_ID'] as const

/** Names of the Google Ads env vars that are missing or empty. */
export function missingAdsEnv(): string[] {
  return ENV.filter((k) => !process.env[k]?.trim())
}

/** Google API calls one run may make (Explorer access allows 2,880 a day across everything). */
const MAX_CALLS = 150

/** Accounts the playbook says never to touch. Matched on a client or account name, case-insensitive. */
const NEVER_TOUCH = ['mk2 auto spa', "g's elite dump", 'g’s elite dump', 'valor', 'hail recovery', 'evergreen construction', 'apply nex']
export const isNeverTouch = (name: string) => NEVER_TOUCH.some((n) => name.toLowerCase().includes(n))

export type AdsToolContext = {
  runId: string
  /** The run's account. Empty until bind_account when the board had no customer id. */
  customerId: string
  client: string
  /** The client this run works for (Ops engagement); set_ads_step and bind_account write to it. */
  engagementId: string | null
  /** The run started with no account: find_client_account and bind_account stay in its tool list. */
  findAccount?: boolean
  mode: 'work' | 'apply'
  /** Every write is sent validate_only: Google checks it and changes nothing. */
  dry: boolean
  /** Apply mode: the apply tools the approved proposal names. */
  allow?: string[]
  /** Apply mode: the approved call. A write must carry exactly these args. */
  approved?: { action: string; args: Record<string, unknown> }
  calls: number
  /** set_ads_step ran in this run: the agent placed the step itself, so ads.ts leaves it. */
  stepSet?: boolean
  /** Every write tool call that reached Google, in order, with its args (ads.ts moves the board after enable and pause). */
  writes: { tool: string; changed: boolean; args: Record<string, unknown> }[]
}

// ── Plumbing ────────────────────────────────────────────────────────────────

function customer(ctx: AdsToolContext, customerId = ctx.customerId) {
  if (++ctx.calls > MAX_CALLS) throw new Error(`this run has used its ${MAX_CALLS} Google Ads calls; finish with what you have`)
  return getGoogleAdsClient().Customer({
    customer_id: customerId,
    refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN!,
    login_customer_id: process.env.GOOGLE_ADS_MCC_ID,
  })
}

/**
 * Google's error in one line: each error's message, code, the field it points
 * at and its trigger, then the request id (Google support can look a request
 * up by it). The full raw error is logged with the event by mutate().
 * request_error=UNKNOWN with "not in this version" means Google answered with
 * an error code newer than the API version this library speaks, so the real
 * reason is hidden; the line says so.
 */
export function adsError(err: unknown): string {
  const failure = err as {
    errors?: { message?: string; error_code?: Record<string, unknown>; trigger?: { string_value?: string }; location?: { field_path_elements?: { field_name?: string; index?: number }[] } }[]
    request_id?: string
  }
  const errors = failure?.errors
  if (Array.isArray(errors) && errors.length) {
    const lines = errors.map((e) => {
      const code = e.error_code ? Object.entries(e.error_code).map(([k, v]) => `${k}=${v}`).join(',') : ''
      const trigger = e.trigger?.string_value ? ` (trigger: ${e.trigger.string_value})` : ''
      const path = (e.location?.field_path_elements ?? []).map((f) => `${f.field_name}${f.index !== undefined ? `[${f.index}]` : ''}`).join('.')
      const unknown = /not in this version/i.test(e.message ?? '')
        ? ' (Google used an error code newer than this API version, so the reason is hidden; try the same change in the Ads UI to see it)'
        : ''
      return `${e.message ?? 'error'}${code ? ` [${code}]` : ''}${path ? ` at ${path}` : ''}${trigger}${unknown}`
    })
    return `${lines.join('; ')}${failure.request_id ? ` (request id ${failure.request_id})` : ''}`
  }
  return err instanceof Error ? err.message : String(err)
}

async function query(ctx: AdsToolContext, gaql: string): Promise<any[]> {
  try {
    return await customer(ctx).query(gaql)
  } catch (err) {
    throw new Error(`Google Ads query failed: ${adsError(err)}`)
  }
}

/** The one write path. Logs the exact operations and Google's response (or error) as an AgentEvent. */
async function mutate(ctx: AdsToolContext, what: string, operations: MutateOperation<any>[], validateOnly = false) {
  const check = validateOnly || ctx.dry
  const detail = { customerId: ctx.customerId, validateOnly: check, operations: plain(operations) }
  let response: unknown
  try {
    response = plain(await customer(ctx).mutateResources(operations, { validate_only: check }))
  } catch (err) {
    const message = adsError(err)
    await emit(ctx.runId, 'error', `${check ? 'Check' : 'Change'} failed: ${what}: ${message}`, { ...detail, error: message, raw: plain(err) })
    throw new Error(`Google rejected it: ${message}`)
  }
  await emit(ctx.runId, 'tool_result', `${check ? 'Checked, no change made' : 'Changed'}: ${what}`, { ...detail, response })
  const results = ((response as { mutate_operation_responses?: Record<string, { resource_name?: string }>[] })?.mutate_operation_responses ?? [])
    .map((r) => Object.values(r).find((v) => v?.resource_name)?.resource_name)
    .filter(Boolean)
  return { validateOnly: check, changed: !check, results }
}

function plain(v: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(v))
  } catch {
    return String(v)
  }
}

/** Enum number → name ("PAUSED"); strings pass through. */
function en(e: Record<string | number, string | number>, v: unknown): string | null {
  if (v === null || v === undefined) return null
  return typeof v === 'number' ? String(e[v] ?? v) : String(v)
}

const usd = (micros: unknown) => (micros === null || micros === undefined ? null : Math.round(Number(micros) / 10_000) / 100)
const micros = (dollars: number) => Math.round(dollars * 1_000_000)
const num = (v: unknown) => (v === null || v === undefined ? null : Math.round(Number(v) * 100) / 100)
const digits = (v: unknown, field: string) => {
  const s = String(v ?? '').replace(/-/g, '')
  if (!/^\d+$/.test(s)) throw new Error(`${field} must be a numeric id`)
  return s
}

function range(days: unknown, max: number): { start: string; end: string; days: number } {
  const d = Math.min(Math.max(Math.round(Number(days) || 30), 1), max)
  const end = new Date()
  end.setUTCDate(end.getUTCDate() - 1)
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - (d - 1))
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10), days: d }
}

const res = (ctx: AdsToolContext, kind: string, id: string) => `customers/${ctx.customerId}/${kind}/${id}`

// ── Tool definitions ────────────────────────────────────────────────────────

type Def = Omit<ClientTool, 'run'> & { run: (ctx: AdsToolContext, input: Record<string, any>) => Promise<{ result: unknown; label: string | null }> }

const customerIdProp = { type: 'string', description: 'The Google Ads customer id of this run’s account, digits only.' }
const campaignIdProp = { type: 'string', description: 'Campaign id, digits only.' }
const validateOnlyProp = { type: 'boolean', description: 'true: Google checks the change and makes none. Use it to test before a real change.' }

const READS: Def[] = [
  {
    name: 'list_campaigns',
    description: 'Every campaign that is not removed: id, name, status, serving status, type, bidding strategy, daily budget, start and end.',
    input_schema: { type: 'object', properties: { customerId: customerIdProp }, required: ['customerId'] },
    run: async (ctx) => {
      const rows = await query(
        ctx,
        `SELECT campaign.id, campaign.name, campaign.status, campaign.serving_status, campaign.primary_status, campaign.advertising_channel_type,
                campaign.bidding_strategy_type, campaign.start_date_time, campaign.end_date_time, campaign_budget.amount_micros
         FROM campaign WHERE campaign.status != 'REMOVED' ORDER BY campaign.id`
      )
      const campaigns = rows.map((r) => ({
        id: String(r.campaign.id),
        name: r.campaign.name,
        status: en(enums.CampaignStatus, r.campaign.status),
        servingStatus: en(enums.CampaignServingStatus, r.campaign.serving_status),
        primaryStatus: en(enums.CampaignPrimaryStatus, r.campaign.primary_status),
        type: en(enums.AdvertisingChannelType, r.campaign.advertising_channel_type),
        bidding: en(enums.BiddingStrategyType, r.campaign.bidding_strategy_type),
        dailyBudget: usd(r.campaign_budget?.amount_micros),
        start: r.campaign.start_date_time || null,
        end: r.campaign.end_date_time || null,
      }))
      return { result: { campaigns }, label: `${campaigns.length} campaign${campaigns.length === 1 ? '' : 's'} on ${ctx.client}` }
    },
  },
  {
    name: 'campaign_performance',
    description: 'Per-campaign totals for the last N days (ending yesterday): impressions, clicks, cost, conversions, CTR, CPC, cost per conversion, search impression share and what lost it.',
    input_schema: { type: 'object', properties: { customerId: customerIdProp, days: { type: 'number', description: '1 to 365, default 30.' } }, required: ['customerId'] },
    run: async (ctx, i) => {
      const r = range(i.days, 365)
      const rows = await query(
        ctx,
        `SELECT campaign.id, campaign.name, campaign.status, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.all_conversions,
                metrics.ctr, metrics.average_cpc, metrics.cost_per_conversion, metrics.search_impression_share,
                metrics.search_budget_lost_impression_share, metrics.search_rank_lost_impression_share
         FROM campaign WHERE segments.date BETWEEN '${r.start}' AND '${r.end}' AND campaign.status != 'REMOVED'`
      )
      const campaigns = rows.map((x) => ({
        id: String(x.campaign.id),
        name: x.campaign.name,
        status: en(enums.CampaignStatus, x.campaign.status),
        impressions: Number(x.metrics.impressions ?? 0),
        clicks: Number(x.metrics.clicks ?? 0),
        cost: usd(x.metrics.cost_micros) ?? 0,
        conversions: num(x.metrics.conversions) ?? 0,
        allConversions: num(x.metrics.all_conversions) ?? 0,
        ctr: num(Number(x.metrics.ctr ?? 0) * 100),
        avgCpc: usd(x.metrics.average_cpc),
        costPerConversion: usd(x.metrics.cost_per_conversion),
        searchImpressionShare: num(x.metrics.search_impression_share),
        lostToBudget: num(x.metrics.search_budget_lost_impression_share),
        lostToRank: num(x.metrics.search_rank_lost_impression_share),
      }))
      const cost = campaigns.reduce((s, c) => s + c.cost, 0)
      return { result: { from: r.start, to: r.end, campaigns }, label: `${r.days} days on ${ctx.client}: $${cost.toFixed(2)} spent across ${campaigns.length} campaign${campaigns.length === 1 ? '' : 's'}` }
    },
  },
  {
    name: 'search_terms',
    description: 'Search terms that triggered ads in the last N days, highest cost first (up to 200): term, campaign, ad group, whether already added or excluded, impressions, clicks, cost, conversions.',
    input_schema: {
      type: 'object',
      properties: {
        customerId: customerIdProp,
        days: { type: 'number', description: '1 to 90, default 30.' },
        minCost: { type: 'number', description: 'Only terms that cost at least this many dollars. Default 0 (every term with an impression).' },
        campaignId: { type: 'string', description: 'Optional: one campaign only.' },
      },
      required: ['customerId'],
    },
    run: async (ctx, i) => {
      const r = range(i.days, 90)
      const min = Math.max(Number(i.minCost) || 0, 0)
      const camp = i.campaignId ? ` AND campaign.id = ${digits(i.campaignId, 'campaignId')}` : ''
      const rows = await query(
        ctx,
        `SELECT search_term_view.search_term, search_term_view.status, segments.search_term_match_type, campaign.id, campaign.name, ad_group.id, ad_group.name,
                metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
         FROM search_term_view
         WHERE segments.date BETWEEN '${r.start}' AND '${r.end}' AND metrics.impressions > 0${min > 0 ? ` AND metrics.cost_micros >= ${micros(min)}` : ''}${camp}
         ORDER BY metrics.cost_micros DESC LIMIT 200`
      )
      const terms = rows.map((x) => ({
        term: x.search_term_view.search_term,
        status: en(enums.SearchTermTargetingStatus, x.search_term_view.status),
        matchedAs: en(enums.SearchTermMatchType, x.segments?.search_term_match_type),
        campaignId: String(x.campaign.id),
        campaign: x.campaign.name,
        adGroupId: String(x.ad_group.id),
        adGroup: x.ad_group.name,
        impressions: Number(x.metrics.impressions ?? 0),
        clicks: Number(x.metrics.clicks ?? 0),
        cost: usd(x.metrics.cost_micros) ?? 0,
        conversions: num(x.metrics.conversions) ?? 0,
      }))
      return { result: { from: r.start, to: r.end, terms }, label: `${terms.length} search term${terms.length === 1 ? '' : 's'} over ${r.days} days on ${ctx.client}` }
    },
  },
  {
    name: 'keyword_performance',
    description: 'Keywords that are not removed, with match type, status, bid, Quality Score and the last N days of metrics (up to 300).',
    input_schema: { type: 'object', properties: { customerId: customerIdProp, days: { type: 'number', description: '1 to 365, default 30.' } }, required: ['customerId'] },
    run: async (ctx, i) => {
      const r = range(i.days, 365)
      const rows = await query(
        ctx,
        `SELECT campaign.id, campaign.name, ad_group.id, ad_group.name, ad_group_criterion.criterion_id, ad_group_criterion.keyword.text,
                ad_group_criterion.keyword.match_type, ad_group_criterion.status, ad_group_criterion.cpc_bid_micros,
                ad_group_criterion.effective_cpc_bid_micros, ad_group_criterion.quality_info.quality_score,
                metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
         FROM keyword_view
         WHERE segments.date BETWEEN '${r.start}' AND '${r.end}' AND ad_group_criterion.status != 'REMOVED'
         ORDER BY metrics.cost_micros DESC LIMIT 300`
      )
      const keywords = rows.map((x) => ({
        campaignId: String(x.campaign.id),
        campaign: x.campaign.name,
        adGroupId: String(x.ad_group.id),
        adGroup: x.ad_group.name,
        criterionId: String(x.ad_group_criterion.criterion_id),
        text: x.ad_group_criterion.keyword?.text,
        matchType: en(enums.KeywordMatchType, x.ad_group_criterion.keyword?.match_type),
        status: en(enums.AdGroupCriterionStatus, x.ad_group_criterion.status),
        bid: usd(x.ad_group_criterion.cpc_bid_micros),
        effectiveBid: usd(x.ad_group_criterion.effective_cpc_bid_micros),
        qualityScore: x.ad_group_criterion.quality_info?.quality_score ?? null,
        impressions: Number(x.metrics.impressions ?? 0),
        clicks: Number(x.metrics.clicks ?? 0),
        cost: usd(x.metrics.cost_micros) ?? 0,
        conversions: num(x.metrics.conversions) ?? 0,
      }))
      return { result: { from: r.start, to: r.end, keywords }, label: `${keywords.length} keyword${keywords.length === 1 ? '' : 's'} on ${ctx.client}` }
    },
  },
  {
    name: 'conversion_actions_and_goals',
    description:
      'Conversion actions (category, type, origin, status, primary or secondary, counted in Conversions), the account-level goals and whether each is used for bidding, and conversions per action over the last 30 days.',
    input_schema: { type: 'object', properties: { customerId: customerIdProp }, required: ['customerId'] },
    run: async (ctx) => {
      const actions = await query(
        ctx,
        `SELECT conversion_action.id, conversion_action.name, conversion_action.category, conversion_action.type, conversion_action.origin,
                conversion_action.status, conversion_action.primary_for_goal, conversion_action.include_in_conversions_metric
         FROM conversion_action WHERE conversion_action.status != 'REMOVED'`
      )
      const goals = await query(ctx, `SELECT customer_conversion_goal.category, customer_conversion_goal.origin, customer_conversion_goal.biddable FROM customer_conversion_goal`)
      const counts = await query(
        ctx,
        `SELECT segments.conversion_action_name, metrics.conversions, metrics.all_conversions FROM customer WHERE segments.date DURING LAST_30_DAYS`
      )
      const result = {
        actions: actions.map((x) => ({
          id: String(x.conversion_action.id),
          name: x.conversion_action.name,
          category: en(enums.ConversionActionCategory, x.conversion_action.category),
          type: en(enums.ConversionActionType, x.conversion_action.type),
          origin: en(enums.ConversionOrigin, x.conversion_action.origin),
          status: en(enums.ConversionActionStatus, x.conversion_action.status),
          primary: Boolean(x.conversion_action.primary_for_goal),
          inConversions: Boolean(x.conversion_action.include_in_conversions_metric),
        })),
        accountGoals: goals.map((x) => ({
          category: en(enums.ConversionActionCategory, x.customer_conversion_goal.category),
          origin: en(enums.ConversionOrigin, x.customer_conversion_goal.origin),
          biddable: Boolean(x.customer_conversion_goal.biddable),
        })),
        last30Days: counts.map((x) => ({ action: x.segments.conversion_action_name, conversions: num(x.metrics.conversions) ?? 0, allConversions: num(x.metrics.all_conversions) ?? 0 })),
      }
      const bidding = result.accountGoals.filter((g) => g.biddable).length
      return { result, label: `${result.actions.length} conversion action${result.actions.length === 1 ? '' : 's'}, ${bidding} goal${bidding === 1 ? '' : 's'} used for bidding on ${ctx.client}` }
    },
  },
  {
    name: 'campaign_settings',
    description:
      'Settings for one campaign or all: budget (and whether shared), bidding strategy and its limits, location option (Presence or Presence-or-interest), networks, start and end, targeted and excluded locations, ad groups with bids, and the campaign’s negative keywords.',
    input_schema: { type: 'object', properties: { customerId: customerIdProp, campaignId: { type: 'string', description: 'Optional: one campaign only.' } }, required: ['customerId'] },
    run: async (ctx, i) => {
      const only = i.campaignId ? ` AND campaign.id = ${digits(i.campaignId, 'campaignId')}` : ''
      const camps = await query(
        ctx,
        `SELECT campaign.id, campaign.name, campaign.status, campaign.bidding_strategy_type, campaign.manual_cpc.enhanced_cpc_enabled,
                campaign.target_spend.cpc_bid_ceiling_micros, campaign.maximize_conversions.target_cpa_micros, campaign.target_cpa.target_cpa_micros,
                campaign.geo_target_type_setting.positive_geo_target_type, campaign.geo_target_type_setting.negative_geo_target_type,
                campaign.network_settings.target_google_search, campaign.network_settings.target_search_network,
                campaign.network_settings.target_content_network, campaign.network_settings.target_partner_search_network,
                campaign.start_date_time, campaign.end_date_time, campaign_budget.amount_micros, campaign_budget.explicitly_shared, campaign_budget.reference_count
         FROM campaign WHERE campaign.status != 'REMOVED'${only}`
      )
      const crit = await query(
        ctx,
        `SELECT campaign.id, campaign_criterion.criterion_id, campaign_criterion.type, campaign_criterion.negative, campaign_criterion.location.geo_target_constant,
                campaign_criterion.proximity.radius, campaign_criterion.proximity.radius_units, campaign_criterion.proximity.address.city_name,
                campaign_criterion.keyword.text, campaign_criterion.keyword.match_type
         FROM campaign_criterion
         WHERE campaign_criterion.type IN ('LOCATION', 'PROXIMITY', 'KEYWORD') AND campaign.status != 'REMOVED'${only}`
      )
      const groups = await query(
        ctx,
        `SELECT campaign.id, ad_group.id, ad_group.name, ad_group.status, ad_group.cpc_bid_micros FROM ad_group WHERE ad_group.status != 'REMOVED' AND campaign.status != 'REMOVED'${only}`
      )
      const geoIds = Array.from(new Set(crit.map((c) => c.campaign_criterion.location?.geo_target_constant).filter(Boolean))) as string[]
      const geoNames = new Map<string, string>()
      if (geoIds.length) {
        const geos = await query(
          ctx,
          `SELECT geo_target_constant.resource_name, geo_target_constant.canonical_name FROM geo_target_constant WHERE geo_target_constant.resource_name IN (${geoIds.map((g) => `'${g}'`).join(', ')})`
        )
        for (const g of geos) geoNames.set(g.geo_target_constant.resource_name, g.geo_target_constant.canonical_name)
      }
      const campaigns = camps.map((x) => {
        const id = String(x.campaign.id)
        const mine = crit.filter((c) => String(c.campaign.id) === id)
        const type = (c: any) => en(enums.CriterionType, c.campaign_criterion.type)
        return {
          id,
          name: x.campaign.name,
          status: en(enums.CampaignStatus, x.campaign.status),
          dailyBudget: usd(x.campaign_budget?.amount_micros),
          budgetShared: Boolean(x.campaign_budget?.explicitly_shared) || Number(x.campaign_budget?.reference_count ?? 1) > 1,
          bidding: en(enums.BiddingStrategyType, x.campaign.bidding_strategy_type),
          cpcCeiling: usd(x.campaign.target_spend?.cpc_bid_ceiling_micros),
          targetCpa: usd(x.campaign.maximize_conversions?.target_cpa_micros ?? x.campaign.target_cpa?.target_cpa_micros),
          locationOption: en(enums.PositiveGeoTargetType, x.campaign.geo_target_type_setting?.positive_geo_target_type),
          exclusionOption: en(enums.NegativeGeoTargetType, x.campaign.geo_target_type_setting?.negative_geo_target_type),
          networks: {
            googleSearch: Boolean(x.campaign.network_settings?.target_google_search),
            searchPartners: Boolean(x.campaign.network_settings?.target_search_network),
            display: Boolean(x.campaign.network_settings?.target_content_network),
          },
          start: x.campaign.start_date_time || null,
          end: x.campaign.end_date_time || null,
          locations: mine
            .filter((c) => type(c) === 'LOCATION' || type(c) === 'PROXIMITY')
            .map((c) => ({
              criterionId: String(c.campaign_criterion.criterion_id),
              excluded: Boolean(c.campaign_criterion.negative),
              place:
                type(c) === 'LOCATION'
                  ? geoNames.get(c.campaign_criterion.location.geo_target_constant) ?? c.campaign_criterion.location.geo_target_constant
                  : `${c.campaign_criterion.proximity?.radius} ${en(enums.ProximityRadiusUnits, c.campaign_criterion.proximity?.radius_units)?.toLowerCase()} around ${c.campaign_criterion.proximity?.address?.city_name ?? 'a point'}`,
            })),
          negativeKeywords: mine
            .filter((c) => type(c) === 'KEYWORD' && c.campaign_criterion.negative)
            .map((c) => `${c.campaign_criterion.keyword?.text} (${en(enums.KeywordMatchType, c.campaign_criterion.keyword?.match_type)})`),
          adGroups: groups
            .filter((g) => String(g.campaign.id) === id)
            .map((g) => ({ id: String(g.ad_group.id), name: g.ad_group.name, status: en(enums.AdGroupStatus, g.ad_group.status), cpcBid: usd(g.ad_group.cpc_bid_micros) })),
        }
      })
      return { result: { campaigns }, label: `Settings for ${campaigns.length} campaign${campaigns.length === 1 ? '' : 's'} on ${ctx.client}` }
    },
  },
  {
    name: 'change_history',
    description: 'Changes made to the account in the last N days (up to 30; newest first, up to 200): when, who, what kind of thing, what changed.',
    input_schema: { type: 'object', properties: { customerId: customerIdProp, days: { type: 'number', description: '1 to 30, default 14.' } }, required: ['customerId'] },
    run: async (ctx, i) => {
      // Google refuses a start more than 30 days back, so 30 means the last 29 full days plus today.
      const d = Math.min(Math.max(Math.round(Number(i.days) || 14), 1), 30)
      const start = new Date(Date.now() - (d - 1) * 86_400_000).toISOString().slice(0, 10)
      const end = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
      const rows = await query(
        ctx,
        `SELECT change_event.change_date_time, change_event.change_resource_type, change_event.resource_change_operation, change_event.changed_fields,
                change_event.user_email, change_event.client_type, change_event.campaign
         FROM change_event
         WHERE change_event.change_date_time >= '${start}' AND change_event.change_date_time <= '${end}'
         ORDER BY change_event.change_date_time DESC LIMIT 200`
      )
      const changes = rows.map((x) => ({
        at: x.change_event.change_date_time,
        what: en(enums.ChangeEventResourceType, x.change_event.change_resource_type),
        operation: en(enums.ResourceChangeOperation, x.change_event.resource_change_operation),
        fields: x.change_event.changed_fields?.paths ?? x.change_event.changed_fields ?? null,
        by: x.change_event.user_email || null,
        via: en(enums.ChangeClientType, x.change_event.client_type),
        campaign: x.change_event.campaign || null,
      }))
      return { result: { days: d, changes }, label: `${changes.length} change${changes.length === 1 ? '' : 's'} in ${d} days on ${ctx.client}` }
    },
  },
]

/** Current ad group bid and its campaign, for the lower-only rule. */
async function adGroupBid(ctx: AdsToolContext, adGroupId: string) {
  const rows = await query(ctx, `SELECT ad_group.id, ad_group.name, ad_group.cpc_bid_micros, campaign.id FROM ad_group WHERE ad_group.id = ${adGroupId}`)
  if (!rows.length) throw new Error(`no ad group ${adGroupId} on this account`)
  return { name: rows[0].ad_group.name as string, bidMicros: Number(rows[0].ad_group.cpc_bid_micros ?? 0) }
}

/** set_ad_group_cpc: only lowering in work mode; any change in apply mode. */
const SET_AD_GROUP_CPC: Def = {
  name: 'set_ad_group_cpc',
  description: 'Set an ad group’s default max CPC in dollars. In a work run it must be lower than the current bid; raising a bid is a proposal.',
  input_schema: {
    type: 'object',
    properties: { customerId: customerIdProp, adGroupId: { type: 'string', description: 'Ad group id, digits only.' }, cpc: { type: 'number', description: 'New max CPC in dollars.' }, validateOnly: validateOnlyProp },
    required: ['customerId', 'adGroupId', 'cpc'],
  },
  run: async (ctx, i) => {
    const id = digits(i.adGroupId, 'adGroupId')
    if (!(i.cpc > 0)) throw new Error('cpc must be more than 0')
    const cur = await adGroupBid(ctx, id)
    const next = micros(i.cpc)
    if (ctx.mode === 'work' && !(cur.bidMicros > 0 && next < cur.bidMicros)) {
      throw new Error(`a work run may only lower a bid; ${cur.name} is at $${usd(cur.bidMicros)}. Put a raise in proposals.`)
    }
    const what = `${cur.name} max CPC $${usd(cur.bidMicros)} to $${usd(next)}`
    const r = await mutate(ctx, what, [{ entity: 'ad_group', operation: 'update', resource: { resource_name: res(ctx, 'adGroups', id), cpc_bid_micros: next } }], i.validateOnly)
    return { result: { ...r, from: usd(cur.bidMicros), to: usd(next) }, label: null }
  },
}

/** set_location_option: an AUTO change in a work run, or an approved proposal in apply mode. */
const SET_LOCATION_OPTION: Def = {
  name: 'set_location_option',
  description: 'Set a campaign to show only to people in or regularly in its locations (Presence), instead of people interested in them.',
  input_schema: {
    type: 'object',
    properties: { customerId: customerIdProp, campaignId: campaignIdProp, option: { type: 'string', enum: ['PRESENCE'] }, validateOnly: validateOnlyProp },
    required: ['customerId', 'campaignId', 'option'],
  },
  run: async (ctx, i) => {
    const id = digits(i.campaignId, 'campaignId')
    const what = `campaign ${id} location option to Presence`
    const r = await mutate(
      ctx,
      what,
      [{ entity: 'campaign', operation: 'update', resource: { resource_name: res(ctx, 'campaigns', id), geo_target_type_setting: { positive_geo_target_type: enums.PositiveGeoTargetType.PRESENCE } } }],
      i.validateOnly
    )
    return { result: r, label: null }
  },
}

// ── Finding the account, recording progress ───────────────────────────────

/** Client accounts directly under the MCC (customer_client, level 1, not managers). */
async function mccClients(ctx: AdsToolContext) {
  const mcc = process.env.GOOGLE_ADS_MCC_ID!.replace(/-/g, '')
  let rows: any[]
  try {
    rows = await customer(ctx, mcc).query(
      `SELECT customer_client.id, customer_client.descriptive_name, customer_client.status, customer_client.manager
       FROM customer_client WHERE customer_client.level = 1 AND customer_client.manager = FALSE`
    )
  } catch (err) {
    throw new Error(`Google Ads query failed: ${adsError(err)}`)
  }
  return rows.map((r) => ({ id: String(r.customer_client.id), name: String(r.customer_client.descriptive_name ?? ''), status: en(enums.CustomerStatus, r.customer_client.status) }))
}

/** Customer id (digits) → the board client it is bound to, from the platform account or the ads deliverable. */
async function boundAccounts(): Promise<Map<string, string>> {
  const rows = await db.engagement.findMany({
    select: { displayName: true, business: { select: { googleAdsCustomerId: true } }, deliverables: { where: { type: 'ads' }, select: { evidence: true } } },
  })
  const map = new Map<string, string>()
  for (const r of rows) {
    const ids = [r.business?.googleAdsCustomerId, (r.deliverables[0]?.evidence as Record<string, unknown> | null)?.adsCustomerId]
    for (const id of ids) if (typeof id === 'string' && id.trim()) map.set(id.replace(/\D/g, ''), r.displayName.trim())
  }
  return map
}

const FIND_CLIENT_ACCOUNT: Def = {
  name: 'find_client_account',
  description:
    'The client accounts under the Align and Acquire manager: with a query, those whose name matches; with no query, every one. Each says which board client it is already bound to (boundTo), if any. Use peek_account to see what is inside a candidate, then bind_account the right one. Never create an account.',
  input_schema: { type: 'object', properties: { query: { type: 'string', description: 'Part of the account name, e.g. "Prestige" or "blinds". Leave out to list every account.' } } },
  run: async (ctx, i) => {
    const words = String(i.query ?? '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1)
    const [all, bound] = await Promise.all([mccClients(ctx), boundAccounts()])
    const hits = words.length ? all.filter((a) => words.some((w) => a.name.toLowerCase().includes(w))) : all
    const matches = hits.map((a) => ({ ...a, boundTo: bound.get(a.id) ?? null, neverTouch: isNeverTouch(a.name) }))
    const what = words.length ? `match "${oneLine(String(i.query), 40)}"` : 'in all'
    return { result: { matches }, label: `${matches.length} account${matches.length === 1 ? '' : 's'} under the manager ${what}` }
  },
}

const PEEK_ACCOUNT: Def = {
  name: 'peek_account',
  description:
    'Read only, without binding: one account under the manager, its campaigns (status, daily budget) and the last 30 days of cost, clicks and conversions. Use it to tell two candidate accounts apart before bind_account. Refuses never-touch accounts.',
  input_schema: { type: 'object', properties: { customerId: { type: 'string', description: 'An account id from find_client_account.' } }, required: ['customerId'] },
  run: async (ctx, i) => {
    const id = digits(i.customerId, 'customerId')
    const account = (await mccClients(ctx)).find((a) => a.id === id)
    if (!account) throw new Error(`${id} is not a client account under the manager`)
    if (isNeverTouch(account.name)) throw new Error(`${account.name} is on the never-touch list`)
    let rows: any[]
    try {
      rows = await customer(ctx, id).query(
        `SELECT campaign.id, campaign.name, campaign.status, campaign_budget.amount_micros, metrics.cost_micros, metrics.clicks, metrics.conversions
         FROM campaign WHERE campaign.status != 'REMOVED' AND segments.date DURING LAST_30_DAYS`
      )
    } catch (err) {
      throw new Error(`Google Ads query failed: ${adsError(err)}`)
    }
    // Rows come per campaign per day; sum them per campaign.
    const byId = new Map<string, { id: string; name: string; status: string | null; dailyBudget: number | null; cost30d: number; clicks30d: number; conversions30d: number }>()
    for (const r of rows) {
      const cid = String(r.campaign.id)
      const c = byId.get(cid) ?? { id: cid, name: r.campaign.name, status: en(enums.CampaignStatus, r.campaign.status), dailyBudget: usd(r.campaign_budget?.amount_micros), cost30d: 0, clicks30d: 0, conversions30d: 0 }
      c.cost30d += usd(r.metrics?.cost_micros) ?? 0
      c.clicks30d += Number(r.metrics?.clicks ?? 0)
      c.conversions30d += Number(r.metrics?.conversions ?? 0)
      byId.set(cid, c)
    }
    const campaigns = Array.from(byId.values()).map((c) => ({ ...c, cost30d: Math.round(c.cost30d * 100) / 100 }))
    const cost = Math.round(campaigns.reduce((n, c) => n + c.cost30d, 0) * 100) / 100
    return {
      result: { account: { ...account }, campaignsWithActivity: campaigns, cost30d: cost, note: 'Only campaigns with a row in the last 30 days are listed; an account with none shows an empty list.' },
      label: `${account.name} (${id}): ${campaigns.length} campaign${campaigns.length === 1 ? '' : 's'} active in 30 days, $${cost} spent`,
    }
  },
}

const BIND_ACCOUNT: Def = {
  name: 'bind_account',
  description:
    'Make an account under the manager this run’s account, once. It also records the customer id on the client’s platform account and the ads deliverable, if they have none. Every other tool then takes this customerId.',
  input_schema: { type: 'object', properties: { customerId: { type: 'string', description: 'The account id from find_client_account, digits only.' } }, required: ['customerId'] },
  run: async (ctx, i) => {
    if (ctx.customerId) throw new Error(`this run is already on ${ctx.client} (customer ${ctx.customerId})`)
    const id = digits(i.customerId, 'customerId')
    const account = (await mccClients(ctx)).find((a) => a.id === id)
    if (!account) throw new Error(`${id} is not a client account under the manager`)
    if (account.status !== 'ENABLED') throw new Error(`${account.name} is ${account.status}, not enabled`)
    if (isNeverTouch(account.name)) throw new Error(`${account.name} is on the never-touch list`)
    if (!ctx.engagementId) throw new Error('this run has no client to record the account on')
    const boundTo = (await boundAccounts()).get(id)
    if (boundTo && boundTo !== ctx.client) throw new Error(`${account.name} (${id}) is already bound to ${boundTo}`)
    const e = await db.engagement.findUnique({
      where: { id: ctx.engagementId },
      select: { businessId: true, business: { select: { googleAdsCustomerId: true } }, deliverables: { where: { type: 'ads' }, select: { id: true, evidence: true } } },
    })
    const onBusiness = e?.business?.googleAdsCustomerId?.replace(/-/g, '') || null
    if (onBusiness && onBusiness !== id) throw new Error(`the platform account already has Google Ads customer ${onBusiness}; Jacob must fix that by hand`)

    // The one Business write HQ makes: the customer id, only when it is empty.
    let recorded = false
    if (e?.businessId && !onBusiness) {
      const done = await db.business.updateMany({ where: { id: e.businessId, googleAdsCustomerId: null }, data: { googleAdsCustomerId: id } })
      recorded = done.count > 0
    }
    const ads = e?.deliverables[0]
    if (ads) {
      const evidence = (ads.evidence ?? {}) as Record<string, unknown>
      if (evidence.adsCustomerId !== id) await db.deliverable.update({ where: { id: ads.id }, data: { evidence: { ...evidence, adsCustomerId: id } as Prisma.InputJsonObject } })
    }
    ctx.customerId = id
    const run = await db.agentRun.findUnique({ where: { id: ctx.runId }, select: { input: true } })
    await db.agentRun.update({ where: { id: ctx.runId }, data: { input: { ...((run?.input ?? {}) as Record<string, unknown>), customerId: id } as Prisma.InputJsonObject } })
    return {
      result: { ok: true, customerId: id, account: account.name, recordedOnPlatform: recorded },
      label: `Working in ${account.name} (${id})${recorded ? ', customer id recorded on the platform account' : ''}`,
    }
  },
}

const SET_ADS_STEP: Def = {
  name: 'set_ads_step',
  description: `Move this client’s ads deliverable to a step on the Ops board, with a short note Jacob will read. Steps: ${STEP_CATALOG.ads.map((st) => st.key).join(', ')}.`,
  input_schema: { type: 'object', properties: { step: { type: 'string' }, note: { type: 'string', description: 'One line, e.g. "Built paused Oct 27; waiting on Jacob\u2019s Push".' } }, required: ['step', 'note'] },
  run: async (ctx, i) => {
    const key = String(i.step).trim()
    if (!stepFor('ads', key)) throw new Error(`"${key}" is not an ads step. Valid: ${STEP_CATALOG.ads.map((st) => st.key).join(', ')}`)
    if (!ctx.engagementId) throw new Error('this run has no client')
    const note = noEmDash(String(i.note).trim())
    if (!note) throw new Error('note is empty')
    await setAdsStep(ctx.engagementId, ctx.client, key, note)
    ctx.stepSet = true
    return { result: { ok: true, step: key }, label: `Ads step for ${ctx.client} set to ${key}: ${note}` }
  },
}

/**
 * Move a client's ads deliverable to a step with Jacob's note, and log it as
 * an activity. evidence merges into the deliverable's evidence (e.g. the daily
 * budget once a campaign runs). Ops tables only.
 */
export async function setAdsStep(engagementId: string, client: string, key: string, note: string, evidence?: Record<string, unknown>) {
  const d = await db.deliverable.findUnique({ where: { engagementId_type: { engagementId, type: 'ads' } }, select: { id: true, evidence: true } })
  if (!d) throw new Error(`${client} has no ads deliverable`)
  const merged = evidence ? { ...((d.evidence ?? {}) as Record<string, unknown>), ...evidence } : undefined
  await db.$transaction([
    db.deliverable.update({
      where: { id: d.id },
      data: { step: key, stepUpdatedAt: new Date(), waitingOn: defaultWaitingOn('ads', key), waitingNote: note, ...(merged ? { evidence: merged as Prisma.InputJsonObject } : {}) },
    }),
    db.opsActivity.create({ data: { engagementId, kind: 'note', body: `Ads: ${note}` } }),
  ])
}

/** Campaigns in the run's account that are not removed: id, status name, daily budget in dollars. */
export async function campaignStates(ctx: AdsToolContext): Promise<{ id: string; status: string | null; dailyBudget: number | null }[]> {
  const rows = await query(ctx, `SELECT campaign.id, campaign.status, campaign_budget.amount_micros FROM campaign WHERE campaign.status != 'REMOVED'`)
  return rows.map((r) => ({ id: String(r.campaign.id), status: en(enums.CampaignStatus, r.campaign.status), dailyBudget: usd(r.campaign_budget?.amount_micros) }))
}

const WORK_WRITES: Def[] = [
  {
    name: 'add_campaign_negatives',
    description:
      'Add phrase-match negative keywords to one campaign. Block the junk, never a real buyer query for the client’s service. Skip phrases the campaign already has.',
    input_schema: {
      type: 'object',
      properties: {
        customerId: customerIdProp,
        campaignId: campaignIdProp,
        phrases: { type: 'array', items: { type: 'string' }, description: 'Up to 50 phrases, lower case.' },
        validateOnly: validateOnlyProp,
      },
      required: ['customerId', 'campaignId', 'phrases'],
    },
    run: async (ctx, i) => {
      const campaignId = digits(i.campaignId, 'campaignId')
      const phrases = Array.from(new Set((i.phrases as unknown[]).map((p) => String(p).trim().toLowerCase()).filter(Boolean)))
      if (!phrases.length) throw new Error('phrases is empty')
      if (phrases.length > 50) throw new Error('at most 50 phrases per call')
      const ops = phrases.map((text) => ({
        entity: 'campaign_criterion' as const,
        operation: 'create' as const,
        resource: { campaign: res(ctx, 'campaigns', campaignId), negative: true, keyword: { text, match_type: enums.KeywordMatchType.PHRASE } },
      }))
      const what = `${phrases.length} negative${phrases.length === 1 ? '' : 's'} on campaign ${campaignId} (${oneLine(phrases.join(', '), 80)})`
      const r = await mutate(ctx, what, ops, i.validateOnly)
      return { result: { ...r, phrases }, label: null }
    },
  },
  {
    name: 'pause_campaign',
    description: 'Pause a campaign that is spending against the client’s wishes or with no way to measure results.',
    input_schema: { type: 'object', properties: { customerId: customerIdProp, campaignId: campaignIdProp, validateOnly: validateOnlyProp }, required: ['customerId', 'campaignId'] },
    run: async (ctx, i) => {
      const id = digits(i.campaignId, 'campaignId')
      const what = `pause campaign ${id}`
      const r = await mutate(ctx, what, [{ entity: 'campaign', operation: 'update', resource: { resource_name: res(ctx, 'campaigns', id), status: enums.CampaignStatus.PAUSED } }], i.validateOnly)
      return { result: r, label: null }
    },
  },
  ...(['pause', 'enable'] as const).map(
    (verb): Def => ({
      name: `${verb}_ad_group`,
      description:
        verb === 'pause'
          ? 'Pause one ad group in a campaign (e.g. a seasonal service out of season) and leave the rest of the campaign running.'
          : 'Turn a paused ad group back on.',
      input_schema: {
        type: 'object',
        properties: { customerId: customerIdProp, campaignId: campaignIdProp, adGroupId: { type: 'string', description: 'Ad group id (digits).' }, validateOnly: validateOnlyProp },
        required: ['customerId', 'campaignId', 'adGroupId'],
      },
      run: async (ctx, i) => {
        const campaignId = digits(i.campaignId, 'campaignId')
        const adGroupId = digits(i.adGroupId, 'adGroupId')
        const rows = await query(ctx, `SELECT ad_group.id, ad_group.name, ad_group.status FROM ad_group WHERE ad_group.id = ${adGroupId} AND campaign.id = ${campaignId}`)
        if (!rows.length) throw new Error(`ad group ${adGroupId} is not in campaign ${campaignId}`)
        const name = rows[0].ad_group.name
        const status = verb === 'pause' ? enums.AdGroupStatus.PAUSED : enums.AdGroupStatus.ENABLED
        const what = `${verb} ad group "${name}" (${adGroupId}) in campaign ${campaignId}`
        const r = await mutate(ctx, what, [{ entity: 'ad_group', operation: 'update', resource: { resource_name: res(ctx, 'adGroups', adGroupId), status } }], i.validateOnly)
        return { result: { ...r, adGroup: name }, label: null }
      },
    })
  ),
  {
    name: 'exclude_conversion_goal',
    description:
      'Stop an account-level conversion goal (category + origin, as conversion_actions_and_goals shows them) from being used for bidding, e.g. YouTube or page views. The actions still record.',
    input_schema: {
      type: 'object',
      properties: {
        customerId: customerIdProp,
        category: { type: 'string', description: 'e.g. PAGE_VIEW, ENGAGEMENT, DEFAULT.' },
        origin: { type: 'string', description: 'e.g. WEBSITE, YOUTUBE_HOSTED, GOOGLE_HOSTED.' },
        validateOnly: validateOnlyProp,
      },
      required: ['customerId', 'category', 'origin'],
    },
    run: async (ctx, i) => {
      const category = String(i.category).toUpperCase()
      const origin = String(i.origin).toUpperCase()
      if (!(category in enums.ConversionActionCategory)) throw new Error(`unknown category ${category}`)
      if (!(origin in enums.ConversionOrigin)) throw new Error(`unknown origin ${origin}`)
      const what = `stop bidding on ${category} / ${origin} conversions`
      const r = await mutate(
        ctx,
        what,
        [{ entity: 'customer_conversion_goal', operation: 'update', resource: { resource_name: res(ctx, 'customerConversionGoals', `${category}~${origin}`), biddable: false } }],
        i.validateOnly
      )
      return { result: r, label: null }
    },
  },
  SET_AD_GROUP_CPC,
  SET_LOCATION_OPTION,
  {
    name: 'create_conversion_action',
    description:
      'Create a conversion action. AD_CALL counts calls from the call asset on an ad (give callDurationSeconds); WEBPAGE is a page or form the site tag fires; WEBSITE_CALL is a click-to-call on the site. Creating it gives the tag a label to fire; it records nothing until the tag is on the site.',
    input_schema: {
      type: 'object',
      properties: {
        customerId: customerIdProp,
        name: { type: 'string', description: 'What Jacob will see in the account, e.g. "Calls from ads".' },
        type: { type: 'string', enum: ['AD_CALL', 'WEBPAGE', 'WEBSITE_CALL', 'CLICK_TO_CALL'], description: 'AD_CALL for calls from the ad call asset.' },
        category: { type: 'string', description: 'PHONE_CALL_LEAD, SUBMIT_LEAD_FORM, QUALIFIED_LEAD, CONVERTED_LEAD or DEFAULT.' },
        primary: { type: 'boolean', description: 'Primary (counted in Conversions and used for bidding). Default true.' },
        countingType: { type: 'string', enum: ['ONE_PER_CLICK', 'MANY_PER_CLICK'], description: 'Default ONE_PER_CLICK, which is right for a lead.' },
        callDurationSeconds: { type: 'number', description: 'AD_CALL and WEBSITE_CALL only: how long a call must last to count. Google requires 0 to 600.' },
        validateOnly: validateOnlyProp,
      },
      required: ['customerId', 'name', 'type', 'category'],
    },
    run: async (ctx, i) => {
      const name = String(i.name).trim()
      if (!name) throw new Error('name is required')
      const type = String(i.type).toUpperCase()
      const category = String(i.category).toUpperCase()
      if (!(type in enums.ConversionActionType)) throw new Error(`unknown type ${type}`)
      if (!(category in enums.ConversionActionCategory)) throw new Error(`unknown category ${category}`)
      const counting = String(i.countingType ?? 'ONE_PER_CLICK').toUpperCase()
      if (!(counting in enums.ConversionActionCountingType)) throw new Error(`unknown countingType ${counting}`)
      const callType = type === 'AD_CALL' || type === 'WEBSITE_CALL'
      if (i.callDurationSeconds !== undefined) {
        if (!callType) throw new Error('callDurationSeconds applies only to AD_CALL and WEBSITE_CALL')
        if (!(i.callDurationSeconds >= 0 && i.callDurationSeconds <= 600)) throw new Error('callDurationSeconds must be 0 to 600')
      }
      const primary = i.primary !== false
      const resource: Record<string, unknown> = {
        name,
        type: enums.ConversionActionType[type as keyof typeof enums.ConversionActionType],
        category: enums.ConversionActionCategory[category as keyof typeof enums.ConversionActionCategory],
        status: enums.ConversionActionStatus.ENABLED,
        counting_type: enums.ConversionActionCountingType[counting as keyof typeof enums.ConversionActionCountingType],
        // include_in_conversions_metric is output only (Google derives it from primary_for_goal); sending it is rejected as immutable.
        primary_for_goal: primary,
      }
      if (callType && i.callDurationSeconds !== undefined) resource.phone_call_duration_seconds = Math.round(Number(i.callDurationSeconds))
      const what = `conversion action "${name}" (${type} / ${category}${primary ? ', primary' : ', secondary'})`
      const r = await mutate(ctx, what, [{ entity: 'conversion_action', operation: 'create', resource }], i.validateOnly)
      return { result: { ...r, name, type, category, primary }, label: null }
    },
  },
  {
    name: 'add_call_asset',
    description:
      'Put a phone number on a campaign as a call asset, optionally reporting calls to an AD_CALL conversion action. Creates the asset and links it to the campaign in one all-or-nothing change.',
    input_schema: {
      type: 'object',
      properties: {
        customerId: customerIdProp,
        campaignId: campaignIdProp,
        phoneNumber: { type: 'string', description: 'The number as the client publishes it, e.g. "+1 954-790-8436".' },
        countryCode: { type: 'string', description: 'Two-letter country code, default US.' },
        conversionActionId: { type: 'string', description: 'Optional: an AD_CALL conversion action id, so calls from this asset are counted.' },
        validateOnly: validateOnlyProp,
      },
      required: ['customerId', 'campaignId', 'phoneNumber'],
    },
    run: async (ctx, i) => {
      const campaignId = digits(i.campaignId, 'campaignId')
      const phone = String(i.phoneNumber).trim()
      if (!phone) throw new Error('phoneNumber is required')
      const country = String(i.countryCode ?? 'US').toUpperCase()
      if (!/^[A-Z]{2}$/.test(country)) throw new Error('countryCode must be two letters')
      const asset = res(ctx, 'assets', '-1')
      const call: Record<string, unknown> = { phone_number: phone, country_code: country }
      if (i.conversionActionId) {
        call.call_conversion_action = res(ctx, 'conversionActions', digits(i.conversionActionId, 'conversionActionId'))
        call.call_conversion_reporting_state = enums.CallConversionReportingState.USE_RESOURCE_LEVEL_CALL_CONVERSION_ACTION
      } else {
        call.call_conversion_reporting_state = enums.CallConversionReportingState.USE_ACCOUNT_LEVEL_CALL_CONVERSION_ACTION
      }
      const ops: MutateOperation<any>[] = [
        { entity: 'asset', operation: 'create', resource: { resource_name: asset, name: `Call ${phone}`, type: enums.AssetType.CALL, call_asset: call } },
        { entity: 'campaign_asset', operation: 'create', resource: { campaign: res(ctx, 'campaigns', campaignId), asset, field_type: enums.AssetFieldType.CALL, status: enums.AssetLinkStatus.ENABLED } },
      ]
      const what = `call asset ${phone} on campaign ${campaignId}${i.conversionActionId ? ` reporting to conversion action ${i.conversionActionId}` : ''}`
      const r = await mutate(ctx, what, ops, i.validateOnly)
      return { result: { ...r, phone, campaignId }, label: null }
    },
  },
  {
    name: 'set_network_settings',
    description: 'Choose which networks a Search campaign shows on. Search partners and the Display network are usually off for a local service account.',
    input_schema: {
      type: 'object',
      properties: {
        customerId: customerIdProp,
        campaignId: campaignIdProp,
        googleSearch: { type: 'boolean', description: 'Google Search itself. Default true.' },
        searchPartners: { type: 'boolean', description: 'Google Search partners. Default false.' },
        displayNetwork: { type: 'boolean', description: 'The Display network. Default false.' },
        validateOnly: validateOnlyProp,
      },
      required: ['customerId', 'campaignId'],
    },
    run: async (ctx, i) => {
      const id = digits(i.campaignId, 'campaignId')
      const search = i.googleSearch !== false
      const partners = i.searchPartners === true
      const display = i.displayNetwork === true
      if (!search && !partners && !display) throw new Error('a campaign must show on at least one network')
      const what = `campaign ${id} networks: search ${search ? 'on' : 'off'}, partners ${partners ? 'on' : 'off'}, display ${display ? 'on' : 'off'}`
      const r = await mutate(
        ctx,
        what,
        [
          {
            entity: 'campaign',
            operation: 'update',
            resource: {
              resource_name: res(ctx, 'campaigns', id),
              network_settings: { target_google_search: search, target_search_network: partners, target_content_network: display, target_partner_search_network: false },
            },
          },
        ],
        i.validateOnly
      )
      return { result: r, label: null }
    },
  },
  {
    name: 'create_ad_group',
    description: 'Add a Search ad group to an existing campaign, with its default max CPC. Keywords and the ad go in afterwards with add_keywords and upsert_rsa.',
    input_schema: {
      type: 'object',
      properties: { customerId: customerIdProp, campaignId: campaignIdProp, name: { type: 'string' }, cpc: { type: 'number', description: 'Default max CPC in dollars.' }, validateOnly: validateOnlyProp },
      required: ['customerId', 'campaignId', 'name', 'cpc'],
    },
    run: async (ctx, i) => {
      const campaignId = digits(i.campaignId, 'campaignId')
      const name = String(i.name).trim()
      if (!name) throw new Error('name is required')
      if (!(i.cpc > 0)) throw new Error('cpc must be more than 0')
      const what = `ad group "${name}" on campaign ${campaignId} at $${i.cpc} max CPC`
      const r = await mutate(
        ctx,
        what,
        [
          {
            entity: 'ad_group',
            operation: 'create',
            resource: { name, campaign: res(ctx, 'campaigns', campaignId), status: enums.AdGroupStatus.ENABLED, type: enums.AdGroupType.SEARCH_STANDARD, cpc_bid_micros: micros(i.cpc) },
          },
        ],
        i.validateOnly
      )
      return { result: { ...r, name }, label: null }
    },
  },
  {
    name: 'add_keywords',
    description: 'Add keywords to an ad group. Phrase and exact are the useful match types for a local service account; broad spends on anything.',
    input_schema: {
      type: 'object',
      properties: {
        customerId: customerIdProp,
        adGroupId: { type: 'string', description: 'Ad group id, digits only.' },
        keywords: {
          type: 'array',
          description: 'Up to 100 per call: [{ text, matchType: "PHRASE" | "EXACT" | "BROAD" }].',
          items: { type: 'object', properties: { text: { type: 'string' }, matchType: { type: 'string', enum: ['PHRASE', 'EXACT', 'BROAD'] } }, required: ['text'] },
        },
        validateOnly: validateOnlyProp,
      },
      required: ['customerId', 'adGroupId', 'keywords'],
    },
    run: async (ctx, i) => {
      const adGroupId = digits(i.adGroupId, 'adGroupId')
      const list = (i.keywords as { text?: unknown; matchType?: unknown }[]) ?? []
      if (!Array.isArray(list) || !list.length) throw new Error('keywords is empty')
      if (list.length > 100) throw new Error('at most 100 keywords per call')
      const seen = new Set<string>()
      const ops = list.map((k) => {
        const text = String(k.text ?? '').trim().toLowerCase()
        if (!text) throw new Error('every keyword needs text')
        const mt = String(k.matchType ?? 'PHRASE').toUpperCase()
        if (!['PHRASE', 'EXACT', 'BROAD'].includes(mt)) throw new Error(`unknown matchType ${mt}`)
        const key = `${mt}:${text}`
        if (seen.has(key)) throw new Error(`"${text}" is listed twice as ${mt}`)
        seen.add(key)
        return {
          entity: 'ad_group_criterion' as const,
          operation: 'create' as const,
          resource: { ad_group: res(ctx, 'adGroups', adGroupId), status: enums.AdGroupCriterionStatus.ENABLED, keyword: { text, match_type: enums.KeywordMatchType[mt as 'PHRASE' | 'EXACT' | 'BROAD'] } },
        }
      })
      const what = `${ops.length} keyword${ops.length === 1 ? '' : 's'} on ad group ${adGroupId} (${oneLine(list.map((k) => String(k.text)).join(', '), 80)})`
      const r = await mutate(ctx, what, ops, i.validateOnly)
      return { result: { ...r, count: ops.length }, label: null }
    },
  },
  {
    name: 'upsert_rsa',
    description:
      'Put a responsive search ad in an ad group. Google does not allow editing an RSA\u2019s text, so this creates a new one; with replaceExisting it removes the ad group\u2019s current enabled RSAs in the same change. 3 to 15 headlines (30 chars each), 2 to 4 descriptions (90 chars each).',
    input_schema: {
      type: 'object',
      properties: {
        customerId: customerIdProp,
        adGroupId: { type: 'string', description: 'Ad group id, digits only.' },
        finalUrl: { type: 'string', description: 'The landing page this ad sends to.' },
        headlines: { type: 'array', items: { type: 'string' }, description: '3 to 15, each at most 30 characters.' },
        descriptions: { type: 'array', items: { type: 'string' }, description: '2 to 4, each at most 90 characters.' },
        path1: { type: 'string', description: 'Optional display path, at most 15 characters.' },
        path2: { type: 'string', description: 'Optional second display path, at most 15 characters.' },
        replaceExisting: { type: 'boolean', description: 'Remove the ad group\u2019s current enabled RSAs in the same change. Default false.' },
        validateOnly: validateOnlyProp,
      },
      required: ['customerId', 'adGroupId', 'finalUrl', 'headlines', 'descriptions'],
    },
    run: async (ctx, i) => {
      const adGroupId = digits(i.adGroupId, 'adGroupId')
      const url = String(i.finalUrl).trim()
      if (!/^https?:\/\//i.test(url)) throw new Error('finalUrl must start with http:// or https://')
      const headlines = (i.headlines as unknown[]).map((h) => String(h).trim()).filter(Boolean)
      const descriptions = (i.descriptions as unknown[]).map((d) => String(d).trim()).filter(Boolean)
      if (headlines.length < 3 || headlines.length > 15) throw new Error('3 to 15 headlines')
      if (descriptions.length < 2 || descriptions.length > 4) throw new Error('2 to 4 descriptions')
      const longHeadline = headlines.find((h) => h.length > 30)
      if (longHeadline) throw new Error(`headline over 30 characters: "${longHeadline}" (${longHeadline.length})`)
      const longDescription = descriptions.find((d) => d.length > 90)
      if (longDescription) throw new Error(`description over 90 characters: "${oneLine(longDescription, 40)}" (${longDescription.length})`)
      for (const [field, v] of [['path1', i.path1], ['path2', i.path2]] as const) {
        if (v !== undefined && String(v).length > 15) throw new Error(`${field} is at most 15 characters`)
      }
      const ops: MutateOperation<any>[] = []
      let removed = 0
      if (i.replaceExisting) {
        const rows = await query(
          ctx,
          `SELECT ad_group_ad.ad.id FROM ad_group_ad
           WHERE ad_group.id = ${adGroupId} AND ad_group_ad.status = 'ENABLED' AND ad_group_ad.ad.type = 'RESPONSIVE_SEARCH_AD'`
        )
        for (const row of rows) {
          ops.push({ entity: 'ad_group_ad', operation: 'remove', resource: res(ctx, 'adGroupAds', `${adGroupId}~${row.ad_group_ad.ad.id}`) })
          removed++
        }
      }
      ops.push({
        entity: 'ad_group_ad',
        operation: 'create',
        resource: {
          ad_group: res(ctx, 'adGroups', adGroupId),
          status: enums.AdGroupAdStatus.ENABLED,
          ad: {
            final_urls: [url],
            responsive_search_ad: {
              headlines: headlines.map((text) => ({ text })),
              descriptions: descriptions.map((text) => ({ text })),
              ...(i.path1 ? { path1: String(i.path1) } : {}),
              ...(i.path2 ? { path2: String(i.path2) } : {}),
            },
          },
        },
      })
      const what = `responsive search ad on ad group ${adGroupId} (${headlines.length} headlines, ${descriptions.length} descriptions${removed ? `, replacing ${removed}` : ''})`
      const r = await mutate(ctx, what, ops, i.validateOnly)
      return { result: { ...r, removed, headlines: headlines.length, descriptions: descriptions.length }, label: null }
    },
  },
  {
    name: 'create_search_campaign',
    description:
      'Build a NEW Search campaign from a spec Jacob approved, always PAUSED: budget, bidding, locations (Presence), ad groups with keywords and one responsive search ad each, campaign negatives. All or nothing. Run it with validateOnly first.',
    input_schema: {
      type: 'object',
      properties: {
        customerId: customerIdProp,
        spec: {
          type: 'object',
          description:
            '{ name, dailyBudget, bidding: "MANUAL_CPC" | "MAXIMIZE_CLICKS" | "MAXIMIZE_CONVERSIONS", cpcCeiling?, geoTargetConstantIds?: string[], languageIds?: string[] (1000 = English), radius?: {latitude, longitude, miles}, negatives?: string[], adGroups: [{ name, cpc, keywords: [{ text, matchType: "PHRASE" | "EXACT" | "BROAD" }], ad: { headlines: string[3-15], descriptions: string[2-4], finalUrl, path1?, path2? } }] }',
        },
        validateOnly: validateOnlyProp,
      },
      required: ['customerId', 'spec'],
    },
    run: async (ctx, i) => {
      const s = i.spec as Record<string, any>
      const fail = (m: string) => {
        throw new Error(`spec: ${m}`)
      }
      if (!s.name) fail('name is required')
      if (!(s.dailyBudget > 0)) fail('dailyBudget must be more than 0')
      if (!['MANUAL_CPC', 'MAXIMIZE_CLICKS', 'MAXIMIZE_CONVERSIONS'].includes(s.bidding)) fail('bidding must be MANUAL_CPC, MAXIMIZE_CLICKS or MAXIMIZE_CONVERSIONS')
      const geos: string[] = (s.geoTargetConstantIds ?? []).map((g: unknown) => digits(g, 'geoTargetConstantIds'))
      if (!geos.length && !s.radius) fail('give geoTargetConstantIds or radius')
      const languages: string[] = (s.languageIds ?? []).map((l: unknown) => digits(l, 'languageIds'))
      if (!Array.isArray(s.adGroups) || !s.adGroups.length) fail('at least one ad group')

      const budget = res(ctx, 'campaignBudgets', '-1')
      const campaign = res(ctx, 'campaigns', '-2')
      const bidding =
        s.bidding === 'MANUAL_CPC'
          ? { manual_cpc: { enhanced_cpc_enabled: false } }
          : s.bidding === 'MAXIMIZE_CLICKS'
            ? { target_spend: s.cpcCeiling > 0 ? { cpc_bid_ceiling_micros: micros(s.cpcCeiling) } : {} }
            : { maximize_conversions: {} }
      const ops: MutateOperation<any>[] = [
        { entity: 'campaign_budget', operation: 'create', resource: { resource_name: budget, name: `${s.name} budget`, amount_micros: micros(s.dailyBudget), delivery_method: enums.BudgetDeliveryMethod.STANDARD, explicitly_shared: false } },
        {
          entity: 'campaign',
          operation: 'create',
          resource: {
            resource_name: campaign,
            name: s.name,
            status: enums.CampaignStatus.PAUSED,
            advertising_channel_type: enums.AdvertisingChannelType.SEARCH,
            campaign_budget: budget,
            ...bidding,
            network_settings: { target_google_search: true, target_search_network: false, target_content_network: false, target_partner_search_network: false },
            geo_target_type_setting: { positive_geo_target_type: enums.PositiveGeoTargetType.PRESENCE },
            contains_eu_political_advertising: enums.EuPoliticalAdvertisingStatus.DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING,
          },
        },
        ...geos.map((g) => ({ entity: 'campaign_criterion' as const, operation: 'create' as const, resource: { campaign, location: { geo_target_constant: `geoTargetConstants/${g}` } } })),
        ...languages.map((l) => ({ entity: 'campaign_criterion' as const, operation: 'create' as const, resource: { campaign, language: { language_constant: `languageConstants/${l}` } } })),
        ...(s.radius
          ? [
              {
                entity: 'campaign_criterion' as const,
                operation: 'create' as const,
                resource: {
                  campaign,
                  proximity: {
                    geo_point: { latitude_in_micro_degrees: Math.round(s.radius.latitude * 1e6), longitude_in_micro_degrees: Math.round(s.radius.longitude * 1e6) },
                    radius: s.radius.miles,
                    radius_units: enums.ProximityRadiusUnits.MILES,
                  },
                },
              },
            ]
          : []),
        ...((s.negatives ?? []) as string[]).map((text) => ({
          entity: 'campaign_criterion' as const,
          operation: 'create' as const,
          resource: { campaign, negative: true, keyword: { text: String(text).toLowerCase(), match_type: enums.KeywordMatchType.PHRASE } },
        })),
      ]
      s.adGroups.forEach((g: Record<string, any>, n: number) => {
        const adGroup = res(ctx, 'adGroups', String(-3 - n))
        if (!g.name || !(g.cpc > 0)) fail(`ad group ${n + 1} needs a name and a cpc`)
        if (!g.ad?.finalUrl || (g.ad?.headlines ?? []).length < 3 || (g.ad?.descriptions ?? []).length < 2) fail(`ad group ${n + 1} needs an ad with a finalUrl, 3+ headlines and 2+ descriptions`)
        ops.push({ entity: 'ad_group', operation: 'create', resource: { resource_name: adGroup, name: g.name, campaign, status: enums.AdGroupStatus.ENABLED, type: enums.AdGroupType.SEARCH_STANDARD, cpc_bid_micros: micros(g.cpc) } })
        for (const k of g.keywords ?? []) {
          const mt = String(k.matchType ?? 'PHRASE').toUpperCase() as 'PHRASE' | 'EXACT' | 'BROAD'
          ops.push({ entity: 'ad_group_criterion', operation: 'create', resource: { ad_group: adGroup, status: enums.AdGroupCriterionStatus.ENABLED, keyword: { text: k.text, match_type: enums.KeywordMatchType[mt] } } })
        }
        ops.push({
          entity: 'ad_group_ad',
          operation: 'create',
          resource: {
            ad_group: adGroup,
            status: enums.AdGroupAdStatus.ENABLED,
            ad: {
              final_urls: [g.ad.finalUrl],
              responsive_search_ad: {
                headlines: g.ad.headlines.map((text: string) => ({ text })),
                descriptions: g.ad.descriptions.map((text: string) => ({ text })),
                ...(g.ad.path1 ? { path1: g.ad.path1 } : {}),
                ...(g.ad.path2 ? { path2: g.ad.path2 } : {}),
              },
            },
          },
        })
      })
      const what = `new PAUSED campaign "${s.name}" ($${s.dailyBudget}/day, ${s.adGroups.length} ad group${s.adGroups.length === 1 ? '' : 's'})`
      const r = await mutate(ctx, what, ops, i.validateOnly)
      return { result: r, label: null }
    },
  },
]

const APPLY_WRITES: Def[] = [
  {
    name: 'set_campaign_budget',
    description: 'Set a campaign’s daily budget in dollars. Refuses a shared budget.',
    input_schema: { type: 'object', properties: { customerId: customerIdProp, campaignId: campaignIdProp, dailyBudget: { type: 'number' }, validateOnly: validateOnlyProp }, required: ['customerId', 'campaignId', 'dailyBudget'] },
    run: async (ctx, i) => {
      const id = digits(i.campaignId, 'campaignId')
      if (!(i.dailyBudget > 0)) throw new Error('dailyBudget must be more than 0')
      const rows = await query(ctx, `SELECT campaign.campaign_budget, campaign_budget.amount_micros, campaign_budget.explicitly_shared, campaign_budget.reference_count FROM campaign WHERE campaign.id = ${id}`)
      if (!rows.length) throw new Error(`no campaign ${id} on this account`)
      const b = rows[0]
      if (b.campaign_budget.explicitly_shared || Number(b.campaign_budget.reference_count ?? 1) > 1) throw new Error('this budget is shared with other campaigns; change it in the UI')
      const what = `campaign ${id} budget $${usd(b.campaign_budget.amount_micros)} to $${i.dailyBudget}/day`
      const r = await mutate(ctx, what, [{ entity: 'campaign_budget', operation: 'update', resource: { resource_name: b.campaign.campaign_budget, amount_micros: micros(i.dailyBudget) } }], i.validateOnly)
      return { result: { ...r, from: usd(b.campaign_budget.amount_micros), to: i.dailyBudget }, label: null }
    },
  },
  {
    name: 'enable_campaign',
    description: 'Turn a paused campaign on.',
    input_schema: { type: 'object', properties: { customerId: customerIdProp, campaignId: campaignIdProp, validateOnly: validateOnlyProp }, required: ['customerId', 'campaignId'] },
    run: async (ctx, i) => {
      const id = digits(i.campaignId, 'campaignId')
      const r = await mutate(ctx, `enable campaign ${id}`, [{ entity: 'campaign', operation: 'update', resource: { resource_name: res(ctx, 'campaigns', id), status: enums.CampaignStatus.ENABLED } }], i.validateOnly)
      return { result: r, label: null }
    },
  },
  {
    name: 'set_campaign_end_date',
    description: 'Set the last day a campaign runs (YYYY-MM-DD, in the account’s time zone).',
    input_schema: { type: 'object', properties: { customerId: customerIdProp, campaignId: campaignIdProp, endDate: { type: 'string' }, validateOnly: validateOnlyProp }, required: ['customerId', 'campaignId', 'endDate'] },
    run: async (ctx, i) => {
      const id = digits(i.campaignId, 'campaignId')
      if (!/^\d{4}-\d{2}-\d{2}$/.test(i.endDate)) throw new Error('endDate must be YYYY-MM-DD')
      const what = `campaign ${id} end date to ${i.endDate}`
      const r = await mutate(ctx, what, [{ entity: 'campaign', operation: 'update', resource: { resource_name: res(ctx, 'campaigns', id), end_date_time: `${i.endDate} 23:59:59` } }], i.validateOnly)
      return { result: r, label: null }
    },
  },
  SET_AD_GROUP_CPC,
  SET_LOCATION_OPTION,
  {
    name: 'set_bidding_strategy',
    description: 'Switch a campaign’s bidding: MAXIMIZE_CLICKS with a max CPC ceiling, MANUAL_CPC, or MAXIMIZE_CONVERSIONS (optional target CPA).',
    input_schema: {
      type: 'object',
      properties: {
        customerId: customerIdProp,
        campaignId: campaignIdProp,
        strategy: { type: 'string', enum: ['MAXIMIZE_CLICKS', 'MANUAL_CPC', 'MAXIMIZE_CONVERSIONS'] },
        cpcCeiling: { type: 'number', description: 'Dollars. Required for MAXIMIZE_CLICKS.' },
        targetCpa: { type: 'number', description: 'Dollars. Optional for MAXIMIZE_CONVERSIONS.' },
        validateOnly: validateOnlyProp,
      },
      required: ['customerId', 'campaignId', 'strategy'],
    },
    run: async (ctx, i) => {
      const id = digits(i.campaignId, 'campaignId')
      let bidding: Record<string, unknown>
      if (i.strategy === 'MAXIMIZE_CLICKS') {
        if (!(i.cpcCeiling > 0)) throw new Error('MAXIMIZE_CLICKS needs cpcCeiling')
        bidding = { target_spend: { cpc_bid_ceiling_micros: micros(i.cpcCeiling) } }
      } else if (i.strategy === 'MANUAL_CPC') {
        bidding = { manual_cpc: { enhanced_cpc_enabled: false } }
      } else {
        bidding = { maximize_conversions: { target_cpa_micros: i.targetCpa > 0 ? micros(i.targetCpa) : 0 } }
      }
      const what = `campaign ${id} bidding to ${i.strategy}${i.cpcCeiling ? ` (max CPC $${i.cpcCeiling})` : ''}${i.targetCpa ? ` (target CPA $${i.targetCpa})` : ''}`
      const r = await mutate(ctx, what, [{ entity: 'campaign', operation: 'update', resource: { resource_name: res(ctx, 'campaigns', id), ...bidding } }], i.validateOnly)
      return { result: r, label: null }
    },
  },
  {
    name: 'remove_campaign_criterion',
    description: 'Remove one campaign criterion (a location, a negative keyword) by its criterion id from campaign_settings.',
    input_schema: { type: 'object', properties: { customerId: customerIdProp, campaignId: campaignIdProp, criterionId: { type: 'string' }, validateOnly: validateOnlyProp }, required: ['customerId', 'campaignId', 'criterionId'] },
    run: async (ctx, i) => {
      const id = digits(i.campaignId, 'campaignId')
      const crit = digits(i.criterionId, 'criterionId')
      const what = `remove criterion ${crit} from campaign ${id}`
      const r = await mutate(ctx, what, [{ entity: 'campaign_criterion', operation: 'remove', resource: res(ctx, 'campaignCriteria', `${id}~${crit}`) }], i.validateOnly)
      return { result: r, label: null }
    },
  },
]

export const ADS_READ_TOOLS = READS.map((t) => t.name)
export const ADS_WORK_TOOLS = WORK_WRITES.map((t) => t.name)
/** The tools a proposal's action may name: each one runs in apply mode after Jacob's Push. */
export const ADS_APPLY_TOOLS = APPLY_WRITES.map((t) => t.name)

/** A proposal's action and args, checked against the apply tool's schema (customerId is added at apply time). */
export function checkProposal(action: string, args: Record<string, unknown>): string | null {
  const tool = APPLY_WRITES.find((t) => t.name === action)
  if (!tool) return `action "${action}" is not one of ${ADS_APPLY_TOOLS.join(', ')}`
  if ('customerId' in args || 'validateOnly' in args) return 'args must not carry customerId or validateOnly'
  const schema = { ...tool.input_schema, required: (tool.input_schema.required ?? []).filter((k) => k !== 'customerId') }
  const invalid = validate(schema, args)
  return invalid ? `${action}: ${invalid}` : null
}

/** Same value for the apply lock: ids compare as digit strings, numbers by value. */
function sameArg(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' || typeof b === 'number') return Number(a) === Number(b)
  return String(a ?? '').replace(/-/g, '').toUpperCase() === String(b ?? '').replace(/-/g, '').toUpperCase()
}

/** The tools for one run: reads plus the mode's writes (apply: only ctx.allow). Every call is locked to ctx.customerId. */
export function adsTools(ctx: AdsToolContext): ClientTool[] {
  const writes = ctx.mode === 'work' ? [...WORK_WRITES, SET_ADS_STEP] : APPLY_WRITES.filter((t) => ctx.allow?.includes(t.name))
  // A work run with no account yet starts by finding and binding one.
  const account = ctx.mode === 'work' && ctx.findAccount ? [FIND_CLIENT_ACCOUNT, PEEK_ACCOUNT, BIND_ACCOUNT] : []
  const unlocked = new Set([...account, SET_ADS_STEP].map((t) => t.name))
  if (ctx.mode === 'apply' && !writes.length) throw new Error('apply mode needs the approved proposal’s tool in allow')
  const writeNames = new Set(writes.filter((t) => t !== SET_ADS_STEP).map((t) => t.name))
  return [...account, ...READS, ...writes].map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema,
    run: async (input) => {
      if (!unlocked.has(t.name) && !ctx.customerId) throw new Error('this run has no account yet: find_client_account, then bind_account')
      if (!unlocked.has(t.name) && String(input.customerId ?? '').replace(/-/g, '') !== ctx.customerId) {
        throw new Error(`this run works only on ${ctx.client} (customer ${ctx.customerId})`)
      }
      const isWrite = writeNames.has(t.name)
      if (isWrite && ctx.mode === 'apply') {
        const ok = ctx.approved?.action === t.name
        const want = ctx.approved?.args ?? {}
        const extra = Object.keys(input).filter((k) => k !== 'customerId' && k !== 'validateOnly' && !(k in want))
        const differ = Object.keys(want).filter((k) => !sameArg(input[k], want[k]))
        if (!ok || extra.length || differ.length) {
          throw new Error(`apply mode makes only the approved call: ${ctx.approved?.action}(${JSON.stringify(want)})`)
        }
      }
      const out = await t.run(ctx, input)
      if (isWrite) ctx.writes.push({ tool: t.name, changed: Boolean((out.result as { changed?: boolean })?.changed), args: input })
      return out
    },
  }))
}
